// Job status for background generation. The browser polls this with the job id
// it minted. Four states reach the browser: pending, complete, failed and
// expired. Nothing here exposes prompts, credentials or stack traces.
//
// Startup race: Netlify answers a background invocation with an empty 202 before
// the handler has necessarily run, so the first status poll can easily arrive
// before createPending has written anything. A missing record is therefore
// treated as pending until the job is older than STARTUP_GRACE_MS, measured from
// the submit time encoded in the job id. Only after that does a missing record
// mean the job is gone.

const jobs = require('./lib/job-store');
const { logEvent } = require('./lib/timing');

// Cold start, queueing and the first blob write. Generous on purpose: being a
// little slow to report a genuinely lost job costs nothing, whereas calling a
// starting job expired ends the poll and loses the user's generation.
const STARTUP_GRACE_MS = 90 * 1000;

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

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid request body', code: 'bad_request' });
  }

  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword || payload.token !== sitePassword) {
    return json(401, { error: 'Your session has expired. Please sign in again.', code: 'unauthorized' });
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

  // No record yet. Inside the startup grace period this is the normal race with
  // a cold starting background function, not a lost job.
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
    return json(200, {
      jobId,
      status: 'expired',
      error: 'That generation is no longer available. Your brief and confirmed products are still here, so you can generate again.',
      code: 'job_expired'
    });
  }

  if (jobs.isExpired(record) && record.status === 'pending') {
    return json(200, {
      jobId,
      status: 'expired',
      error: 'That generation did not finish in time. Your brief and confirmed products are still here, so you can generate again with fewer recommendations.',
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

  return json(200, Object.assign({ jobId, status: 'complete' }, record.result));
};
