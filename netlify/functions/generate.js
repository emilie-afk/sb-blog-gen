// Synchronous generation. Used for the care guide and single-plant formats, and
// available as a fallback for the list formats. The list formats normally go
// through generate-background, because a long gift guide can outrun Netlify's
// 60 second synchronous limit, which cannot be configured.

const { validateRequest, ValidationError } = require('./lib/validate');
const { runGeneration } = require('./lib/run-generation');
const { createTimer, logTiming } = require('./lib/timing');

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

  // Verify the session token before doing anything else.
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword || payload.token !== sitePassword) {
    return json(401, { error: 'Your session has expired. Please sign in again.', code: 'unauthorized' });
  }

  let articleType, fields;
  const validationStart = timer.start();
  try {
    ({ articleType, fields } = validateRequest(payload.articleType, payload.fields));
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { error: err.message, code: err.code });
    }
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

  const result = await runGeneration({ articleType, fields, apiKey, timer });

  logTiming('generate', timer, {
    articleType,
    productCount: (fields.selectedProducts || []).length,
    recommendationCount: fields.numberOfRecommendations,
    articleChars: result.ok ? result.payload.html.length : 0,
    truncated: result.ok ? result.payload.truncated : false,
    ok: result.ok
  });

  if (!result.ok) {
    return json(result.status, { error: result.error, code: result.code });
  }
  return json(200, result.payload);
};
