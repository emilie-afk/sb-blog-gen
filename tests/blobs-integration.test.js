// Netlify Blobs integration for the background job store.
//
// The production failure this covers: the handlers export a Lambda style
// handler, so @netlify/blobs needs connectLambda(event) before getStore(). It
// was never called, getStore() threw MissingBlobsEnvironmentError, and the store
// silently fell back to a process-local Map. generate-background and
// generate-status run in different instances, so the status function never saw
// the record and every job expired after the grace period.
//
// @netlify/blobs is stubbed here so the call order and the failure modes can be
// asserted without the platform. The stub mirrors the real module's shape:
// getStore() throws unless connectLambda() has run.
//
// Run: node tests/blobs-integration.test.js

const path = require('path');
const ROOT = path.join(__dirname, '..');
const results = [];
const check = (name, cond, extra) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : ''));

// ── Stub @netlify/blobs with the real module's contract ──────────
const blobsPath = require.resolve('@netlify/blobs', { paths: [ROOT] });
const calls = [];
// One shared backing map across every "instance": that is what a real durable
// store gives, and what a process-local Map cannot.
const durable = new Map();
let contextConnected = false;
let readShouldThrow = false;
let writeShouldThrow = false;

const blobsStub = {
  connectLambda(event) {
    if (!event || typeof event.blobs !== 'string' || !event.blobs) {
      throw new Error('event.blobs is missing');
    }
    calls.push('connectLambda');
    contextConnected = true;
  },
  getStore(options) {
    calls.push('getStore');
    if (!contextConnected) {
      const err = new Error('The environment has not been configured to use Netlify Blobs. To use it manually, supply the following properties when creating a store: siteID, token');
      err.name = 'MissingBlobsEnvironmentError';
      throw err;
    }
    // The real client throws BlobsConsistencyError on a strong read without
    // uncachedEdgeURL, which connectLambda does not provide at any version.
    if (options && options.consistency === 'strong') {
      const err = new Error("Netlify Blobs has failed to perform a read using strong consistency because the environment has not been configured with a 'uncachedEdgeURL' property");
      err.name = 'BlobsConsistencyError';
      throw err;
    }
    return {
      async set(key, value) {
        if (writeShouldThrow) throw new Error('blob write failed');
        durable.set(key, value);
      },
      async get(key) {
        if (readShouldThrow) throw new Error('blob read failed');
        return durable.has(key) ? durable.get(key) : null;
      }
    };
  }
};
require.cache[blobsPath] = { id: blobsPath, filename: blobsPath, loaded: true, exports: blobsStub };

// ── Stub the Anthropic SDK so a job can actually finish ──────────
const sdkPath = require.resolve('@anthropic-ai/sdk', { paths: [ROOT] });
const behaviour = { articleFail: false };
function articleHtml() {
  return '<p style="font-size:12px;color:#888;">Updated September 2026</p>' +
    '<h3 style="color:#34bfa2"><a href="https://succulentsbox.com/products/gift-box-1">Gift Box 1</a></h3>' +
    '<table><thead><tr><th>Gift</th><th>Best for</th><th>Light</th><th>Care level</th></tr></thead>' +
    '<tbody><tr><td>Gift Box 1</td><td>a</td><td>b</td><td>c</td></tr></tbody></table>' +
    '<p>Care basics and questions.</p>'.repeat(8);
}
class FakeAnthropic {
  constructor() {
    this.messages = {
      create: async (opts) => {
        const isArticle = opts.max_tokens > 1000;
        if (isArticle && behaviour.articleFail) throw new Error('overloaded');
        return {
          stop_reason: 'end_turn',
          content: [{ text: isArticle ? articleHtml() : '{"title":"T","alternative_titles":["A","B"],"excerpt":"One. Two.","meta_description":"M","articles":[]}' }]
        };
      }
    };
  }
}
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: FakeAnthropic };

process.env.SITE_PASSWORD = 'pw';
process.env.ANTHROPIC_API_KEY = 'k';

const jobs = require(path.join(ROOT, 'netlify/functions/lib/job-store'));
const background = require(path.join(ROOT, 'netlify/functions/generate-background'));
const status = require(path.join(ROOT, 'netlify/functions/generate-status'));
const { LIFECYCLE_EVENTS, EVENT_FACTS } = require(path.join(ROOT, 'netlify/functions/lib/timing'));

// ── Capture every log line these handlers emit ───────────────────
const logged = [];
const realLog = console.log;
const realWarn = console.warn;
const realError = console.error;
console.log = (...a) => { logged.push(String(a[0])); };
console.warn = (...a) => { logged.push(String(a[0]) + ' ' + a.slice(1).join(' ')); };
console.error = (...a) => { logged.push(String(a[0]) + ' ' + a.slice(1).join(' ')); };

// A Lambda event carrying a Blobs context, as Netlify supplies it.
const lambdaEvent = (body) => ({
  httpMethod: 'POST',
  blobs: Buffer.from(JSON.stringify({ url: 'https://example.invalid/blobs', token: 'blob-token' })).toString('base64'),
  headers: { 'x-nf-site-id': 'site-id', 'x-nf-deploy-id': 'deploy-id' },
  body: JSON.stringify(body)
});

const products = n => Array.from({ length: n }, (_, i) => ({
  title: 'Gift Box ' + (i + 1),
  url: 'https://succulentsbox.com/products/gift-box-' + (i + 1),
  price: '$41.00',
  source: 'live-gift-catalog'
}));
const fields = n => ({ recipient: 'Coworkers', numberOfRecommendations: n, selectedProducts: products(n) });

(async () => {
  // ── 1. connectLambda runs before getStore, in both handlers ────
  calls.length = 0;
  contextConnected = false;
  const jobId = jobs.newJobId();
  await background.handler(lambdaEvent({ token: 'pw', jobId, articleType: 'general_gift_guide', fields: fields(2) }));
  check('background: connectLambda is called', calls.includes('connectLambda'));
  check('background: connectLambda precedes getStore',
    calls.indexOf('connectLambda') < calls.indexOf('getStore'), calls.slice(0, 4).join(' -> '));

  calls.length = 0;
  contextConnected = false;
  const statusRes = await status.handler(lambdaEvent({ token: 'pw', jobId }));
  check('status: connectLambda is called', calls.includes('connectLambda'));
  check('status: connectLambda precedes getStore',
    calls.indexOf('connectLambda') < calls.indexOf('getStore'), calls.slice(0, 4).join(' -> '));

  // ── 2. The two instances share the durable store ───────────────
  const body = JSON.parse(statusRes.body);
  check('the status instance reads the record the background instance wrote',
    body.status === 'complete' && typeof body.html === 'string' && body.html.includes('<table'),
    body.status + ' ' + (body.code || ''));
  check('the completed job carries its products', body.products && body.products.length === 2);
  check('nothing was stored in process memory', !jobs.useMemoryStoreForTests.called);

  // ── 3. A pending record is readable before the job finishes ────
  contextConnected = false;
  const pendingId = jobs.newJobId();
  jobs.connectJobStore(lambdaEvent({}));
  await jobs.createPending(pendingId, { articleType: 'occasion_gift_guide', recommendationCount: 4 });
  const pending = JSON.parse((await status.handler(lambdaEvent({ token: 'pw', jobId: pendingId }))).body);
  check('a new pending record is immediately readable',
    pending.status === 'pending' && pending.starting !== true, JSON.stringify(pending.status));

  // ── 4. Terminal records land on their own key ──────────────────
  // Eventual consistency makes a NEW key visible at once but an UPDATE can lag
  // up to 60 seconds, so complete and failed are written as new keys.
  await jobs.completeJob(pendingId, { html: '<p>x</p>', products: [], warnings: [] }, { totalMs: 1 });
  check('the terminal record is a separate key', durable.has(pendingId + jobs.RESULT_SUFFIX));
  check('the pending key is left alone', JSON.parse(durable.get(pendingId)).status === 'pending');
  const completed = JSON.parse((await status.handler(lambdaEvent({ token: 'pw', jobId: pendingId }))).body);
  check('completion becomes visible to status', completed.status === 'complete');

  const failId = jobs.newJobId();
  await jobs.createPending(failId, { articleType: 'general_gift_guide', recommendationCount: 1 });
  await jobs.failJob(failId, 'The AI service could not generate the article.', 'ai_failure', { totalMs: 1 });
  const failedBody = JSON.parse((await status.handler(lambdaEvent({ token: 'pw', jobId: failId }))).body);
  check('failure becomes visible to status',
    failedBody.status === 'failed' && failedBody.code === 'ai_failure', failedBody.status);

  // ── 5. Missing Blobs context: report, never fall back ──────────
  contextConnected = false;
  const noContext = { httpMethod: 'POST', headers: {}, body: JSON.stringify({ token: 'pw', jobId }) };
  const statusNoCtx = await status.handler(noContext);
  check('status without Blobs context returns job_store_unavailable',
    statusNoCtx.statusCode === 502 && JSON.parse(statusNoCtx.body).code === 'job_store_unavailable',
    statusNoCtx.statusCode + ' ' + statusNoCtx.body.slice(0, 60));

  const bgNoCtx = await background.handler({
    httpMethod: 'POST', headers: {},
    body: JSON.stringify({ token: 'pw', jobId: jobs.newJobId(), articleType: 'general_gift_guide', fields: fields(1) })
  });
  check('background without Blobs context refuses to run',
    bgNoCtx.statusCode === 500 && JSON.parse(bgNoCtx.body).code === 'job_store_unavailable',
    String(bgNoCtx.statusCode));
  check('no job was written anywhere during those failures',
    ![...durable.keys()].some(k => k.includes('undefined')));

  // ── 6. Store read and write failures surface ───────────────────
  contextConnected = false;
  readShouldThrow = true;
  const readFail = await status.handler(lambdaEvent({ token: 'pw', jobId }));
  check('a blob read failure returns job_store_unavailable',
    readFail.statusCode === 502 && JSON.parse(readFail.body).code === 'job_store_unavailable');
  readShouldThrow = false;

  contextConnected = false;
  writeShouldThrow = true;
  const writeFail = await background.handler(lambdaEvent({
    token: 'pw', jobId: jobs.newJobId(), articleType: 'general_gift_guide', fields: fields(1)
  }));
  check('a blob write failure stops the job with job_store_unavailable',
    writeFail.statusCode === 500 && JSON.parse(writeFail.body).code === 'job_store_unavailable',
    String(writeFail.statusCode));
  writeShouldThrow = false;

  // ── 7. Strong consistency is not requested ─────────────────────
  // connectLambda supplies siteID, token, edgeURL and deployID but never
  // uncachedEdgeURL, and the client throws on a strong read without it. The stub
  // above throws for consistency: 'strong', so reaching this point proves the
  // store does not ask for it.
  contextConnected = false;
  jobs.connectJobStore(lambdaEvent({}));
  let consistencyError = null;
  try { jobs.getStore(); } catch (err) { consistencyError = err.name; }
  check('the store does not request strong consistency', consistencyError === null, String(consistencyError));

  // ── 8. The startup race still behaves ──────────────────────────
  contextConnected = false;
  const freshId = jobs.newJobId();
  const early = JSON.parse((await status.handler(lambdaEvent({ token: 'pw', jobId: freshId }))).body);
  check('startup race: a missing record inside the grace period is pending',
    early.status === 'pending' && early.starting === true, JSON.stringify(early.status));
  const staleId = 'job_' + (Date.now() - 10 * 60 * 1000).toString(36) + '_stale123stale456';
  const stale = JSON.parse((await status.handler(lambdaEvent({ token: 'pw', jobId: staleId }))).body);
  check('startup race: a missing record past the grace period is expired',
    stale.status === 'expired' && stale.code === 'job_expired', JSON.stringify(stale.status));
  check('auth still rejects a bad token',
    (await status.handler(lambdaEvent({ token: 'nope', jobId }))).statusCode === 401);

  // ── 9. Lifecycle logs, and nothing sensitive in them ───────────
  const lifecycle = logged.filter(l => l.startsWith('{')).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const seen = new Set(lifecycle.map(l => l.event));
  ['blob_context_connected', 'pending_record_written', 'generation_started', 'generation_completed']
    .forEach(name => check('logs: ' + name + ' emitted', seen.has(name), [...seen].join(',')));
  check('logs: generation_failed emitted on the failure paths', seen.has('generation_failed'));
  check('logs: lifecycle events use only allowlisted keys',
    lifecycle.filter(l => LIFECYCLE_EVENTS.includes(l.event))
      .every(l => Object.keys(l).every(k => k === 'event' || EVENT_FACTS.includes(k))),
    JSON.stringify(lifecycle.filter(l => LIFECYCLE_EVENTS.includes(l.event)).map(l => Object.keys(l))[0]));

  const allLogs = logged.join('\n');
  check('logs: no credentials', !/blob-token|\bpw\b|sk-|SITE_PASSWORD|ANTHROPIC_API_KEY/.test(allLogs));
  check('logs: no prompts or article text', !/You are writing|<table|Updated September/.test(allLogs));
  check('logs: no product names or user fields', !/Gift Box|Coworkers|succulentsbox\.com\/products/.test(allLogs));
  check('logs: no in-memory fallback warning', !/in-memory fallback/.test(allLogs), allLogs.slice(0, 80));

  console.log = realLog; console.warn = realWarn; console.error = realError;
  console.log(results.filter(r => r.startsWith('FAIL')).join('\n'));
  const failures = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`${results.length - failures} checks passed`);
  console.log('\n' + failures + ' failures of ' + results.length);
  process.exitCode = failures ? 1 : 0;
})();
