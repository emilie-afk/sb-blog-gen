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
//
// A refusal that happens BEFORE the job is claimed (no session, bad CSRF value,
// invalid fields, usage limit, missing prompt pack) cannot reach the browser
// through the 202 either. Those that the browser can do something about are
// written to the job store as a failed record under the browser's own job id,
// so the poll reports them. An unauthenticated call writes nothing at all: the
// store is not touched for a caller who has not proved who they are.
//
// PINNING. The prompt pack is loaded once, here, and its version is stamped on
// the job record. The same in-memory pack is used for the whole run, so a new
// pack activated while this job is running cannot change it.
//
// OWNERSHIP. claim() is a single conditional create decided by the storage
// service, so among any number of concurrent submissions of one job id, from any
// sessions and any function instances, exactly one wins. Only the winner calls
// the model, and the winner's own record (and so its session scope) is what the
// terminal record is built from. A double click, a retry, a replay, or another
// session guessing the id all cost nothing and can neither read nor overwrite
// the result. Nothing here depends on the browser disabling its button.

const { validateRequest, ValidationError } = require('./lib/validate');
const { runGeneration } = require('./lib/run-generation');
const { createTimer, logTiming, logEvent } = require('./lib/timing');
const { authorizeRequest } = require('./lib/session');
const jobs = require('./lib/job-store');
const limits = require('./lib/limits');
const { generationPaused, PAUSED } = require('./lib/maintenance');
const counters = require('./lib/counter-store');
const prompts = require('./lib/prompt-pack');

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

// Records a refusal the browser should hear about, under the browser's job id
// and the caller's scope. Best effort: if even this fails, the browser's poll
// runs into the startup grace period and reports the job as gone.
async function refuse(jobId, sid, error, code, status) {
  if (jobId) {
    try {
      // Only written if this caller wins the id; a refusal never touches a job
      // that someone else owns.
      const claimed = await jobs.claim(jobId, { scope: sid });
      if (claimed.created) await jobs.failJob(jobId, error, code, null, claimed.record);
    } catch (err) {
      console.error('Refusal could not be recorded:', err && err.message);
    }
  }
  logEvent('generation_failed', { jobId, code });
  return json(status, { error, code });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Before anything else, including parsing. No session, no work and no store
  // access.
  const auth = await authorizeRequest(event);
  if (!auth.ok) {
    logEvent('request_refused', { fn: 'generate-background', reason: auth.reason });
    return json(auth.status, { error: auth.error, code: auth.code });
  }
  const sid = auth.session.sid;

  const timer = createTimer();

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid request body', code: 'bad_request' });
  }

  // Lambda compatibility: the Blobs context lives on the invocation, so it has
  // to be connected before anything can reach the store. A failure here is fatal
  // by design: without a durable store the job would be written to process
  // memory that generate-status can never read.
  try {
    const { connected } = jobs.connectJobStore(event);
    counters.connectCounters(event);
    prompts.connectPromptStore(event);
    logEvent('blob_context_connected', { connected });
  } catch (err) {
    console.error('Blobs context unavailable:', err && err.message);
    logEvent('generation_failed', { code: 'job_store_unavailable' });
    return json(500, {
      error: 'The job store is not available in this environment.',
      code: 'job_store_unavailable'
    });
  }

  // The browser's id is used when it is well formed, so the poll and the record
  // agree. A missing or malformed id is replaced only so the run can be recorded
  // and logged: the browser has no way to learn the replacement, because Netlify
  // returns an empty 202, so that run is not reachable by polling and the user
  // sees it expire. In practice the browser always sends a well formed id.
  const parsedId = jobs.parseJobId(payload.jobId);
  const jobId = parsedId.valid ? parsedId.jobId : jobs.newJobId();

  // Maintenance pause. Netlify has already answered the browser with an empty
  // 202, so the pause is written onto this caller's job, where the status poll
  // reports it, before validation, the prompt pack or the model.
  if (generationPaused()) {
    logEvent('request_refused', { fn: 'generate-background', reason: 'maintenance' });
    return refuse(jobId, sid, PAUSED.error, PAUSED.code, PAUSED.status);
  }

  let articleType, fields;
  const validationStart = timer.start();
  try {
    ({ articleType, fields } = validateRequest(payload.articleType, payload.fields));
  } catch (err) {
    if (err instanceof ValidationError) return refuse(jobId, sid, err.message, err.code, 400);
    return refuse(jobId, sid, 'Invalid request fields.', 'invalid_input', 400);
  }
  timer.record('validation', timer.since(validationStart));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return refuse(jobId, sid, 'ANTHROPIC_API_KEY environment variable is not configured on Netlify.', 'server_config', 500);
  }

  // A duplicate is recognised before the usage limit is checked, so a repeated
  // submission neither starts a second generation nor spends allowance.
  let existing;
  try {
    existing = await jobs.get(jobId);
  } catch (err) {
    console.error('Job store read failed:', err && err.message);
    return json(500, { error: 'The job store could not be read.', code: 'job_store_unavailable' });
  }
  if (existing) {
    logEvent('duplicate_submission', { jobId, sid });
    return json(202, { jobId, status: 'accepted', duplicate: true });
  }

  const allowance = await limits.checkGenerationAllowance(sid);
  if (!allowance.allowed) {
    logEvent('generation_rate_limited', { sid, scope: allowance.scope });
    return refuse(jobId, sid, allowance.error, allowance.code, allowance.status || 429);
  }

  let pack;
  try {
    pack = await prompts.loadActivePack();
  } catch (err) {
    // A routing refusal names its reason (a deploy context and a channel name,
    // never prompt content), so a preview's refusal can be confirmed in the log.
    console.error('Prompt pack unavailable:', err && err.code, err && err.reason ? `(Prompt-pack channel refused: ${err.reason})` : '');
    return refuse(jobId, sid, prompts.PACK_FAILURE.error, prompts.PACK_FAILURE.code, prompts.PACK_FAILURE.status);
  }

  // The claim is the single point of ownership (see OWNERSHIP above). A write
  // failure is fatal: without a record the job could not be polled.
  let owner;
  try {
    const claimed = await jobs.claim(jobId, {
      articleType,
      recommendationCount: fields.numberOfRecommendations,
      scope: sid,
      promptVersion: pack.version
    });
    if (!claimed.created) {
      logEvent('duplicate_submission', { jobId, sid });
      return json(202, { jobId, status: 'accepted', duplicate: true });
    }
    owner = claimed.record;
    logEvent('pending_record_written', { jobId, articleType, recommendationCount: fields.numberOfRecommendations, promptVersion: pack.version });
  } catch (err) {
    console.error('Pending record could not be written:', err && err.message);
    logEvent('generation_failed', { jobId, code: 'job_store_unavailable' });
    return json(500, {
      error: 'The job store could not be written to.',
      code: 'job_store_unavailable'
    });
  }

  try {
    await limits.recordGeneration(sid);
  } catch (err) {
    // This caller owns the job, so the refusal goes onto its own record.
    try { await jobs.failJob(jobId, err.safeMessage, err.code, null, owner); } catch { /* the poll will expire it */ }
    logEvent('generation_failed', { jobId, code: err.code });
    return json(err.status || 503, { error: err.safeMessage, code: err.code });
  }

  logEvent('generation_started', {
    jobId, articleType, sid, promptVersion: pack.version,
    productCount: (fields.selectedProducts || []).length,
    recommendationCount: fields.numberOfRecommendations
  });

  // Netlify has already answered the browser with an empty 202, so every outcome
  // from here on reaches the user only through the job record.
  try {
    const result = await runGeneration({ articleType, fields, apiKey, timer, pack });
    const timing = logTiming('generate-background', timer, {
      articleType,
      productCount: (fields.selectedProducts || []).length,
      recommendationCount: fields.numberOfRecommendations,
      articleChars: result.ok ? result.payload.html.length : 0,
      truncated: result.ok ? result.payload.truncated : false,
      ok: result.ok,
      jobId,
      promptVersion: pack.version
    });

    if (result.ok) {
      await jobs.completeJob(jobId, result.payload, timing, owner);
      logEvent('generation_completed', {
        jobId, articleType,
        articleChars: result.payload.html.length,
        truncated: result.payload.truncated,
        elapsedMs: timing.totalMs
      });
    } else {
      await jobs.failJob(jobId, result.error, result.code, timing, owner);
      logEvent('generation_failed', { jobId, articleType, code: result.code, elapsedMs: timing.totalMs });
    }
  } catch (err) {
    console.error('Background generation crashed:', err && err.message);
    logEvent('generation_failed', { jobId, articleType, code: 'ai_failure', elapsedMs: timer.totalMs() });
    // A terminal record is the only way the user hears about this. If even that
    // write fails there is nothing further to do but log it: the poll will time
    // out on the client side rather than hang forever.
    try {
      await jobs.failJob(jobId, 'The generation job stopped unexpectedly. Please try again.', 'ai_failure',
        timer.summary(), owner);
    } catch (storeErr) {
      console.error('Failure record could not be written:', storeErr && storeErr.message);
      logEvent('generation_failed', { jobId, code: 'job_store_unavailable' });
    }
  }

  return json(202, { jobId, status: 'accepted' });
};
