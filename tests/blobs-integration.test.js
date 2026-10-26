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

// ── The REAL @netlify/blobs, against a local Blobs edge ─────────
// The installed client (10.7.13) talks HTTP to tests/support/fake-blobs-edge.js,
// so connectLambda, getStore, set({ onlyIfNew }), get, list and delete all run
// through the library's own code. A thin wrapper only records the call order and
// simulates a fresh function instance that has not connected yet (getStore
// throws, exactly as the library does without a context).
process.env.NODE_ENV = 'test';   // the library's retry delay becomes 1ms
const blobsPath = require.resolve('@netlify/blobs', { paths: [ROOT] });
const realBlobs = require(blobsPath);
const { startFakeBlobsEdge } = require('./support/fake-blobs-edge');
const calls = [];
// One shared backing map per named store, across every "instance": that is what
// a real durable store gives, and what a process-local Map cannot. The job store
// is the one most checks look at, so it keeps the name `durable`.
const stores = new Map();
// The client addresses a site-wide store `<name>` as `site:<name>` on the wire,
// in 8.2.0 and in 10.7.13 alike, so existing data stays where it was.
const storeMap = name => { const n = 'site:' + name; if (!stores.has(n)) stores.set(n, new Map()); return stores.get(n); };
const durable = storeMap('article-jobs');
const fault = {};
let edge = null;   // started before the first check
let contextConnected = false;
let fetchCalls = 0;

const blobsWrapper = Object.assign({}, realBlobs, {
  connectLambda(event) {
    calls.push('connectLambda');
    realBlobs.connectLambda(event);
    contextConnected = true;
  },
  getStore(options) {
    calls.push('getStore');
    if (!contextConnected) {
      const err = new Error('The environment has not been configured to use Netlify Blobs. To use it manually, supply the following properties when creating a store: siteID, token');
      err.name = 'MissingBlobsEnvironmentError';
      throw err;
    }
    // Count requests that go through the fetch the caller supplied (the
    // ownership guard), so the test can prove the guard is really in the path.
    if (options && typeof options.fetch === 'function') {
      const guarded = options.fetch;
      options = Object.assign({}, options, { fetch: (u, i) => { fetchCalls += 1; return guarded(u, i); } });
    }
    return realBlobs.getStore(options);
  }
});
require.cache[blobsPath] = { id: blobsPath, filename: blobsPath, loaded: true, exports: blobsWrapper };
const conditionalRequests = { filter: fn => edge.requests.filter(r => r.method === 'put').map(r => ({ method: r.method, storeName: r.storeName.replace(/^site:/, ''), key: r.key, ifNoneMatch: r.ifNoneMatch })).filter(fn), get length() { return edge.requests.length; }, reset() { edge.requests.length = 0; } };
let readShouldThrow = false;
let writeShouldThrow = false;
const applyFaults = () => {
  fault.get = readShouldThrow ? 500 : undefined;
  fault.list = readShouldThrow ? 500 : undefined;
  fault.put = writeShouldThrow ? 500 : undefined;
  fault.conditionalPut = writeShouldThrow ? 500 : undefined;
};

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
const modelCalls = { count: 0 };
class FakeAnthropic {
  constructor() {
    this.messages = {
      create: async (opts) => {
        modelCalls.count += 1;
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

const H = require('./support/harness');
H.applyTestEnv();
const WHO = H.newSession();
const AUTH = H.event({}, { as: WHO }).headers;

// The prompt pack lives in its own Blobs store. Seed it with the synthetic pack
// the way tools/pack.js would: an immutable version plus the active pointer.
{
  const promptPack = require(path.join(ROOT, 'netlify/functions/lib/prompt-pack'));
  const pack = require('./support/test-pack').loadPackJson();
  storeMap(promptPack.STORE_NAME).set('pack/blobs-test', JSON.stringify(pack));
  const { signForTests } = require('./support/test-pack');
  storeMap(promptPack.STORE_NAME).set('active', JSON.stringify(signForTests({
    channel: 'production', version: 'blobs-test', hash: promptPack.hashPack(pack), activatedAt: new Date().toISOString() })));
}

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
  blobs: edge.blobsContext,
  headers: Object.assign({ 'x-nf-site-id': 'site-id', 'x-nf-deploy-id': 'deploy-id' }, AUTH),
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
  edge = await startFakeBlobsEdge({ stores, fault });
  // ── 1. connectLambda runs before getStore, in both handlers ────
  calls.length = 0;
  contextConnected = false;
  const jobId = jobs.newJobId();
  await background.handler(lambdaEvent({ jobId, articleType: 'general_gift_guide', fields: fields(2) }));
  check('background: connectLambda is called', calls.includes('connectLambda'));
  check('background: connectLambda precedes getStore',
    calls.indexOf('connectLambda') < calls.indexOf('getStore'), calls.slice(0, 4).join(' -> '));

  calls.length = 0;
  contextConnected = false;
  const statusRes = await status.handler(lambdaEvent({ jobId }));
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
  const pending = JSON.parse((await status.handler(lambdaEvent({ jobId: pendingId }))).body);
  check('a new pending record is immediately readable',
    pending.status === 'pending' && pending.starting !== true, JSON.stringify(pending.status));

  // ── 4. Terminal records land on their own key ──────────────────
  // Eventual consistency makes a NEW key visible at once but an UPDATE can lag
  // up to 60 seconds, so complete and failed are written as new keys.
  await jobs.completeJob(pendingId, { html: '<p>x</p>', products: [], warnings: [] }, { totalMs: 1 });
  check('the terminal record is a separate key', durable.has(pendingId + jobs.RESULT_SUFFIX));
  check('the pending key is left alone', JSON.parse(durable.get(pendingId)).status === 'pending');
  const completed = JSON.parse((await status.handler(lambdaEvent({ jobId: pendingId }))).body);
  check('completion becomes visible to status', completed.status === 'complete');

  const failId = jobs.newJobId();
  await jobs.createPending(failId, { articleType: 'general_gift_guide', recommendationCount: 1 });
  await jobs.failJob(failId, 'The AI service could not generate the article.', 'ai_failure', { totalMs: 1 });
  const failedBody = JSON.parse((await status.handler(lambdaEvent({ jobId: failId }))).body);
  check('failure becomes visible to status',
    failedBody.status === 'failed' && failedBody.code === 'ai_failure', failedBody.status);

  // ── 4b. A truncated article still completes the job ────────────
  // Truncation is an article quality problem, not a job failure: the record must
  // reach complete so the browser can show the partial article and its banner.
  contextConnected = false;
  jobs.connectJobStore(lambdaEvent({}));
  const truncId = jobs.newJobId();
  await jobs.createPending(truncId, { articleType: 'general_gift_guide', recommendationCount: 5 });
  await jobs.completeJob(truncId, {
    html: '<p>partial</p>', products: [], warnings: ['The article reached the output limit and is incomplete.'],
    truncated: true, title: 'A Title', excerpt: 'One. Two.', meta_description: 'M'
  }, { totalMs: 1 });
  const truncStatus = JSON.parse((await status.handler(lambdaEvent({ jobId: truncId }))).body);
  check('a truncated article still reaches status complete',
    truncStatus.status === 'complete' && truncStatus.truncated === true, JSON.stringify(truncStatus.status));
  check('a truncated job keeps its title and metadata',
    !!truncStatus.title && !!truncStatus.excerpt && !!truncStatus.meta_description);
  check('a truncated job is not recorded as failed', truncStatus.code === undefined);

  // ── 5. Missing Blobs context: report, never fall back ──────────
  contextConnected = false;
  const noContext = { httpMethod: 'POST', headers: AUTH, body: JSON.stringify({ jobId }) };
  const statusNoCtx = await status.handler(noContext);
  // The session revocation check is the first thing that needs Blobs, so
  // without a context the request is refused there, fail closed, before the job
  // store is even asked.
  check('status without Blobs context is refused, never served from memory',
    statusNoCtx.statusCode === 503 && JSON.parse(statusNoCtx.body).code === 'session_check_unavailable',
    statusNoCtx.statusCode + ' ' + statusNoCtx.body.slice(0, 60));

  const bgNoCtx = await background.handler({
    httpMethod: 'POST', headers: AUTH,
    body: JSON.stringify({ jobId: jobs.newJobId(), articleType: 'general_gift_guide', fields: fields(1) })
  });
  check('background without Blobs context refuses to run',
    bgNoCtx.statusCode === 503 && JSON.parse(bgNoCtx.body).code === 'session_check_unavailable',
    String(bgNoCtx.statusCode));
  check('no job was written anywhere during those failures',
    ![...durable.keys()].some(k => k.includes('undefined')));

  // ── 6. Store read and write failures surface ───────────────────
  contextConnected = false;
  readShouldThrow = true; applyFaults();
  const readFail = await status.handler(lambdaEvent({ jobId }));
  check('a blob read failure is refused (fail closed), never answered from memory',
    readFail.statusCode === 503 && JSON.parse(readFail.body).code === 'session_check_unavailable', readFail.body.slice(0, 80));
  readShouldThrow = false; applyFaults();

  contextConnected = false;
  writeShouldThrow = true; applyFaults();
  const writeFail = await background.handler(lambdaEvent({
    jobId: jobs.newJobId(), articleType: 'general_gift_guide', fields: fields(1)
  }));
  check('a blob write failure stops the job with job_store_unavailable',
    writeFail.statusCode === 500 && JSON.parse(writeFail.body).code === 'job_store_unavailable',
    String(writeFail.statusCode));
  writeShouldThrow = false; applyFaults();

  // ── 7. Strong consistency is not requested ─────────────────────
  // connectLambda supplies siteID, token, edgeURL and deployID but never
  // uncachedEdgeURL, and the real client throws BlobsConsistencyError on a
  // strong read without it. A read through the store must therefore succeed.
  contextConnected = false;
  jobs.connectJobStore(lambdaEvent({}));
  let consistencyError = null;
  try { await jobs.getStore().get('probe', { type: 'text' }); } catch (err) { consistencyError = err.name; }
  check('the store does not request strong consistency', consistencyError === null, String(consistencyError));

  // ── 8. The startup race still behaves ──────────────────────────
  contextConnected = false;
  const freshId = jobs.newJobId();
  const early = JSON.parse((await status.handler(lambdaEvent({ jobId: freshId }))).body);
  check('startup race: a missing record inside the grace period is pending',
    early.status === 'pending' && early.starting === true, JSON.stringify(early.status));
  const staleId = 'job_' + (Date.now() - 10 * 60 * 1000).toString(36) + '_stale123stale456';
  const stale = JSON.parse((await status.handler(lambdaEvent({ jobId: staleId }))).body);
  check('startup race: a missing record past the grace period is expired',
    stale.status === 'expired' && stale.code === 'job_expired', JSON.stringify(stale.status));
  const noSession = lambdaEvent({ jobId });
  delete noSession.headers.cookie;
  check('auth still rejects a caller with no session', (await status.handler(noSession)).statusCode === 401);

  // ── 8b. Ownership through the real @netlify/blobs onlyIfNew path ─
  // Ten submissions of one job id at once, split between two sessions, through
  // the real client and its supported set(key, value, { onlyIfNew: true }).
  // Exactly one may win.
  contextConnected = false;
  conditionalRequests.reset();
  const fetchBefore = fetchCalls;
  const raceJob = jobs.newJobId();
  const OTHER = H.event({}, { as: H.newSession() }).headers;
  const modelCallsBefore = modelCalls.count;
  const submissions = Array.from({ length: 10 }, (_, i) => background.handler(Object.assign(
    lambdaEvent({ jobId: raceJob, articleType: 'general_gift_guide', fields: fields(1) }),
    { headers: Object.assign({ 'x-nf-site-id': 'site-id', 'x-nf-deploy-id': 'deploy-id' }, i % 2 ? OTHER : AUTH) })));
  const answers = (await Promise.all(submissions)).map(r => JSON.parse(r.body));
  const claimPuts = conditionalRequests.filter(r => r.storeName === 'article-jobs' && r.key === raceJob);
  // Submissions that already see the record stop at the duplicate pre-check;
  // the rest race at the store. Every one that reached it was a conditional
  // create, and more than one did, so the 412 path was really taken.
  check('onlyIfNew path: every claim that reached storage is a PUT carrying If-None-Match: *, and several raced',
    claimPuts.length >= 2 && claimPuts.every(r => r.method === 'put' && r.ifNoneMatch === '*'), String(claimPuts.length));
  check('onlyIfNew path: exactly one of ten concurrent submissions wins', answers.filter(a => !a.duplicate).length === 1,
    answers.map(a => a.duplicate ? 'dup' : 'won').join(','));
  check('onlyIfNew path: one generation ran (two model calls)', modelCalls.count - modelCallsBefore === 2, String(modelCalls.count - modelCallsBefore));
  check('onlyIfNew path: the job store\'s requests go through the ownership guard', fetchCalls - fetchBefore >= 11, String(fetchCalls - fetchBefore));
  const resultPuts = conditionalRequests.filter(r => r.key === raceJob + jobs.RESULT_SUFFIX);
  check('onlyIfNew path: the terminal record is also a conditional create', resultPuts.length === 1 && resultPuts[0].ifNoneMatch === '*');
  const owner = JSON.parse(durable.get(raceJob)).scope;
  const finalRecord = JSON.parse(durable.get(raceJob + jobs.RESULT_SUFFIX));
  check('onlyIfNew path: the result carries the winner\'s scope', finalRecord.scope === owner && finalRecord.status === 'complete');
  const winnerHeaders = owner === WHO.payload.sid ? AUTH : OTHER;
  const loserHeaders = owner === WHO.payload.sid ? OTHER : AUTH;
  const asWinner = JSON.parse((await status.handler(Object.assign(lambdaEvent({ jobId: raceJob }), { headers: Object.assign({}, edge.headers, winnerHeaders) }))).body);
  const asLoser = JSON.parse((await status.handler(Object.assign(lambdaEvent({ jobId: raceJob }), { headers: Object.assign({}, edge.headers, loserHeaders) }))).body);
  check('onlyIfNew path: the winner reads the article', asWinner.status === 'complete' && !!asWinner.html);
  check('onlyIfNew path: the losing session cannot read it', asLoser.status === 'expired' && !asLoser.html);
  const overwrite = await jobs.completeJob(raceJob, { html: '<p>forged</p>' }, null, { jobId: raceJob, scope: 'someone-else' });
  check('onlyIfNew path: a second terminal write is refused and the result is unchanged',
    overwrite.written === false && JSON.parse(durable.get(raceJob + jobs.RESULT_SUFFIX)).scope === owner
    && !durable.get(raceJob + jobs.RESULT_SUFFIX).includes('forged'));

  // ── 8c. Twenty direct claims, two sessions, through the real client ─
  // No pre-check here: every caller goes to the store at once.
  contextConnected = false;
  jobs.connectJobStore(lambdaEvent({}));
  conditionalRequests.reset();
  const directJob = jobs.newJobId();
  const sids = ['a'.repeat(32), 'b'.repeat(32)];
  const claims = await Promise.all(Array.from({ length: 20 }, (_, i) => jobs.claim(directJob, { scope: sids[i % 2] })));
  const winners = claims.filter(c => c.created);
  const directPuts = conditionalRequests.filter(r => r.key === directJob);
  check('real client: twenty simultaneous claims reach the store as twenty conditional PUTs',
    directPuts.length === 20 && directPuts.every(r => r.ifNoneMatch === '*'), String(directPuts.length));
  check('real client: exactly one of twenty simultaneous claims wins', winners.length === 1, String(winners.length));
  check('real client: the stored record carries the winner\'s scope',
    winners.length === 1 && JSON.parse(durable.get(directJob)).scope === winners[0].record.scope);

  // ── 8d. A conditional write that fails is an error, never a win ─
  // @netlify/blobs reports { modified: true } for any non-412 answer to a
  // conditional write. The ownership guard turns those answers into errors.
  for (const statusCode of [500, 503, 403, 401, 400]) {
    fault.conditionalPut = statusCode;
    let outcome;
    try { outcome = (await jobs.claim(jobs.newJobId(), { scope: sids[0] })).created ? 'won' : 'lost'; }
    catch (err) { outcome = 'error:' + (err.name || '') + ':' + (err.status || ''); }
    fault.conditionalPut = undefined;
    check(`real client: HTTP ${statusCode} on a conditional create is an error, not a win`,
      outcome === 'error:ConditionalWriteError:' + statusCode, outcome);
  }
  fault.conditionalPut = 503;
  const bgFault = await background.handler(lambdaEvent({ jobId: jobs.newJobId(), articleType: 'general_gift_guide', fields: fields(1) }));
  fault.conditionalPut = undefined;
  check('real client: a failing conditional create refuses the job (no generation)',
    bgFault.statusCode === 500 && JSON.parse(bgFault.body).code === 'job_store_unavailable', String(bgFault.statusCode));

  // ── 8e. The library gap the guard closes, reproduced ──────────
  // Without the guard, the real client answers a failing conditional write
  // with { modified: true }. This is why ownership never uses a bare store.
  {
    const bare = realBlobs.getStore({ name: 'gap-probe' });
    fault.conditionalPut = 503;
    let bareResult;
    try { bareResult = await bare.set('k', 'v', { onlyIfNew: true }); } catch (err) { bareResult = { threw: err.name }; }
    fault.conditionalPut = undefined;
    check('library gap: an unguarded onlyIfNew write answered 503 reports modified: true (so it must be guarded)',
      bareResult && bareResult.modified === true && !storeMap('gap-probe').has('k'), JSON.stringify(bareResult));
    const { createIfAbsent } = require(path.join(ROOT, 'netlify/functions/lib/atomic-create'));
    let refused = null;
    try { await createIfAbsent(bare, 'k2', 'v'); } catch (err) { refused = err.message; }
    check('library gap: createIfAbsent refuses a store that was not created with the guard',
      !!refused && /guarded conditional create/.test(refused) && !storeMap('gap-probe').has('k2'), String(refused));
  }

  // ── 8e2. Version and answer checks in atomic-create ─────────────
  {
    const ac = require(path.join(ROOT, 'netlify/functions/lib/atomic-create'));
    let old = null; try { ac.assertSupportedBlobs('8.2.0'); } catch (err) { old = err.message; }
    check('atomic-create: @netlify/blobs 8.2.0 (no onlyIfNew) is refused', !!old && /onlyIfNew/.test(old), String(old));
    check('atomic-create: the installed @netlify/blobs is accepted', ac.assertSupportedBlobs() === '10.7.13', ac.assertSupportedBlobs());
    const silent = ac.markConditionalStoreForTests({ async set() { return undefined; } });
    let noAnswer = null; try { await ac.createIfAbsent(silent, 'k', 'v'); } catch (err) { noAnswer = err.message; }
    check('atomic-create: a set() that does not report { modified } is refused, never treated as a win',
      !!noAnswer && /did not report/.test(noAnswer), String(noAnswer));
  }

  // ── 8f. Prompt loading, counters, sign-in and revocation on the real client ─
  check('real client: the prompt pack pointer and pack were read from the prompt-packs store',
    edge.history.some(r => r.method === 'get' && r.storeName === 'site:prompt-packs' && r.key === 'active') &&
    edge.history.some(r => r.method === 'get' && r.storeName === 'site:prompt-packs' && r.key === 'pack/blobs-test'));
  check('real client: generations were counted as new keys in app-counters', storeMap('app-counters').size >= 1,
    String(storeMap('app-counters').size));
  {
    const counters = require(path.join(ROOT, 'netlify/functions/lib/counter-store'));
    contextConnected = false;
    counters.connectCounters(lambdaEvent({}));
    const prefix = 'probe/' + Date.now();
    await Promise.all([counters.record(prefix), counters.record(prefix), counters.record(prefix)]);
    await counters.record(prefix, Date.now() - 10 * 60 * 60 * 1000);   // aged out
    const counted = await counters.countWithin(prefix, 60 * 60 * 1000);
    check('real client: counters record new keys and count them through list({ prefix })', counted === 3, String(counted));
    check('real client: an aged-out counter key is pruned with delete', [...storeMap('app-counters').keys()].filter(k => k.startsWith(prefix)).length === 3);
  }
  {
    const auth = require(path.join(ROOT, 'netlify/functions/auth'));
    const revocations = require(path.join(ROOT, 'netlify/functions/lib/revocations'));
    const loginEvent = () => ({ httpMethod: 'POST', blobs: edge.blobsContext,
      headers: Object.assign({ 'x-forwarded-for': '203.0.113.9' }, edge.headers),
      body: JSON.stringify({ password: H.TEST_ENV.SITE_PASSWORD }) });
    contextConnected = false;
    const login = await auth.handler(loginEvent());
    const setCookie = ((login.multiValueHeaders || {})['Set-Cookie'] || [])[0] || '';
    const captured = setCookie.split(';')[0];
    const csrf = JSON.parse(login.body).csrfToken;
    check('real client: sign-in works with the throttle on the real store', login.statusCode === 200 && /^sb_session=/.test(captured) && !!csrf, String(login.statusCode));
    const asCaptured = body => ({ httpMethod: 'POST', blobs: edge.blobsContext,
      headers: Object.assign({ cookie: captured, 'x-csrf-token': csrf }, edge.headers), body: JSON.stringify(body) });
    const probeJob = jobs.newJobId();
    contextConnected = false;
    const before = await status.handler(asCaptured({ jobId: probeJob }));
    check('real client: the captured session works before sign-out', before.statusCode === 200, String(before.statusCode));
    contextConnected = false;
    const out = await auth.handler(asCaptured({ action: 'logout' }));
    check('real client: sign-out revokes on the server', out.statusCode === 200 && JSON.parse(out.body).revoked === true, out.body);
    check('real client: the revocation is a new key in session-revocations',
      [...storeMap('session-revocations').keys()].some(k => k.startsWith('revoked/')));
    // Ignore the cookie-clearing response; replay on this instance and on a
    // different one (which has no in-memory record of the sign-out).
    contextConnected = false;
    const replaySame = await status.handler(asCaptured({ jobId: probeJob }));
    revocations.forgetLocalForTests();
    contextConnected = false;
    const replayOther = await status.handler(asCaptured({ jobId: probeJob }));
    check('real client: replaying the captured cookie and CSRF value after sign-out is refused (same instance)', replaySame.statusCode === 401, String(replaySame.statusCode));
    check('real client: and refused on another instance, read from the store', replayOther.statusCode === 401, String(replayOther.statusCode));
    fault.list = 500;
    contextConnected = false;
    const throttleDown = await auth.handler(loginEvent());
    fault.list = undefined;
    check('real client: sign-in is refused when the throttle store cannot be listed', throttleDown.statusCode === 503 &&
      JSON.parse(throttleDown.body).code === 'login_unavailable', String(throttleDown.statusCode));
  }

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

  const startedForRace = lifecycle.filter(l => l.event === 'generation_started' && l.jobId === raceJob).length;
  check('logs: exactly one generation_started for the job submitted ten times at once', startedForRace === 1, String(startedForRace));
  const allLogs = logged.join('\n');
  check('logs: no credentials', !/blob-token|sk-|SITE_PASSWORD|ANTHROPIC_API_KEY|synthetic-test-password|synthetic-session-secret/.test(allLogs));
  check('logs: no signed session and no CSRF value', !allLogs.includes(WHO.token) && !allLogs.includes(WHO.payload.csrf));
  check('logs: no prompts or article text', !/You are writing|<table|Updated September/.test(allLogs));
  check('logs: no product names or user fields', !/Gift Box|Coworkers|succulentsbox\.com\/products/.test(allLogs));
  check('logs: no in-memory fallback warning', !/in-memory fallback/.test(allLogs), allLogs.slice(0, 80));

  await edge.close();
  console.log = realLog; console.warn = realWarn; console.error = realError;
  // VERBOSE=1 prints every check, not only failures.
  console.log((process.env.VERBOSE ? results : results.filter(r => r.startsWith('FAIL'))).join('\n'));
  const failures = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`${results.length - failures} checks passed`);
  console.log('\n' + failures + ' failures of ' + results.length);
  process.exitCode = failures ? 1 : 0;
})().catch(async err => {
  // An exception is a failed check, not a silent pass: report it as FAIL.
  console.log = realLog; console.warn = realWarn; console.error = realError;
  if (edge) await edge.close();
  console.log(results.filter(r => r.startsWith('FAIL')).join('\n'));
  console.log('FAIL the suite stopped on an exception :: ' + (err && err.name) + ': ' + (err && err.message));
  process.exitCode = 1;
});
