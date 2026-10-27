// Security boundaries: sessions, CSRF, authorisation, job scope, usage limits,
// duplicate submissions, prompt-version pinning, safe failure, and what reaches
// browsers and logs.
//
// Every secret here is synthetic. The prompt pack is the synthetic one. The
// Anthropic SDK is a recording stub, so "no model call happened" is a fact the
// suite checks, not an assumption.
//
// Run: node tests/security.test.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const H = require('./support/harness');
H.applyTestEnv();

let modelBehaviour = H.defaultReply;
let onModelCall = null;
const modelCalls = H.stubAnthropic(async (req, calls) => {
  if (onModelCall) await onModelCall(req, calls);
  return modelBehaviour(req, calls);
});

const ROOT = H.ROOT;
const session = require(ROOT + '/netlify/functions/lib/session');
const jobs = require(ROOT + '/netlify/functions/lib/job-store');
const counters = require(ROOT + '/netlify/functions/lib/counter-store');
const promptPack = require(ROOT + '/netlify/functions/lib/prompt-pack');
const auth = require(ROOT + '/netlify/functions/auth');
const generate = require(ROOT + '/netlify/functions/generate');
const background = require(ROOT + '/netlify/functions/generate-background');
const status = require(ROOT + '/netlify/functions/generate-status');
const catalog = require(ROOT + '/netlify/functions/gift-catalog');
const { loadPackJson, signForTests } = require('./support/test-pack');

// Every log line, so the suite can check nothing sensitive was written.
const logged = [];
const realLog = console.log, realError = console.error, realWarn = console.warn;
console.log = (...a) => logged.push(a.map(String).join(' '));
console.error = (...a) => logged.push(a.map(String).join(' '));
console.warn = (...a) => logged.push(a.map(String).join(' '));

// What a fresh function instance needs after the module cache is cleared: the
// deploy context its build stamped, and the shared revocation store. Returns the
// freshly loaded modules.
const sharedRevocations = new Map();
function freshInstance() {
  require(ROOT + '/netlify/functions/lib/deploy-context').setDeployContextForTests('production');
  require(ROOT + '/netlify/functions/lib/revocations').useMemoryRevocationsForTests(sharedRevocations);
}

const results = [];
const ok = (name, cond, extra) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : ''));
const body = r => { try { return JSON.parse(r.body); } catch { return {}; } };
const cookiesOf = r => (r.multiValueHeaders && r.multiValueHeaders['Set-Cookie']) || [];
const sessionFrom = r => {
  const c = cookiesOf(r).find(x => x.startsWith(session.COOKIE_NAME + '='));
  return c ? c.split(';')[0].slice(session.COOKIE_NAME.length + 1) : '';
};
const login = (password, headers) => auth.handler({ httpMethod: 'POST', headers: headers || {}, body: JSON.stringify({ password }) });
const asCookie = (token, csrf) => ({ cookie: `${session.COOKIE_NAME}=${token}`, 'x-csrf-token': csrf });
const post = (handler, payload, headers) => handler({ httpMethod: 'POST', headers: headers || {}, body: JSON.stringify(payload || {}) });

const products = n => Array.from({ length: n }, (_, i) => ({
  title: 'Example Gift ' + (i + 1), url: 'https://example.com/products/' + (i + 1), price: '$20.00', source: 'manual'
}));
const giftFields = { recipient: 'Friend', numberOfRecommendations: 2, selectedProducts: products(2) };
const careFields = { plantName: 'Echeveria Lola', plantType: 'Succulent' };

(async () => {
  H.useMemoryStores();
  require(ROOT + '/netlify/functions/lib/revocations').useMemoryRevocationsForTests(sharedRevocations);

  // ── 1. Signing in ────────────────────────────────────────────────
  let r = await login(H.TEST_ENV.SITE_PASSWORD);
  const signed = body(r);
  const token = sessionFrom(r);
  ok('a correct password signs in', r.statusCode === 200 && signed.ok === true);
  ok('the response never contains the password', !r.body.includes(H.TEST_ENV.SITE_PASSWORD) && !JSON.stringify(r.multiValueHeaders || {}).includes(H.TEST_ENV.SITE_PASSWORD));
  ok('the response has no "token" field any more', !('token' in signed));
  ok('the response body does not contain the session itself', !!token && !r.body.includes(token));
  ok('the response returns a CSRF value', typeof signed.csrfToken === 'string' && signed.csrfToken.length >= 32);
  const cookie = cookiesOf(r).find(c => c.startsWith(session.COOKIE_NAME + '=')) || '';
  ok('the session cookie is HttpOnly', /;\s*HttpOnly/i.test(cookie), cookie);
  ok('the session cookie is Secure', /;\s*Secure/i.test(cookie), cookie);
  ok('the session cookie is SameSite=Strict', /;\s*SameSite=Strict/i.test(cookie), cookie);
  ok('the session cookie has a server-set lifetime', /;\s*Max-Age=\d+/.test(cookie), cookie);
  ok('the auth response is not cacheable', /no-store/.test(r.headers['Cache-Control'] || ''));
  const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  ok('the session payload holds no password or secret',
    !JSON.stringify(payload).includes(H.TEST_ENV.SITE_PASSWORD) && !JSON.stringify(payload).includes(H.TEST_ENV.SESSION_SECRET));
  ok('the session carries a server-side expiry', payload.exp > payload.iat && payload.exp - payload.iat === session.DEFAULT_TTL_MS);
  const good = asCookie(token, signed.csrfToken);

  r = await login('wrong password');
  ok('a wrong password is refused with no cookie', r.statusCode === 401 && cookiesOf(r).length === 0);
  r = await login('');
  ok('an empty password is refused', r.statusCode === 401);
  r = await post(auth.handler, { password: { $ne: null } });
  ok('a non-string password is refused', r.statusCode === 401);
  r = await auth.handler({ httpMethod: 'GET', headers: {} });
  ok('sign-in only accepts POST', r.statusCode === 405);

  // ── 2. Configuration that is missing or weak denies access ───────
  for (const [label, env] of [['SITE_PASSWORD', { SITE_PASSWORD: '' }], ['SESSION_SECRET', { SESSION_SECRET: '' }], ['a short SESSION_SECRET', { SESSION_SECRET: 'too-short' }]]) {
    H.applyTestEnv(env);
    const signIn = await login(H.TEST_ENV.SITE_PASSWORD);
    const use = await post(generate.handler, { articleType: 'care_guide', fields: careFields }, good);
    ok(`missing or weak ${label}: sign-in is refused`, signIn.statusCode === 503 && cookiesOf(signIn).length === 0, String(signIn.statusCode));
    ok(`missing or weak ${label}: an existing session is refused`, use.statusCode === 503, String(use.statusCode));
    ok(`missing or weak ${label}: the error names no secret value`, !/synthetic-/.test(signIn.body + use.body));
  }
  H.applyTestEnv();
  ok('no model call happened while misconfigured', modelCalls.length === 0);

  // ── 3. Missing, invalid, expired and forged sessions ─────────────
  const config = session.configure();
  const forge = (mutate, secret) => {
    const p = Object.assign({}, payload);
    mutate(p);
    const b = Buffer.from(JSON.stringify(p)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const sig = crypto.createHmac('sha256', secret || H.TEST_ENV.SESSION_SECRET).update(b).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `v1.${b}.${sig}`;
  };
  const cases = [
    ['no cookie at all', {}],
    ['an empty session cookie', asCookie('', signed.csrfToken)],
    ['a malformed session', asCookie('not-a-session', signed.csrfToken)],
    ['the old shared-password token as a cookie', asCookie(H.TEST_ENV.SITE_PASSWORD, signed.csrfToken)],
    ['a session with its signature removed', asCookie(token.split('.').slice(0, 2).join('.') + '.', signed.csrfToken)],
    ['a session with an edited payload and the original signature',
      asCookie(`v1.${Buffer.from(JSON.stringify(Object.assign({}, payload, { exp: Date.now() + 1e10 }))).toString('base64url')}.${token.split('.')[2]}`, signed.csrfToken)],
    ['a session signed with a different secret', asCookie(forge(() => {}, 'an-attacker-guess-at-the-secret-0123456789'), signed.csrfToken)],
    ['an expired session', asCookie(forge(p => { p.exp = Date.now() - 1000; }), signed.csrfToken)],
    ['a session from an older epoch', asCookie(forge(p => { p.epoch = '0'; }), signed.csrfToken)],
    ['an unknown session version', asCookie('v2.' + token.split('.').slice(1).join('.'), signed.csrfToken)]
  ];
  for (const [label, headers] of cases) {
    const before = modelCalls.length;
    const sync = await post(generate.handler, { articleType: 'care_guide', fields: careFields }, headers);
    const bgId = jobs.newJobId();
    const bg = await post(background.handler, { jobId: bgId, articleType: 'general_gift_guide', fields: giftFields }, headers);
    const st = await post(status.handler, { jobId: bgId }, headers);
    const cat = await post(catalog.handler, { catalogType: 'gift' }, headers);
    ok(`${label}: refused by every protected endpoint`,
      [sync, bg, st, cat].every(x => x.statusCode === 401), [sync, bg, st, cat].map(x => x.statusCode).join(','));
    ok(`${label}: no model call and no job record`, modelCalls.length === before && !(await jobs.get(bgId)));
  }
  ok('the old body token is ignored when a session is missing',
    (await post(generate.handler, { token: H.TEST_ENV.SITE_PASSWORD, articleType: 'care_guide', fields: careFields }, {})).statusCode === 401);

  // ── 4. CSRF ───────────────────────────────────────────────────────
  const csrfCases = [
    ['no CSRF header', { cookie: good.cookie }],
    ['an empty CSRF header', { cookie: good.cookie, 'x-csrf-token': '' }],
    ['a wrong CSRF header', { cookie: good.cookie, 'x-csrf-token': crypto.randomBytes(16).toString('hex') }],
    ['the CSRF value from another session', { cookie: good.cookie, 'x-csrf-token': H.newSession().payload.csrf }]
  ];
  for (const [label, headers] of csrfCases) {
    const before = modelCalls.length;
    const results4 = await Promise.all([
      post(generate.handler, { articleType: 'care_guide', fields: careFields }, headers),
      post(background.handler, { jobId: jobs.newJobId(), articleType: 'general_gift_guide', fields: giftFields }, headers),
      post(status.handler, { jobId: jobs.newJobId() }, headers),
      post(catalog.handler, { catalogType: 'gift' }, headers)
    ]);
    ok(`${label}: refused with 403 by every protected endpoint`, results4.every(x => x.statusCode === 403 && body(x).code === 'csrf_failed'),
      results4.map(x => x.statusCode).join(','));
    ok(`${label}: no model call`, modelCalls.length === before);
  }
  ok('the CSRF header name is case-insensitive', (await post(status.handler, { jobId: jobs.newJobId() }, { Cookie: good.cookie, 'X-CSRF-Token': signed.csrfToken })).statusCode === 200);

  // ── 5. A valid session works ──────────────────────────────────────
  r = await post(generate.handler, { articleType: 'care_guide', fields: careFields }, good);
  ok('a valid session and CSRF value can generate', r.statusCode === 200 && !!body(r).html, r.body.slice(0, 120));

  // ── 6. Sign out and invalidation ─────────────────────────────────
  r = await post(auth.handler, { action: 'logout' }, good);
  const cleared = cookiesOf(r).find(c => c.startsWith(session.COOKIE_NAME + '=')) || '';
  ok('sign-out clears the cookie', r.statusCode === 200 && /Max-Age=0/.test(cleared) && cleared.startsWith(session.COOKIE_NAME + '=;'), cleared);
  ok('sign-out works even without a session', (await post(auth.handler, { action: 'logout' }, {})).statusCode === 200);
  H.applyTestEnv({ SESSION_EPOCH: '2' });
  r = await post(generate.handler, { articleType: 'care_guide', fields: careFields }, good);
  ok('raising SESSION_EPOCH invalidates every existing session', r.statusCode === 401);
  r = await login(H.TEST_ENV.SITE_PASSWORD);
  const fresh = asCookie(sessionFrom(r), body(r).csrfToken);
  ok('a sign-in after the epoch change works', (await post(status.handler, { jobId: jobs.newJobId() }, fresh)).statusCode === 200);
  H.applyTestEnv();
  ok('lowering the epoch back revokes the newer sessions too', (await post(status.handler, { jobId: jobs.newJobId() }, fresh)).statusCode === 401);

  // ── 7. Job scope ──────────────────────────────────────────────────
  H.useMemoryStores();
  const alice = H.newSession();
  const bob = H.newSession();
  const A = asCookie(alice.token, alice.payload.csrf);
  const B = asCookie(bob.token, bob.payload.csrf);
  const aliceJob = jobs.newJobId();
  await post(background.handler, { jobId: aliceJob, articleType: 'general_gift_guide', fields: giftFields }, A);
  const stored = await jobs.get(aliceJob);
  ok('a job is stamped with the session that created it', stored && stored.scope === alice.payload.sid);
  ok('the job record holds no cookie, session string, CSRF value or password',
    !JSON.stringify(stored).includes(alice.token) && !JSON.stringify(stored).includes(alice.payload.csrf) && !JSON.stringify(stored).includes(H.TEST_ENV.SITE_PASSWORD));
  const mine = body(await post(status.handler, { jobId: aliceJob }, A));
  ok('the owner can read the finished job', mine.status === 'complete' && !!mine.html);
  const theirs = await post(status.handler, { jobId: aliceJob }, B);
  const tb = body(theirs);
  ok('another session cannot read it by supplying its id', tb.status === 'expired' && !tb.html && !tb.title);
  const gone = body(await post(status.handler, { jobId: 'job_' + (Date.now() - 10 * 60 * 1000).toString(36) + '_neverexisted00' }, B));
  ok('the refusal is identical to a job that does not exist, so ids cannot be probed',
    tb.code === gone.code && tb.error === gone.error && tb.status === gone.status);
  ok('the status response never exposes scope, prompt version or timing',
    !('scope' in mine) && !('promptVersion' in mine) && !('timing' in mine));
  const failedForAlice = jobs.newJobId();
  await jobs.claim(failedForAlice, { scope: alice.payload.sid });
  await jobs.failJob(failedForAlice, 'Something specific to Alice failed.', 'ai_failure');
  const bf = body(await post(status.handler, { jobId: failedForAlice }, B));
  ok('another session cannot read a failed job\'s error either', bf.status === 'expired' && !/Alice/.test(JSON.stringify(bf)));
  const legacy = jobs.newJobId();
  await jobs.createPending(legacy, { articleType: 'care_guide' });
  ok('a record written before scoping existed stays readable during the rollout', body(await post(status.handler, { jobId: legacy }, B)).status === 'pending');
  const oldLegacy = { jobId: 'job_x', status: 'complete', createdAt: new Date(Date.now() - jobs.TTL_MS - 60000).toISOString(), result: { html: '<p>old</p>' } };
  ok('an unscoped record older than the job lifetime is no longer readable by anyone', jobs.isReadableBy(oldLegacy, bob.payload.sid) === false);
  ok('a scoped record is readable only by its own session',
    jobs.isReadableBy({ scope: 'a', createdAt: new Date().toISOString() }, 'a') && !jobs.isReadableBy({ scope: 'a', createdAt: new Date().toISOString() }, 'b'));

  // ── 8. Duplicate submission ──────────────────────────────────────
  H.useMemoryStores();
  const before8 = modelCalls.length;
  const dupId = jobs.newJobId();
  const submit = () => post(background.handler, { jobId: dupId, articleType: 'general_gift_guide', fields: giftFields }, A);
  const first = await submit();
  const again = await submit();
  ok('a resubmitted job id is accepted but not run again', first.statusCode === 202 && again.statusCode === 202 && body(again).duplicate === true);
  ok('two submissions of one job cost one generation (two model calls: article and metadata)', modelCalls.length - before8 === 2, String(modelCalls.length - before8));
  const fromBob = await post(background.handler, { jobId: dupId, articleType: 'general_gift_guide', fields: giftFields }, B);
  ok('another session cannot hijack a job id that is in use', body(fromBob).duplicate === true && modelCalls.length - before8 === 2
    && (await jobs.get(dupId)).scope === alice.payload.sid);

  // The second layer on its own: claim() refuses an id that already has a
  // record, whoever asks, so even a request that slipped past the handler's
  // pre-check could not start a second generation.
  const claimed = await jobs.claim(dupId, { scope: bob.payload.sid });
  ok('claim() refuses a job id that already has a record', claimed.created === false && claimed.existing.scope === alice.payload.sid);
  const freshClaim = await jobs.claim(jobs.newJobId(), { scope: bob.payload.sid });
  ok('claim() creates a record for a new id', freshClaim.created === true && freshClaim.record.scope === bob.payload.sid);

  // ── 9. Usage limits across separate invocations ──────────────────
  H.useMemoryStores();
  const counterMap = counters.getStore()._map;
  H.applyTestEnv({ GENERATION_LIMIT_PER_SESSION: '2', GENERATION_LIMIT_PER_DAY: '3' });
  const runs = [];
  for (let i = 0; i < 3; i += 1) runs.push(await post(generate.handler, { articleType: 'care_guide', fields: careFields }, A));
  ok('the per-session limit allows up to its value', runs[0].statusCode === 200 && runs[1].statusCode === 200);
  ok('the per-session limit then refuses with 429', runs[2].statusCode === 429 && body(runs[2]).code === 'rate_limited', String(runs[2].statusCode));
  // A "separate invocation": a fresh copy of the handler module, as a new
  // function instance would load it, sharing only the durable store.
  for (const key of Object.keys(require.cache)) if (key.includes('/netlify/functions/')) delete require.cache[key];
  freshInstance();
  const counters2 = require(ROOT + '/netlify/functions/lib/counter-store');
  counters2.useMemoryCountersForTests();
  for (const [k, v] of counterMap) await counters2.getStore().set(k, v);
  require(ROOT + '/netlify/functions/lib/job-store').useMemoryStoreForTests();
  require(ROOT + '/netlify/functions/lib/prompt-pack').usePackForTests(loadPackJson(), { version: 'test-pack', sign: signForTests });
  const generate2 = require(ROOT + '/netlify/functions/generate');
  const background2 = require(ROOT + '/netlify/functions/generate-background');
  const elsewhere = await post(generate2.handler, { articleType: 'care_guide', fields: careFields }, A);
  ok('a new function instance still sees the session\'s usage', elsewhere.statusCode === 429);
  const bgLimited = jobs.newJobId();
  const bgRefused = await post(background2.handler, { jobId: bgLimited, articleType: 'general_gift_guide', fields: giftFields }, A);
  const jobs2 = require(ROOT + '/netlify/functions/lib/job-store');
  const bgRecord = await jobs2.get(bgLimited);
  ok('the background path enforces the same limit and tells the poll why',
    bgRefused.statusCode === 429 && bgRecord && bgRecord.status === 'failed' && bgRecord.code === 'rate_limited');
  const bobUse = await post(generate2.handler, { articleType: 'care_guide', fields: careFields }, B);
  ok('another session still has its own allowance', bobUse.statusCode === 200, String(bobUse.statusCode));
  const bobAgain = await post(generate2.handler, { articleType: 'care_guide', fields: careFields }, B);
  ok('the app-wide daily limit caps everyone', bobAgain.statusCode === 429 && /daily limit/.test(body(bobAgain).error), String(bobAgain.statusCode));
  H.applyTestEnv({ GENERATION_LIMIT_PER_SESSION: '', GENERATION_LIMIT_PER_DAY: '' });
  const usageKeys = [...counters2.getStore()._map.keys()];
  ok('usage counters hold no personal data', usageKeys.every(k => /^use\/(session\/[0-9a-f]{32}|app)\/\d+-[0-9a-f]{12}$/.test(k)), usageKeys[0]);

  // ── 10. Login throttling across invocations ──────────────────────
  for (const key of Object.keys(require.cache)) if (key.includes('/netlify/functions/')) delete require.cache[key];
  freshInstance();
  const counters3 = require(ROOT + '/netlify/functions/lib/counter-store');
  counters3.useMemoryCountersForTests();
  H.applyTestEnv({ LOGIN_MAX_ATTEMPTS: '3' });
  const auth3 = require(ROOT + '/netlify/functions/auth');
  const from = ip => ({ 'x-nf-client-connection-ip': ip });
  const tries = [];
  for (let i = 0; i < 3; i += 1) tries.push(await auth3.handler({ httpMethod: 'POST', headers: from('203.0.113.7'), body: JSON.stringify({ password: 'guess' + i }) }));
  const blocked = await auth3.handler({ httpMethod: 'POST', headers: from('203.0.113.7'), body: JSON.stringify({ password: H.TEST_ENV.SITE_PASSWORD }) });
  ok('repeated failures from one address are throttled, even with the right password',
    tries.every(t => t.statusCode === 401) && blocked.statusCode === 429 && cookiesOf(blocked).length === 0, String(blocked.statusCode));
  ok('a throttled response says when to retry', Number(blocked.headers['Retry-After']) > 0);
  for (const key of Object.keys(require.cache)) if (key.endsWith('/netlify/functions/auth.js')) delete require.cache[key];
  freshInstance();
  const auth4 = require(ROOT + '/netlify/functions/auth');
  const stillBlocked = await auth4.handler({ httpMethod: 'POST', headers: from('203.0.113.7'), body: JSON.stringify({ password: 'x' }) });
  ok('the throttle survives a new function instance', stillBlocked.statusCode === 429);
  const otherIp = await auth4.handler({ httpMethod: 'POST', headers: from('198.51.100.4'), body: JSON.stringify({ password: H.TEST_ENV.SITE_PASSWORD }) });
  ok('another address is not affected', otherIp.statusCode === 200);
  const throttleKeys = [...counters3.getStore()._map.keys()];
  ok('throttle keys never store the address in the clear', throttleKeys.every(k => !/203\.0\.113\.7|198\.51/.test(k)), throttleKeys.join(','));
  // Two typos from a third address, under the limit, then the right password.
  const typo = '192.0.2.55';
  for (let i = 0; i < 2; i += 1) await auth4.handler({ httpMethod: 'POST', headers: from(typo), body: JSON.stringify({ password: 'typo' + i }) });
  const limitsR = require(ROOT + '/netlify/functions/lib/limits');
  const prefix = limitsR._internals.loginPrefix({ headers: from(typo) }, H.TEST_ENV.SESSION_SECRET);
  const failuresBefore = [...counters3.getStore()._map.keys()].filter(k => k.startsWith(prefix + '/')).length;
  const success = await auth4.handler({ httpMethod: 'POST', headers: from(typo), body: JSON.stringify({ password: H.TEST_ENV.SITE_PASSWORD }) });
  const failuresAfter = [...counters3.getStore()._map.keys()].filter(k => k.startsWith(prefix + '/')).length;
  ok('a successful sign-in clears that address\'s earlier failures',
    success.statusCode === 200 && failuresBefore === 2 && failuresAfter === 0, `${failuresBefore} -> ${failuresAfter}`);
  ok('the throttled address keeps its failures', [...counters3.getStore()._map.keys()].filter(k => k.startsWith('login-fail/')).length === 3);
  H.applyTestEnv({ LOGIN_MAX_ATTEMPTS: '' });

  // Reload the main handlers for the remaining sections.
  for (const key of Object.keys(require.cache)) if (key.includes('/netlify/functions/')) delete require.cache[key];
  freshInstance();
  const jobsR = require(ROOT + '/netlify/functions/lib/job-store');
  const packR = require(ROOT + '/netlify/functions/lib/prompt-pack');
  const countersR = require(ROOT + '/netlify/functions/lib/counter-store');
  jobsR.useMemoryStoreForTests();
  countersR.useMemoryCountersForTests();
  packR.usePackForTests(loadPackJson(), { version: 'v-one', sign: signForTests });
  const generateR = require(ROOT + '/netlify/functions/generate');
  const backgroundR = require(ROOT + '/netlify/functions/generate-background');
  const statusR = require(ROOT + '/netlify/functions/generate-status');

  // ── 11. Prompt version pinning in a running job ──────────────────
  const v2 = loadPackJson();
  v2.generalGiftGuide.document = v2.generalGiftGuide.document.replace('⟨generalGiftGuide.document⟩', '⟨generalGiftGuide.document v-two⟩');
  const promptsSeen = [];
  // While the article call is "in flight", a new pack is activated.
  onModelCall = async req => {
    promptsSeen.push(req.messages[0].content);
    if (promptsSeen.length === 1) {
      const store = packR.getStore();
      await store.set('pack/v-two', JSON.stringify(v2));
      await store.set('active', JSON.stringify(signForTests({ channel: 'production', version: 'v-two', hash: packR.hashPack(v2), activatedAt: new Date().toISOString() })));
    }
  };
  const pinnedId = jobsR.newJobId();
  await post(backgroundR.handler, { jobId: pinnedId, articleType: 'general_gift_guide', fields: giftFields }, A);
  onModelCall = null;
  const pinnedRecord = await jobsR.get(pinnedId);
  ok('the job records the version it started with', pinnedRecord.promptVersion === 'v-one', pinnedRecord.promptVersion);
  ok('both of the job\'s model calls used that version, despite the activation mid-run',
    promptsSeen.length === 2 && promptsSeen.every(p => !p.includes('v-two')), String(promptsSeen.length));
  const st11 = body(await post(statusR.handler, { jobId: pinnedId }, A));
  ok('the finished job is returned without its prompt version', st11.status === 'complete' && !('promptVersion' in st11));

  // ── 12. Missing or incomplete prompt configuration fails safely ──
  packR.setPackStoreForTests({ async get() { return null; }, async set() {} });
  const before12 = modelCalls.length;
  r = await post(generateR.handler, { articleType: 'care_guide', fields: careFields }, A);
  ok('no active pack: the synchronous path refuses with prompt_config', r.statusCode === 503 && body(r).code === 'prompt_config', r.body);
  const noPackId = jobsR.newJobId();
  await post(backgroundR.handler, { jobId: noPackId, articleType: 'general_gift_guide', fields: giftFields }, A);
  const noPackRecord = await jobsR.get(noPackId);
  ok('no active pack: the background job is recorded as failed so the poll can say why',
    noPackRecord && noPackRecord.status === 'failed' && noPackRecord.code === 'prompt_config');
  ok('no active pack: the browser hears the safe message through the poll',
    body(await post(statusR.handler, { jobId: noPackId }, A)).code === 'prompt_config');
  const holed = loadPackJson(); delete holed.careGuide.document;
  packR.usePackForTests(holed, { version: 'holed', sign: signForTests });
  r = await post(generateR.handler, { articleType: 'care_guide', fields: careFields }, A);
  ok('an incomplete pack is refused before any model call', r.statusCode === 503 && body(r).code === 'prompt_config' && modelCalls.length === before12);
  ok('the refusal names no template and no content', !/careGuide|⟨|\{\{|shared\./.test(r.body), r.body);
  packR.usePackForTests(loadPackJson(), { version: 'v-one', sign: signForTests });

  // ── 13. Provider errors are not passed through ───────────────────
  modelBehaviour = req => {
    if (req.max_tokens > 1000) {
      const e = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt contains ⟨careGuide.document⟩ and more"}}');
      e.status = 400; throw e;
    }
    return H.metadataReply();
  };
  r = await post(generateR.handler, { articleType: 'care_guide', fields: careFields }, A);
  ok('a provider error reaches the browser as a safe classified message', r.statusCode === 502 && body(r).code === 'ai_rejected', r.body);
  ok('the provider\'s own message, which may quote the prompt, does not', !/⟨|invalid_request_error|prompt contains/.test(r.body));
  modelBehaviour = H.defaultReply;

  // ── 14. Unsafe HTML in a model reply never reaches the browser ───
  modelBehaviour = req => req.max_tokens > 1000
    ? H.articleReply('<p onclick="steal()">x</p><script>steal()</script><a href="javascript:steal()">y</a>')
    : H.metadataReply();
  r = await post(generateR.handler, { articleType: 'care_guide', fields: careFields }, A);
  const unsafe = body(r);
  ok('scripts, handlers and javascript links are removed from the returned HTML',
    r.statusCode === 200 && !/<script|onclick|javascript:/i.test(unsafe.html), unsafe.html && unsafe.html.slice(-120));
  ok('the content team is told something was removed', unsafe.warnings.some(w => /not safe to publish/.test(w)));
  modelBehaviour = H.defaultReply;

  // ── 15. Nothing confidential reaches browsers ────────────────────
  const { build, ALLOWLIST } = require(ROOT + '/tools/build-site.js');
  const published = build();
  ok('the published site is exactly the browser allowlist', JSON.stringify(published) === JSON.stringify([...ALLOWLIST].sort()), published.join(','));
  const publicText = published.map(f => fs.readFileSync(path.join(ROOT, 'public', f), 'utf8')).join('\n');
  ok('no server code, template name or pack marker is published',
    !/exports\.handler|REQUIRED_TEMPLATES|careGuide\.document|⟨|prompt-pack|SESSION_SECRET|SITE_PASSWORD/.test(publicText));
  const FP = require('./fixtures/editorial-fingerprints.json');
  const digests = new Set(FP.prints.map(p => p.sha256));
  const norm = publicText.replace(/\s+/g, ' ');
  let leak = false;
  for (let i = 0; i + 40 <= norm.length && !leak; i += 1) {
    if (digests.has(crypto.createHash('sha256').update(norm.slice(i, i + 40)).digest('hex'))) leak = true;
  }
  ok('no editorial fingerprint appears in the published site', !leak);
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  ok('Netlify publishes public/, not the repository root', /publish = "public"/.test(toml) && !/publish = "\."/.test(toml));
  ok('the build command produces public/', /node tools\/build-site\.js/.test(toml));
  const main = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
  const productsJs = fs.readFileSync(path.join(ROOT, 'app/products.js'), 'utf8');
  // Comments are stripped first: the code explains that it uses no storage, and
  // that explanation is not a use.
  const code = (main + '\n' + productsJs).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('the browser keeps no password or session in storage',
    !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(code));
  ok('the browser never sends a token in a request body', !/token:\s*_|token: ctx/.test(main + productsJs));
  ok('every protected browser request sends the CSRF header', (main.match(/'X-CSRF-Token'/g) || []).length >= 1 && /'X-CSRF-Token'/.test(productsJs));
  ok('there is no prompt-management or prompt-download endpoint',
    fs.readdirSync(path.join(ROOT, 'netlify/functions')).filter(f => f.endsWith('.js')).sort().join(',')
      === 'auth.js,generate-background.js,generate-status.js,generate.js,gift-catalog.js');
  const apiText = [unsafe, st11, mine, signed].map(x => JSON.stringify(x)).join('\n');
  ok('API responses carry no template markers or placeholders', !/⟨|\{\{/.test(apiText));

  // ── 17. Atomic job ownership under concurrency ──────────────────
  // The memory job store yields to the event loop on every operation, so these
  // calls genuinely interleave the way separate function instances do.
  for (const key of Object.keys(require.cache)) if (key.includes('/netlify/functions/')) delete require.cache[key];
  freshInstance();
  const J = require(ROOT + '/netlify/functions/lib/job-store');
  J.useMemoryStoreForTests();
  require(ROOT + '/netlify/functions/lib/counter-store').useMemoryCountersForTests();
  require(ROOT + '/netlify/functions/lib/prompt-pack').usePackForTests(loadPackJson(), { version: 'race', sign: signForTests });
  const BG = require(ROOT + '/netlify/functions/generate-background');
  const ST = require(ROOT + '/netlify/functions/generate-status');
  const S1 = H.newSession(), S2 = H.newSession();
  const C1 = asCookie(S1.token, S1.payload.csrf), C2 = asCookie(S2.token, S2.payload.csrf);

  const direct = J.newJobId();
  const claims = await Promise.all(Array.from({ length: 50 }, (_, i) => J.claim(direct, { scope: i % 2 ? S2.payload.sid : S1.payload.sid })));
  ok('50 simultaneous claims of one id from two sessions: exactly one wins', claims.filter(c => c.created).length === 1,
    String(claims.filter(c => c.created).length));

  const raceId = J.newJobId();
  const beforeRace = modelCalls.length;
  const raced = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    post(BG.handler, { jobId: raceId, articleType: 'general_gift_guide', fields: giftFields }, i % 2 ? C2 : C1)));
  const winners = raced.filter(r => !body(r).duplicate);
  ok('20 simultaneous submissions of one id from two sessions: one generation starts',
    winners.length === 1 && modelCalls.length - beforeRace === 2, `${winners.length} winners, ${modelCalls.length - beforeRace} model calls`);
  const raceRecord = await J.get(raceId);
  const winnerSid = raceRecord.scope;
  const [W, L] = winnerSid === S1.payload.sid ? [C1, C2] : [C2, C1];
  ok('the result is complete and carries the winning session\'s scope',
    raceRecord.status === 'complete' && (winnerSid === S1.payload.sid || winnerSid === S2.payload.sid));
  ok('the winning session reads its article', body(await post(ST.handler, { jobId: raceId }, W)).status === 'complete');
  const loserView = body(await post(ST.handler, { jobId: raceId }, L));
  ok('the losing session cannot read it', loserView.status === 'expired' && !loserView.html && !loserView.title);
  const resultBefore = J.getStore()._map.get(raceId + J.RESULT_SUFFIX);
  const forged = await Promise.all([
    J.completeJob(raceId, { html: '<p>forged</p>' }, null, { jobId: raceId, scope: 'intruder' }),
    J.failJob(raceId, 'forged failure', 'ai_failure', null, { jobId: raceId, scope: 'intruder' })
  ]);
  ok('the losing side cannot overwrite the result, complete or failed', forged.every(f => f.written === false)
    && J.getStore()._map.get(raceId + J.RESULT_SUFFIX) === resultBefore);
  const resubmit = await post(BG.handler, { jobId: raceId, articleType: 'general_gift_guide', fields: giftFields }, L);
  ok('a later resubmission by the loser starts nothing', body(resubmit).duplicate === true && modelCalls.length - beforeRace === 2);

  // The winner's ownership also survives a failed generation.
  modelBehaviour = req => { if (req.max_tokens > 1000) { const e = new Error('x'); e.status = 529; throw e; } return H.metadataReply(); };
  const failRace = J.newJobId();
  await Promise.all(Array.from({ length: 10 }, (_, i) =>
    post(BG.handler, { jobId: failRace, articleType: 'general_gift_guide', fields: giftFields }, i % 2 ? C2 : C1)));
  modelBehaviour = H.defaultReply;
  const failed = await J.get(failRace);
  const [FW, FL] = failed.scope === S1.payload.sid ? [C1, C2] : [C2, C1];
  ok('a failed job keeps the winner\'s scope', failed.status === 'failed' && (failed.scope === S1.payload.sid || failed.scope === S2.payload.sid));
  ok('the winner sees the failure; the loser sees nothing',
    body(await post(ST.handler, { jobId: failRace }, FW)).status === 'failed' && body(await post(ST.handler, { jobId: failRace }, FL)).status === 'expired');

  // Eventual consistency: the winner's own pending record may not be readable
  // yet when it finishes. The terminal record must still carry the winner's
  // scope, because it is built from the claim the winner holds in memory, not
  // from a re-read that could come back empty (and unscoped).
  const lagId = J.newJobId();
  const lagStore = J.getStore();
  const realGet = lagStore.get.bind(lagStore);
  lagStore.get = async key => (key === lagId ? null : realGet(key));
  await post(BG.handler, { jobId: lagId, articleType: 'general_gift_guide', fields: giftFields }, C1);
  lagStore.get = realGet;
  const lagged = JSON.parse(lagStore._map.get(lagId + J.RESULT_SUFFIX));
  ok('with the pending record not yet visible, the result still carries the winner\'s scope',
    lagged.status === 'complete' && lagged.scope === S1.payload.sid, String(lagged.scope));
  ok('and another session still cannot read it', body(await post(ST.handler, { jobId: lagId }, C2)).status === 'expired');

  // A store with no conditional create is refused outright: no job, no model call.
  J.setStoreForTests({ async get() { return null; }, async set() {} });
  const beforeNoCas = modelCalls.length;
  const noCas = await post(BG.handler, { jobId: J.newJobId(), articleType: 'general_gift_guide', fields: giftFields }, C1);
  ok('without a conditional create, no job is started and no model is called',
    noCas.statusCode === 500 && body(noCas).code === 'job_store_unavailable' && modelCalls.length === beforeNoCas, noCas.body);

  // ── 18. Sign-out revokes the session on the server ──────────────
  for (const key of Object.keys(require.cache)) if (key.includes('/netlify/functions/')) delete require.cache[key];
  freshInstance();
  require(ROOT + '/netlify/functions/lib/job-store').useMemoryStoreForTests();
  require(ROOT + '/netlify/functions/lib/counter-store').useMemoryCountersForTests();
  require(ROOT + '/netlify/functions/lib/prompt-pack').usePackForTests(loadPackJson(), { version: 'rv', sign: signForTests });
  const AUTH1 = require(ROOT + '/netlify/functions/auth');
  const STATUS1 = require(ROOT + '/netlify/functions/generate-status');
  const GEN1 = require(ROOT + '/netlify/functions/generate');
  const signIn = await AUTH1.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: H.TEST_ENV.SITE_PASSWORD }) });
  // Captured: the cookie and the CSRF value, exactly as an attacker who copied
  // a request would hold them.
  const captured = asCookie(sessionFrom(signIn), body(signIn).csrfToken);
  const bystander = H.newSession();
  const BY = asCookie(bystander.token, bystander.payload.csrf);
  ok('the captured session works before sign-out', (await post(STATUS1.handler, { jobId: jobs.newJobId() }, captured)).statusCode === 200);
  const out = await post(AUTH1.handler, { action: 'logout' }, captured);
  ok('sign-out reports the session revoked on the server', out.statusCode === 200 && body(out).revoked === true);
  // A fresh request that ignores the cookie-clearing response and replays the
  // original cookie and CSRF value.
  const replaySame = await post(STATUS1.handler, { jobId: jobs.newJobId() }, captured);
  ok('replaying the cookie and CSRF value after sign-out is refused (same instance)', replaySame.statusCode === 401, String(replaySame.statusCode));
  const replayGen = await post(GEN1.handler, { articleType: 'care_guide', fields: careFields }, captured);
  ok('the replay cannot generate either', replayGen.statusCode === 401);
  // A different function instance: fresh modules, nothing in memory, only the
  // shared revocation store.
  for (const key of Object.keys(require.cache)) if (key.includes('/netlify/functions/')) delete require.cache[key];
  freshInstance();
  require(ROOT + '/netlify/functions/lib/revocations').forgetLocalForTests();
  require(ROOT + '/netlify/functions/lib/job-store').useMemoryStoreForTests();
  require(ROOT + '/netlify/functions/lib/counter-store').useMemoryCountersForTests();
  require(ROOT + '/netlify/functions/lib/prompt-pack').usePackForTests(loadPackJson(), { version: 'rv', sign: signForTests });
  const STATUS2 = require(ROOT + '/netlify/functions/generate-status');
  const CAT2 = require(ROOT + '/netlify/functions/gift-catalog');
  const replayOther = await post(STATUS2.handler, { jobId: jobs.newJobId() }, captured);
  ok('replaying it on another function instance is refused too', replayOther.statusCode === 401, String(replayOther.statusCode));
  ok('and on every protected endpoint', (await post(CAT2.handler, { catalogType: 'gift' }, captured)).statusCode === 401);
  ok('other sessions are unaffected by one sign-out', (await post(STATUS2.handler, { jobId: jobs.newJobId() }, BY)).statusCode === 200);
  const revKeys = [...sharedRevocations.keys()];
  const capturedSid = JSON.parse(Buffer.from(captured.cookie.split('=')[1].split('.')[1], 'base64url').toString()).sid;
  const capturedRecord = sharedRevocations.get('revoked/' + capturedSid);
  ok('the revocation is keyed by the opaque session id and holds only times',
    revKeys.every(k => /^revoked\/[0-9a-f]{32}$/.test(k)) && !!capturedRecord
    && Object.keys(JSON.parse(capturedRecord)).sort().join(',') === 'exp,revokedAt'
    && !capturedRecord.includes(captured.cookie.split('=')[1]) && !capturedRecord.includes(captured['x-csrf-token']), capturedRecord);
  // Fail closed: if revocations cannot be read, nobody gets in.
  const revMod = require(ROOT + '/netlify/functions/lib/revocations');
  const savedStore = revMod.getStore();
  revMod.resetRevocationsForTests();
  const beforeRevOut = modelCalls.length;
  const unreadable = await post(require(ROOT + '/netlify/functions/generate').handler, { articleType: 'care_guide', fields: careFields }, BY);
  ok('an unreadable revocation store refuses the request (fail closed)',
    unreadable.statusCode === 503 && body(unreadable).code === 'session_check_unavailable' && modelCalls.length === beforeRevOut, unreadable.body);
  const AUTH3 = require(ROOT + '/netlify/functions/auth');
  const outUnrecorded = await post(AUTH3.handler, { action: 'logout' }, BY);
  ok('a sign-out that cannot be recorded still clears the cookie and says the session was not ended',
    outUnrecorded.statusCode === 503 && body(outUnrecorded).revoked === false && /could not be ended on the server/.test(body(outUnrecorded).error)
    && cookiesOf(outUnrecorded).some(c => /Max-Age=0/.test(c)));
  revMod.useMemoryRevocationsForTests(sharedRevocations);
  void savedStore;

  // ── 19. Throttle and usage limits fail closed ───────────────────
  for (const key of Object.keys(require.cache)) if (key.includes('/netlify/functions/')) delete require.cache[key];
  freshInstance();
  const cnt = require(ROOT + '/netlify/functions/lib/counter-store');
  cnt.useMemoryCountersForTests();
  const broken = cnt.getStore();
  broken.list = async () => { throw new Error('store down'); };
  const AUTH4 = require(ROOT + '/netlify/functions/auth');
  const downLogin = await AUTH4.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: H.TEST_ENV.SITE_PASSWORD }) });
  ok('sign-in is refused, not unthrottled, when the throttle store is down',
    downLogin.statusCode === 503 && body(downLogin).code === 'login_unavailable' && cookiesOf(downLogin).length === 0, downLogin.body);
  require(ROOT + '/netlify/functions/lib/job-store').useMemoryStoreForTests();
  require(ROOT + '/netlify/functions/lib/prompt-pack').usePackForTests(loadPackJson(), { version: 'fc', sign: signForTests });
  const GEN4 = require(ROOT + '/netlify/functions/generate');
  const BG4 = require(ROOT + '/netlify/functions/generate-background');
  const beforeLimits = modelCalls.length;
  const downGen = await post(GEN4.handler, { articleType: 'care_guide', fields: careFields }, BY);
  ok('generation is refused when usage cannot be checked', downGen.statusCode === 503 && body(downGen).code === 'limits_unavailable'
    && modelCalls.length === beforeLimits, downGen.body);
  broken.list = async ({ prefix } = {}) => ({ blobs: [...broken._map.keys()].filter(k => !prefix || k.startsWith(prefix)).map(key => ({ key })) });
  broken.set = async () => { throw new Error('store down'); };
  const noRecord = await post(GEN4.handler, { articleType: 'care_guide', fields: careFields }, BY);
  ok('generation is refused when usage cannot be recorded, so nothing runs uncounted',
    noRecord.statusCode === 503 && body(noRecord).code === 'limits_unavailable' && modelCalls.length === beforeLimits, noRecord.body);
  const unrecordedJob = jobs.newJobId();
  await post(BG4.handler, { jobId: unrecordedJob, articleType: 'general_gift_guide', fields: giftFields }, BY);
  const unrecorded = await require(ROOT + '/netlify/functions/lib/job-store').get(unrecordedJob);
  ok('a background job whose usage cannot be recorded fails on its own record, without a model call',
    unrecorded && unrecorded.status === 'failed' && unrecorded.code === 'limits_unavailable' && modelCalls.length === beforeLimits);

  // ── 20. Maintenance pause ───────────────────────────────────────
  for (const key of Object.keys(require.cache)) if (key.includes('/netlify/functions/')) delete require.cache[key];
  freshInstance();
  require(ROOT + '/netlify/functions/lib/counter-store').useMemoryCountersForTests();
  require(ROOT + '/netlify/functions/lib/job-store').useMemoryStoreForTests();
  require(ROOT + '/netlify/functions/lib/prompt-pack').usePackForTests(loadPackJson(), { version: 'mt', sign: signForTests });
  H.applyTestEnv({ GENERATION_PAUSED: 'true' });
  const AUTH5 = require(ROOT + '/netlify/functions/auth');
  const GEN5 = require(ROOT + '/netlify/functions/generate');
  const BG5 = require(ROOT + '/netlify/functions/generate-background');
  const ST5 = require(ROOT + '/netlify/functions/generate-status');
  const beforePause = modelCalls.length;
  const pausedSync = await post(GEN5.handler, { articleType: 'care_guide', fields: careFields }, BY);
  ok('paused: synchronous generation is refused with "maintenance"', pausedSync.statusCode === 503 && body(pausedSync).code === 'maintenance');
  const pausedJob = jobs.newJobId();
  await post(BG5.handler, { jobId: pausedJob, articleType: 'general_gift_guide', fields: giftFields }, BY);
  ok('paused: a background submission tells the poll it is paused', body(await post(ST5.handler, { jobId: pausedJob }, BY)).code === 'maintenance');
  ok('paused: no model call at all', modelCalls.length === beforePause);
  const pausedLogin = await AUTH5.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: H.TEST_ENV.SITE_PASSWORD }) });
  ok('paused: sign-in still works and still issues a signed HttpOnly session',
    pausedLogin.statusCode === 200 && cookiesOf(pausedLogin).some(c => /HttpOnly/.test(c)));
  ok('paused: authorisation is still enforced', (await post(GEN5.handler, { articleType: 'care_guide', fields: careFields }, {})).statusCode === 401);
  H.applyTestEnv({ GENERATION_PAUSED: '' });

  // ── 21. A preview without its own channel refuses to generate ───
  for (const key of Object.keys(require.cache)) if (key.includes('/netlify/functions/')) delete require.cache[key];
  freshInstance();
  require(ROOT + '/netlify/functions/lib/deploy-context').setDeployContextForTests('deploy-preview');
  require(ROOT + '/netlify/functions/lib/counter-store').useMemoryCountersForTests();
  require(ROOT + '/netlify/functions/lib/job-store').useMemoryStoreForTests();
  require(ROOT + '/netlify/functions/lib/prompt-pack').usePackForTests(loadPackJson(), { version: 'prod-only', sign: signForTests });
  const GEN6 = require(ROOT + '/netlify/functions/generate');
  const beforePreview = modelCalls.length;
  for (const [label, ch] of [['unset', undefined], ['"production"', 'production'], ['invalid', 'Bad Channel!']]) {
    if (ch === undefined) delete process.env.PROMPT_PACK_CHANNEL; else process.env.PROMPT_PACK_CHANNEL = ch;
    const r6 = await post(GEN6.handler, { articleType: 'care_guide', fields: careFields }, BY);
    ok(`deploy preview with PROMPT_PACK_CHANNEL ${label}: generation refused with prompt_config, no model call`,
      r6.statusCode === 503 && body(r6).code === 'prompt_config' && modelCalls.length === beforePreview, r6.body);
  }
  delete process.env.PROMPT_PACK_CHANNEL;
  require(ROOT + '/netlify/functions/lib/deploy-context').setDeployContextForTests('production');

  // ── 16. Logs ─────────────────────────────────────────────────────
  const all = logged.join('\n');
  ok('logs never contain the password', !all.includes(H.TEST_ENV.SITE_PASSWORD));
  ok('logs never contain the session secret', !all.includes(H.TEST_ENV.SESSION_SECRET));
  ok('logs never contain a signed session or a CSRF value',
    ![token, alice.token, bob.token].some(t => all.includes(t)) && ![signed.csrfToken, alice.payload.csrf, bob.payload.csrf].some(c => all.includes(c)));
  ok('logs never contain the API key', !all.includes(H.TEST_ENV.ANTHROPIC_API_KEY));
  ok('logs never contain prompt content', !/⟨[a-zA-Z]/.test(all), (all.match(/.{0,40}⟨.{0,40}/) || [''])[0]);
  ok('logs never contain a client address in the clear', !/203\.0\.113\.7|198\.51\.100\.4|192\.0\.2\.55/.test(all));

  fs.rmSync(path.join(ROOT, 'public'), { recursive: true, force: true });
  console.log = realLog; console.error = realError; console.warn = realWarn;
  const failures = results.filter(x => x.startsWith('FAIL'));
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures.length} checks passed`);
  console.log(`\n${failures.length} failures of ${results.length}`);
  process.exitCode = failures.length ? 1 : 0;
})().catch(err => {
  console.log = realLog; console.error = realError;
  console.error('security suite crashed:', err && err.stack);
  process.exitCode = 1;
});
