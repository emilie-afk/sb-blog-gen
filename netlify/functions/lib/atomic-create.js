// Create a blob only if the key does not exist yet, as ONE conditional request
// that the storage service decides. Exactly one of any number of concurrent
// callers can succeed for a key.
//
// WHY. Reading first and writing only when nothing is there is not safe across
// function instances: two instances can both read "nothing" and both write. That
// is how a single job id could start two generations, or how a second session
// could overwrite the first session's job record.
//
// HOW. The supported @netlify/blobs API: `store.set(key, value, { onlyIfNew:
// true })` (available from @netlify/blobs 10). The library sends the PUT with
// `If-None-Match: *`; the service writes only when no entry exists and otherwise
// answers 412 Precondition Failed, which the library reports as
// `{ modified: false }`.
//
// ONE GAP IN THE LIBRARY, CLOSED HERE. For a conditional write, @netlify/blobs
// (checked in 10.7.13 and 11.1.x) reports `{ modified: true }` for ANY status
// other than 412, including a 401, 403 or a 5xx that is still failing after its
// retries. Taken at face value that would hand a "win" to a caller whose write
// never happened, and two callers could both start the same job. So the store
// used for ownership is created with the library's public `fetch` option set to
// a wrapper that throws for a conditional PUT answered with anything other than
// 2xx or 412. The library retries a thrown request and then rethrows it, so an
// unexpected answer always ends as an error, never as a win. A retry after a
// write that did land but was answered with an error sees 412 and reports a
// loss: the job is then refused rather than run twice.
//
// WHAT THIS RELIES ON, stated plainly: the Netlify Blobs service evaluating
// `If-None-Match: *` atomically per key. Netlify documents onlyIfNew as an
// atomic conditional write. The local suites prove the real library sends the
// header through this wrapper and that both answers are handled; only the deploy
// preview check (docs/ROLLOUT.md, step 4) proves the service's side.
//
// IT NEVER FALLS BACK to read-then-write, and never to a plain write. A store
// that was not created here (or marked by a test seam) is refused, as is an
// installed @netlify/blobs older than 10, whose `set` would silently ignore
// `onlyIfNew` and overwrite.

const PRECONDITION_FAILED = 412;
const MIN_BLOBS_MAJOR = 10;
const CONDITIONAL = Symbol.for('sb-blog-gen.conditional-create-store');

class ConditionalWriteError extends Error {
  constructor(status) {
    super(`The conditional write was answered with HTTP ${status}, so ownership was not decided.`);
    this.name = 'ConditionalWriteError';
    this.status = status;
  }
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name) || undefined;
  for (const k of Object.keys(headers)) if (k.toLowerCase() === name) return headers[k];
  return undefined;
}

function isConditionalCreate(init) {
  return !!init && String(init.method || '').toLowerCase() === 'put' &&
    headerValue(init.headers, 'if-none-match') === '*';
}

// Wraps the fetch the Blobs client uses. Only conditional creates are checked;
// every other request passes through untouched.
function guardedFetch(baseFetch) {
  return async function conditionalWriteGuard(url, init) {
    const res = await (baseFetch || globalThis.fetch)(url, init);
    if (isConditionalCreate(init)) {
      const ok = (res.status >= 200 && res.status < 300) || res.status === PRECONDITION_FAILED;
      if (!ok) throw new ConditionalWriteError(res.status);
    }
    return res;
  };
}

function installedBlobsVersion() {
  return require('@netlify/blobs/package.json').version;
}

function assertSupportedBlobs(version) {
  const v = version || installedBlobsVersion();
  const major = parseInt(String(v).split('.')[0], 10);
  if (!(major >= MIN_BLOBS_MAJOR)) {
    throw new Error(`@netlify/blobs ${v} has no onlyIfNew; ${MIN_BLOBS_MAJOR} or later is required for job ownership.`);
  }
  return v;
}

// The only way to get a real store that createIfAbsent will accept.
function getConditionalStore(blobs, name, options) {
  assertSupportedBlobs(options && options.version);
  const store = blobs.getStore({ name, fetch: guardedFetch(options && options.fetch) });
  Object.defineProperty(store, CONDITIONAL, { value: true });
  return store;
}

// Test seam: an in-memory store whose set() honours onlyIfNew itself.
function markConditionalStoreForTests(store) {
  Object.defineProperty(store, CONDITIONAL, { value: true });
  return store;
}

async function createIfAbsent(store, key, value) {
  if (!store || store[CONDITIONAL] !== true || typeof store.set !== 'function') {
    throw new Error('This store cannot perform a guarded conditional create, so ownership cannot be decided safely.');
  }
  const result = await store.set(key, value, { onlyIfNew: true });
  if (!result || typeof result.modified !== 'boolean') {
    throw new Error('The store did not report whether the conditional create happened, so ownership cannot be decided safely.');
  }
  return { created: result.modified };
}

module.exports = {
  createIfAbsent, getConditionalStore, guardedFetch, assertSupportedBlobs,
  markConditionalStoreForTests, ConditionalWriteError, PRECONDITION_FAILED, MIN_BLOBS_MAJOR
};
