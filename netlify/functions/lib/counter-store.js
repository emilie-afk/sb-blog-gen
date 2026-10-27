// Durable counters for login throttling and usage limits, backed by Netlify
// Blobs. Separate from the job store so a counter can never collide with a job
// record and so the two can be cleared independently.
//
// WHY ONE KEY PER EVENT, NOT ONE COUNTER BLOB. The store is eventually
// consistent: a brand new key is visible globally straight away, while an UPDATE
// to an existing key can take up to a minute to propagate. A single
// read-modify-write counter would therefore lose increments between concurrent
// function instances, which is exactly the case a rate limit has to survive. So
// each event writes its own new key under a prefix, and counting means listing
// that prefix. Nothing is ever updated in place.
//
// HONEST LIMITATION. Listing is itself eventually consistent, so a burst of
// requests arriving inside the propagation window can be undercounted. These
// limits are a brake on repeated guessing and runaway spend, not a hard
// real-time quota, and docs/SECURITY.md says so plainly.
//
// Keys hold no personal data: an address is hashed with the session secret
// before it is used in a key, and the value written is a single character.

const crypto = require('crypto');

const STORE_NAME = 'app-counters';
// A listing is walked in full to count and to prune, so a prefix that could grow
// without bound is a liability. Pruning is capped per call to keep a request
// fast; anything above the cap is removed by later calls.
const MAX_PRUNE_PER_CALL = 50;

let injectedStore = null;   // set only by tests

function loadBlobs() {
  return require('@netlify/blobs');
}

// Safe to call more than once per invocation, and safe to call after the job
// store has already connected: connectLambda only reads the context off the
// event and sets the environment for this process.
function connectCounters(event) {
  if (injectedStore) return { connected: false, injected: true };
  const blobs = loadBlobs();
  if (typeof blobs.connectLambda !== 'function') {
    throw new Error('The installed @netlify/blobs does not provide connectLambda.');
  }
  if (!event || typeof event.blobs !== 'string' || !event.blobs) {
    throw new Error('This invocation carries no Netlify Blobs context.');
  }
  blobs.connectLambda(event);
  return { connected: true, injected: false };
}

function getStore() {
  if (injectedStore) return injectedStore;
  return loadBlobs().getStore({ name: STORE_NAME });
}

// Test seam. A map keyed exactly like the real store, with the three methods
// this module uses.
function useMemoryCountersForTests() {
  const map = new Map();
  injectedStore = {
    async set(key, value) { map.set(key, value); },
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async delete(key) { map.delete(key); },
    async list({ prefix } = {}) {
      const blobs = [];
      for (const key of map.keys()) {
        if (!prefix || key.startsWith(prefix)) blobs.push({ key });
      }
      return { blobs, directories: [] };
    },
    _map: map,
    _isMemoryTestStore: true
  };
  return injectedStore;
}
function resetCountersForTests() { injectedStore = null; }

// An IP address is personal data and never becomes a storage key in the clear.
// The site's own secret is the HMAC key, so the digests cannot be reversed with
// a dictionary of addresses by anyone who somehow reads the store listing.
function hashIdentifier(value, secret) {
  return crypto.createHmac('sha256', String(secret || 'no-secret'))
    .update(String(value || 'unknown'))
    .digest('hex')
    .slice(0, 24);
}

// Netlify puts the caller's address in x-nf-client-connection-ip; the forwarded
// header is the fallback and only its first entry is used, because the rest can
// be set by the caller.
function clientAddress(event) {
  const headers = (event && event.headers) || {};
  const pick = name => {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === name) return headers[key];
    }
    return '';
  };
  const direct = pick('x-nf-client-connection-ip');
  if (direct) return String(direct).trim();
  const forwarded = pick('x-forwarded-for');
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return 'unknown';
}

function keyTimestamp(key) {
  const tail = key.slice(key.lastIndexOf('/') + 1);
  const ts = parseInt(tail.split('-')[0], 10);
  return Number.isFinite(ts) ? ts : 0;
}

// Records one event under a prefix. The key is new every time, so it is visible
// to other instances immediately.
async function record(prefix, now) {
  const at = typeof now === 'number' ? now : Date.now();
  const key = `${prefix}/${at}-${crypto.randomBytes(6).toString('hex')}`;
  await getStore().set(key, '1');
  return key;
}

// Counts events under a prefix inside a window, pruning what has aged out. The
// prune is best effort: a failure to delete is never allowed to fail the count,
// because a stale key costs storage while a failed count would deny a legitimate
// request.
async function countWithin(prefix, windowMs, now) {
  const at = typeof now === 'number' ? now : Date.now();
  const cutoff = at - windowMs;
  const store = getStore();

  let listing;
  try {
    listing = await store.list({ prefix });
  } catch (err) {
    // Reported to the caller, which decides whether to fail open or closed.
    const error = new Error('The counter store could not be listed.');
    error.cause = err && err.message;
    throw error;
  }

  const blobs = (listing && listing.blobs) || [];
  let count = 0;
  const stale = [];
  for (const blob of blobs) {
    const ts = keyTimestamp(blob.key);
    if (ts >= cutoff) count += 1;
    else stale.push(blob.key);
  }

  for (const key of stale.slice(0, MAX_PRUNE_PER_CALL)) {
    try { await store.delete(key); } catch { /* pruning is best effort */ }
  }

  return count;
}

// Clears a whole prefix. Used when a correct password retires that address's
// failed attempts, so one success does not leave a user throttled.
async function clearPrefix(prefix) {
  const store = getStore();
  let listing;
  try {
    listing = await store.list({ prefix });
  } catch {
    return 0;
  }
  const blobs = (listing && listing.blobs) || [];
  let removed = 0;
  for (const blob of blobs) {
    try { await store.delete(blob.key); removed += 1; } catch { /* best effort */ }
  }
  return removed;
}

module.exports = {
  connectCounters, getStore, record, countWithin, clearPrefix,
  hashIdentifier, clientAddress,
  useMemoryCountersForTests, resetCountersForTests,
  STORE_NAME, MAX_PRUNE_PER_CALL,
  _internals: { keyTimestamp }
};
