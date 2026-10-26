// Synchronous generation. Used for the single-plant gift format, and available
// as a fallback for the others. The care guide and both gift guides normally go
// through generate-background, because each can outrun Netlify's 60 second
// synchronous limit, which cannot be configured. This handler is format
// agnostic and still accepts any article type.
//
// ORDER OF CHECKS. Authorisation first, then validation, then the usage limit,
// then the prompt pack, and only then the model. A caller without a valid
// session never reaches storage, the prompt pack or the AI service.

const { validateRequest, ValidationError } = require('./lib/validate');
const { runGeneration } = require('./lib/run-generation');
const { createTimer, logTiming, logEvent } = require('./lib/timing');
const { authorizeRequest } = require('./lib/session');
const limits = require('./lib/limits');
const { generationPaused, PAUSED } = require('./lib/maintenance');
const counters = require('./lib/counter-store');
const prompts = require('./lib/prompt-pack');

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

  const auth = await authorizeRequest(event);
  if (!auth.ok) {
    logEvent('request_refused', { fn: 'generate', reason: auth.reason });
    return json(auth.status, { error: auth.error, code: auth.code });
  }
  const sid = auth.session.sid;

  // Maintenance pause: refused after the session check, before anything else.
  if (generationPaused()) {
    logEvent('request_refused', { fn: 'generate', reason: 'maintenance' });
    return json(PAUSED.status, { error: PAUSED.error, code: PAUSED.code });
  }

  const timer = createTimer();

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid request body', code: 'bad_request' });
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

  // The prompt pack and the usage counters both live in Netlify Blobs. Without
  // the Blobs context there is no pack, so there is no prompt to send.
  try {
    prompts.connectPromptStore(event);
    counters.connectCounters(event);
  } catch (err) {
    console.error('Blobs context unavailable:', err && err.message);
    return json(prompts.PACK_FAILURE.status, { error: prompts.PACK_FAILURE.error, code: prompts.PACK_FAILURE.code });
  }

  const allowance = await limits.checkGenerationAllowance(sid);
  if (!allowance.allowed) {
    logEvent('generation_rate_limited', { sid, scope: allowance.scope });
    return json(allowance.status || 429, { error: allowance.error, code: allowance.code });
  }

  let pack;
  try {
    pack = await prompts.loadActivePack();
  } catch (err) {
    // A routing refusal names its reason (a deploy context and a channel name,
    // never prompt content), so a preview's refusal can be confirmed in the log.
    console.error('Prompt pack unavailable:', err && err.code, err && err.reason ? `(Prompt-pack channel refused: ${err.reason})` : '');
    return json(prompts.PACK_FAILURE.status, { error: prompts.PACK_FAILURE.error, code: prompts.PACK_FAILURE.code });
  }

  try {
    await limits.recordGeneration(sid);
  } catch (err) {
    return json(err.status || 503, { error: err.safeMessage, code: err.code });
  }
  const result = await runGeneration({ articleType, fields, apiKey, timer, pack });

  logTiming('generate', timer, {
    articleType,
    productCount: (fields.selectedProducts || []).length,
    recommendationCount: fields.numberOfRecommendations,
    articleChars: result.ok ? result.payload.html.length : 0,
    truncated: result.ok ? result.payload.truncated : false,
    ok: result.ok,
    promptVersion: pack.version,
    sid
  });

  if (!result.ok) {
    return json(result.status, { error: result.error, code: result.code });
  }
  return json(200, result.payload);
};
