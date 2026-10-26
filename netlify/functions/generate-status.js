// Job status for background generation. The browser polls this with the job id
// it minted. Four states reach the browser: pending, complete, failed and
// expired. Nothing here exposes prompts, credentials or stack traces.
//
// ACCESS SCOPE. A job id is a reference, not a permission. The record carries
// the session id that created it, and a caller whose signed session does not
// match is told the job is not available, in exactly the words used for a job
// that has gone. Guessing or capturing an id therefore yields nothing: not the
// article, not the error, and not even confirmation that the job exists.
//
// Startup race: Netlify answers a background invocation with an empty 202 before
// the handler has necessarily run, so the first status poll can easily arrive
// before createPending has written anything. A missing record is therefore
// treated as pending until the job is older than STARTUP_GRACE_MS, measured from
// the submit time encoded in the job id. Only after that does a missing record
// mean the job is gone.

const jobs = require('./lib/job-store');
const { logEvent } = require('./lib/timing');
const { authorizeRequest } = require('./lib/session');

// Cold start, queueing and the first blob write. Generous on purpose: being a
// little slow to report a genuinely lost job costs nothing, whereas calling a
// starting job expired ends the poll and loses the user's generation.
const STARTUP_GRACE_MS = 90 * 1000;

const GONE = jobId => ({
  jobId,
  status: 'expired',
  error: 'That generation is no longer available. Your brief and confirmed products are still here, so you can generate again.',
  code: 'job_expired'
});

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Before parsing and before the store: no session, no access.
  const auth = await authorizeRequest(event);
  if (!auth.ok) {
    logEvent('request_refused', { fn: 'generate-status', reason: auth.reason });
    return json(auth.status, { error: auth.error, code: auth.code });
  }
  const sid = auth.session.sid;

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid request body', code: 'bad_request' });
  }

  // Lambda compatibility: connect the Blobs context before any store access.
  // Without this the store throws, and reporting job_store_unavailable is the
  // honest answer; silently reading process memory would always miss the record,
  // because the background function ran in a different instance.
  try {
    const { connected } = jobs.connectJobStore(event);
    logEvent('blob_context_connected', { connected });
  } catch (err) {
    console.error('Blobs context unavailable:', err && err.message);
    return json(502, {
      error: 'The job store is not available. Try generating again.',
      code: 'job_store_unavailable'
    });
  }

  // The id carries its own submit time. An unparseable or implausible id is
  // rejected here and never reaches the store.
  const parsed = jobs.parseJobId(payload.jobId);
  if (!parsed.valid) {
    return json(400, { error: 'That job reference is not valid.', code: 'bad_job_id' });
  }
  const jobId = parsed.jobId;

  let record;
  try {
    record = await jobs.get(jobId);
  } catch (err) {
    console.error('Job store read failed:', err && err.message);
    return json(502, {
      error: 'The job store could not be read. Try generating again.',
      code: 'job_store_unavailable'
    });
  }

  // Somebody else's job reads as a job that is gone. Same status, same code,
  // same message, so the response cannot be used to probe for ids.
  if (record && !jobs.isReadableBy(record, sid)) {
    logEvent('job_scope_mismatch', { jobId, sid });
    return json(200, GONE(jobId));
  }

  // No record yet. Inside the startup grace period this is the normal race with
  // a cold starting background function, not a lost job. Nothing is disclosed
  // here either way: a pending answer carries no data, and it is also the
  // answer for an id nobody has used.
  if (!record) {
    if (parsed.ageMs <= STARTUP_GRACE_MS) {
      return json(200, {
        jobId,
        status: 'pending',
        startedAt: new Date(parsed.submittedAt).toISOString(),
        elapsedMs: parsed.ageMs,
        starting: true
      });
    }
    return json(200, GONE(jobId));
  }

  if (jobs.isExpired(record) && record.status === 'pending') {
    return json(200, {
      jobId,
      status: 'expired',
      error: 'That generation did not finish in time. Everything you entered is still here, so you can generate again.',
      code: 'job_expired'
    });
  }

  if (record.status === 'pending') {
    return json(200, {
      jobId,
      status: 'pending',
      startedAt: record.createdAt,
      elapsedMs: Date.now() - new Date(record.createdAt).getTime()
    });
  }

  if (record.status === 'failed') {
    return json(200, {
      jobId,
      status: 'failed',
      error: record.error || 'The generation failed.',
      code: record.code || 'ai_failure'
    });
  }

  // Only the finished article payload is returned. The record's scope, prompt
  // version and timing stay on the server.
  return json(200, Object.assign({ jobId, status: 'complete' }, record.result));
};
