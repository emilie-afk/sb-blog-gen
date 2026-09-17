// Background generation. Netlify runs any function whose name ends in
// "-background" asynchronously: it answers an EMPTY 202 immediately, before this
// handler necessarily runs, and then gives the handler up to 15 minutes. A long
// gift guide is therefore no longer racing the 60 second synchronous limit.
//
// The browser never sees anything this handler returns: Netlify's 202 has no
// body. That is why the browser mints the job id and keeps using its own, and
// why every outcome, including a start failure, is written to the job store
// where generate-status can report it. The returned value below exists only for
// local tests and for the function log.

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

  // The browser's id is used when it is well formed, so the poll and the record
  // agree. A missing or malformed id still gets a job, it just cannot be polled.
  const parsedId = jobs.parseJobId(payload.jobId);
  const jobId = parsedId.valid ? parsedId.jobId : jobs.newJobId();

  await jobs.createPending(jobId, {
    articleType,
    recommendationCount: fields.numberOfRecommendations
  });

  // Netlify has already answered the browser with an empty 202, so every outcome
  // from here on reaches the user only through the job record.
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
