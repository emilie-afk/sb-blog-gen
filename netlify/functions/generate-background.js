// Background generation. Netlify runs any function whose name ends in
// "-background" asynchronously: it answers 202 immediately and then has up to
// 15 minutes, so a long gift guide is no longer racing the 60 second
// synchronous limit. The result is written to the job store and the browser
// polls generate-status.
//
// The browser calls this directly. It returns 202 with the job id, and every
// outcome after that lives in the job record.

const { validateRequest, ValidationError } = require('./lib/validate');
const { runGeneration } = require('./lib/run-generation');
const { createTimer, logTiming } = require('./lib/timing');
const jobs = require('./lib/job-store');

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const timer = createTimer();

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

  let articleType, fields;
  const validationStart = timer.start();
  try {
    ({ articleType, fields } = validateRequest(payload.articleType, payload.fields));
  } catch (err) {
    if (err instanceof ValidationError) return json(400, { error: err.message, code: err.code });
    return json(400, { error: 'Invalid request fields.', code: 'invalid_input' });
  }
  timer.record('validation', timer.since(validationStart));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: 'ANTHROPIC_API_KEY environment variable is not configured on Netlify.',
      code: 'server_config'
    });
  }

  const jobId = typeof payload.jobId === 'string' && /^job_[a-z0-9_]{8,64}$/.test(payload.jobId)
    ? payload.jobId
    : jobs.newJobId();

  await jobs.createPending(jobId, {
    articleType,
    recommendationCount: fields.numberOfRecommendations
  });

  // A background invocation's return value is never seen by the browser, so
  // every outcome is written to the job record instead.
  try {
    const result = await runGeneration({ articleType, fields, apiKey, timer });
    const timing = logTiming('generate-background', timer, {
      articleType,
      productCount: (fields.selectedProducts || []).length,
      recommendationCount: fields.numberOfRecommendations,
      articleChars: result.ok ? result.payload.html.length : 0,
      truncated: result.ok ? result.payload.truncated : false,
      ok: result.ok,
      jobId
    });

    if (result.ok) await jobs.completeJob(jobId, result.payload, timing);
    else await jobs.failJob(jobId, result.error, result.code, timing);
  } catch (err) {
    console.error('Background generation crashed:', err && err.message);
    await jobs.failJob(jobId, 'The generation job stopped unexpectedly. Please try again.', 'ai_failure',
      timer.summary());
  }

  return json(202, { jobId, status: 'accepted' });
};
