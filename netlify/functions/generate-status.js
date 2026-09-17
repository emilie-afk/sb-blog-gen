// Job status for background generation. The browser polls this with the job id
// it was given. Four states reach the browser: pending, complete, failed and
// expired. Nothing here exposes prompts, credentials or stack traces.

const jobs = require('./lib/job-store');

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

  const jobId = typeof payload.jobId === 'string' ? payload.jobId.trim() : '';
  if (!/^job_[a-z0-9_]{8,64}$/.test(jobId)) {
    return json(400, { error: 'That job reference is not valid.', code: 'bad_job_id' });
  }

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

  // No record: either it was never created, or the store dropped it.
  if (!record) {
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
