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
// on a strong-consistency read without it. That is true in the installed 8.2.0 and
// still true in 11.1.0, so no upgrade buys strong consistency in Lambda mode, and
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
  // MissingBlobsEnvironmentError when connectJobStore has not run.
  return blobs.getStore({ name: STORE_NAME });
}

// Test seam. Nothing in production may call these.
function useMemoryStoreForTests() {
  const map = new Map();
  injectedStore = {
    async set(key, value) { map.set(key, value); },
    async get(key) { return map.has(key) ? map.get(key) : null; },
    _map: map,
    _isMemoryTestStore: true
  };
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

async function createPending(jobId, meta) {
  return put(jobId, {
    jobId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Non-identifying context only, so a status poll can show something useful.
    articleType: meta && meta.articleType,
    recommendationCount: meta && meta.recommendationCount
  });
}

async function completeJob(jobId, payload, timing) {
  const existing = (await readKey(jobId)) || { jobId, createdAt: new Date().toISOString() };
  return put(jobId + RESULT_SUFFIX, Object.assign({}, existing, {
    status: 'complete',
    updatedAt: new Date().toISOString(),
    timing: timing || null,
    result: payload
  }));
}

async function failJob(jobId, error, code, timing) {
  const existing = (await readKey(jobId)) || { jobId, createdAt: new Date().toISOString() };
  return put(jobId + RESULT_SUFFIX, Object.assign({}, existing, {
    status: 'failed',
    updatedAt: new Date().toISOString(),
    timing: timing || null,
    error: error,
    code: code || 'ai_failure'
  }));
}

module.exports = {
  connectJobStore, getStore, isConnected,
  newJobId, parseJobId, createPending, completeJob, failJob, get, put, isExpired,
  TTL_MS, STORE_NAME, RESULT_SUFFIX, JOB_ID_PATTERN,
  useMemoryStoreForTests, setStoreForTests, resetStoreForTests
};
