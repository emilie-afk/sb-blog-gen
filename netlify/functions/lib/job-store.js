// Durable storage for background generation jobs, backed by Netlify Blobs.
//
// LAMBDA COMPATIBILITY. These functions export a Lambda style handler
// (exports.handler = async (event) => {}), which is not the Netlify Functions v2
// signature, so the Blobs client cannot pick the environment up on its own. Every
// handler that touches this store must call connectJobStore(event) first: it runs
// @netlify/blobs connectLambda(event), which reads the base64 blobs context off
// the invocation and sets siteID, token, edgeURL and deployID. Without it,
// getStore() throws MissingBlobsEnvironmentError, which is exactly the production
// failure this module used to swallow.
//
// CONSISTENCY. The store uses the default, eventual consistency. connectLambda
// does not provide uncachedEdgeURL, and @netlify/blobs throws BlobsConsistencyError
// on a strong-consistency read without it. That was true in 8.2.0 and is still
// true in the installed 10.7.13 and in 11.1.x, so no upgrade buys strong consistency in Lambda mode, and
// uncachedEdgeURL is never invented here.
//
// Eventual consistency shapes how records are written. A NEW blob is available
// globally straight away; an UPDATE to an existing key can take up to 60 seconds
// to propagate. So the terminal record (complete or failed) is written under its
// own key rather than overwriting the pending one, and a read checks the terminal
// key first. The pending record is itself a new key, so it appears immediately.
//
// NO PRODUCTION FALLBACK. Two function instances never share process memory, so a
// memory map cannot store a real job: a failure here throws and the caller reports
// job_store_unavailable. The memory store exists only when a test installs it
// explicitly through useMemoryStoreForTests().
//
// A record holds no prompts and no credentials: status, timestamps, the finished
// payload, and an error message already made safe for the browser.
//
// ACCESS SCOPE. Every record carries the session id that created it. A job id is
// a reference, not a capability: generate-status will only return a record to a
// caller whose signed session matches the scope stored on it. The session id is
// a random opaque value, not a credential, so storing it grants nothing to
// anyone who reads the store; the signed cookie is what proves a caller holds
// that session, and no cookie, token or password is ever written to a record.
//
// PROMPT VERSION. The pack version a job started with is stamped on the record
// so a later prompt edit cannot change a job that is already running, and so an
// article can be traced back to the instructions that produced it. The version
// identifier is recorded; the prompt content never is.

const { createIfAbsent, getConditionalStore, markConditionalStoreForTests } = require('./atomic-create');

const STORE_NAME = 'article-jobs';
const TTL_MS = 60 * 60 * 1000;   // an hour: long enough to come back to a tab
const RESULT_SUFFIX = '.result';

let injectedStore = null;     // set only by tests
let connected = false;

function loadBlobs() {
  // Deliberately not wrapped: a missing dependency is a deployment fault and
  // must surface, not degrade into a store that loses jobs.
  return require('@netlify/blobs');
}

// Called at the top of every handler that reaches the store. Safe to call more
// than once. Throws when the invocation carries no Blobs context, because
// continuing would mean writing jobs somewhere the status function cannot read.
function connectJobStore(event) {
  if (injectedStore) return { connected: false, injected: true };

  const blobs = loadBlobs();
  if (typeof blobs.connectLambda !== 'function') {
    throw new Error('The installed @netlify/blobs does not provide connectLambda.');
  }
  if (!event || typeof event.blobs !== 'string' || !event.blobs) {
    throw new Error('This invocation carries no Netlify Blobs context.');
  }
  blobs.connectLambda(event);
  connected = true;
  return { connected: true, injected: false };
}

function getStore() {
  if (injectedStore) return injectedStore;
  const blobs = loadBlobs();
  // Default consistency: see the CONSISTENCY note above. getStore throws
  // MissingBlobsEnvironmentError when connectJobStore has not run. The store is
  // created through atomic-create so its conditional creates are guarded.
  return getConditionalStore(blobs, STORE_NAME);
}

// Test seam. Nothing in production may call these.
// Every operation yields to the event loop before touching the map, so
// concurrent callers really do interleave the way separate function instances
// would. A read-then-write claim races under this store; createIfAbsent, which
// checks and writes in one step, does not.
function useMemoryStoreForTests() {
  const map = new Map();
  const tick = () => new Promise(r => setImmediate(r));
  // set() follows the @netlify/blobs 10 contract: with { onlyIfNew: true } the
  // check and the write happen in one step and the answer is { modified }.
  injectedStore = markConditionalStoreForTests({
    async set(key, value, options) {
      await tick();
      if (options && options.onlyIfNew && map.has(key)) return { modified: false };
      map.set(key, value);
      return { modified: true, etag: 'memory' };
    },
    async get(key) { await tick(); return map.has(key) ? map.get(key) : null; },
    _map: map,
    _isMemoryTestStore: true
  });
  return injectedStore;
}
function setStoreForTests(store) { injectedStore = store; return injectedStore; }
function resetStoreForTests() { injectedStore = null; connected = false; }
function isConnected() { return connected; }

// job_<base36 submit time>_<random>. The browser mints the id and the same id is
// used end to end, because a Netlify background invocation answers with an empty
// 202 and never returns a body to the browser. A job that runs under any other
// id cannot be polled at all: the browser only ever knows the id it minted.
const JOB_ID_PATTERN = /^job_([0-9a-z]{6,12})_([0-9a-z]{6,40})$/;
const EARLIEST_PLAUSIBLE_MS = Date.UTC(2020, 0, 1);

function newJobId() {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return 'job_' + Date.now().toString(36) + '_' + rand() + rand();
}

// Reads the submit time out of a job id without trusting it for anything but
// timing. An id whose shape or timestamp is not plausible is rejected outright.
// ANY timestamp ahead of the server clock is clamped to now, with no skew
// allowance: a tolerated future timestamp would add its own offset to the
// startup grace period, so even a minute of drift would stretch 90 seconds of
// grace into several minutes. Clamping means a forged id can only ever shorten
// the grace it would get, never extend it or reach another job's record.
function parseJobId(jobId) {
  const id = typeof jobId === 'string' ? jobId.trim() : '';
  const match = JOB_ID_PATTERN.exec(id);
  if (!match) return { valid: false };

  const submittedAt = parseInt(match[1], 36);
  if (!Number.isFinite(submittedAt) || submittedAt < EARLIEST_PLAUSIBLE_MS) return { valid: false };

  const now = Date.now();
  if (submittedAt > now) return { valid: true, jobId: id, submittedAt: now, ageMs: 0 };
  return { valid: true, jobId: id, submittedAt, ageMs: now - submittedAt };
}

function isExpired(record) {
  return !record || (Date.now() - new Date(record.createdAt).getTime()) > TTL_MS;
}

async function put(key, record) {
  const store = getStore();
  await store.set(key, JSON.stringify(record));
  return record;
}

async function readKey(key) {
  const store = getStore();
  const body = await store.get(key, { type: 'text' });
  if (!body) return null;
  try { return JSON.parse(body); } catch { return null; }
}

// Terminal record first: it is a separate, newly created key, so it is visible
// as soon as it is written. The pending key is only read when no terminal record
// exists yet.
async function get(jobId) {
  const terminal = await readKey(jobId + RESULT_SUFFIX);
  if (terminal) return terminal;
  return readKey(jobId);
}

function pendingRecord(jobId, meta) {
  const now = new Date().toISOString();
  return {
    jobId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    // Non-identifying context only, so a status poll can show something useful.
    articleType: meta && meta.articleType,
    recommendationCount: meta && meta.recommendationCount,
    // Who may read this job, and which prompt version it is pinned to.
    scope: (meta && meta.scope) || null,
    promptVersion: (meta && meta.promptVersion) || null
  };
}

// OWNERSHIP. The pending record is created with a conditional create, so exactly
// one caller can create it, whichever instance it runs in and whichever session
// it carries. That caller owns the job: only it starts a generation, and only
// its scope is ever written into the job's records.
//
// Returns { created: true, record } to the single winner, and
// { created: false, existing } to everyone else. `existing` may be null when
// the winner's record is not yet visible to this reader; a loser never needs
// it, because losing means "do not run".
async function claim(jobId, meta) {
  const record = pendingRecord(jobId, meta);
  const { created } = await createIfAbsent(getStore(), jobId, JSON.stringify(record));
  if (created) return { created: true, record };
  let existing = null;
  try { existing = await get(jobId); } catch { existing = null; }
  return { created: false, existing };
}

// Kept for callers that only need the pending record; it goes through the same
// conditional create, so it cannot overwrite a job either.
async function createPending(jobId, meta) {
  const claimed = await claim(jobId, meta);
  if (!claimed.created) {
    throw Object.assign(new Error('That job id is already in use.'), { code: 'job_exists' });
  }
  return claimed.record;
}

// A record belongs to a scope when it was stamped with that scope.
//
// A record with no scope predates this change. It stays readable to a signed-in
// session only inside TTL_MS of its creation, which covers a job that was
// running at deploy time, and then retires on its own: no later deploy is
// needed to close the allowance, and an old unscoped result never becomes
// readable by id alone.
function isReadableBy(record, sid, now) {
  if (!record) return false;
  if (!record.scope) {
    const at = typeof now === 'number' ? now : Date.now();
    const created = new Date(record.createdAt).getTime();
    return Number.isFinite(created) && (at - created) <= TTL_MS;
  }
  return record.scope === sid;
}

// TERMINAL RECORDS. Written by the owner only, with the owner's record passed
// in rather than re-read from storage, so the scope on the result is the scope
// that won the claim, not whatever a later read happens to return. The terminal
// key is itself created conditionally: the first terminal outcome stands, and
// nothing, including a second writer, can replace it.
//
// `owner` is the record returned by claim(). Without it (older call sites and
// tests) the pending record is read back as before.
async function terminal(jobId, owner, fields) {
  const base = owner || (await readKey(jobId)) || { jobId, createdAt: new Date().toISOString() };
  const record = Object.assign({}, base, fields, { updatedAt: new Date().toISOString() });
  const { created } = await createIfAbsent(getStore(), jobId + RESULT_SUFFIX, JSON.stringify(record));
  return Object.assign(record, { written: created });
}

async function completeJob(jobId, payload, timing, owner) {
  return terminal(jobId, owner, { status: 'complete', timing: timing || null, result: payload });
}

async function failJob(jobId, error, code, timing, owner) {
  return terminal(jobId, owner, { status: 'failed', timing: timing || null, error, code: code || 'ai_failure' });
}

module.exports = {
  connectJobStore, getStore, isConnected,
  newJobId, parseJobId, createPending, claim, isReadableBy, completeJob, failJob, get, put, isExpired,
  TTL_MS, STORE_NAME, RESULT_SUFFIX, JOB_ID_PATTERN,
  useMemoryStoreForTests, setStoreForTests, resetStoreForTests
};
