// Server-side revocation of individual sessions.
//
// Sessions are signed and stateless, so a session string stays valid until it
// expires unless the server remembers otherwise. Clearing the cookie on sign-out
// only asks the browser to forget it: a copy taken earlier (a captured request,
// a synced browser profile, a proxy log) would still work. So sign-out also
// records the session id here, and every authorised request checks it.
//
// One key per revoked session, `revoked/<sid>`, in its own Blobs store. The key
// is new when it is written, never updated, and it carries the session's own
// expiry, after which it is no longer needed.
//
// PROPAGATION. On the instance that handled the sign-out the revocation applies
// immediately (it is cached in memory there). Elsewhere it applies as soon as the
// Blobs read sees the new key. Netlify documents edge propagation of changes as
// "within 60 seconds"; a new key is normally visible at once, but a lookup that
// an edge location answered "not found" for shortly before may be served from
// cache until that window passes. Treat revocation as complete everywhere within
// about 60 seconds. Strong consistency would close the window, but the Lambda
// compatibility layer does not provide the uncached endpoint it needs.
//
// FAIL CLOSED. If the store cannot be read, the request is refused: a sign-out
// that cannot be checked is treated as if it might have happened.

const STORE_NAME = 'session-revocations';
const PREFIX = 'revoked/';

let injectedStore = null;
const revokedHere = new Set();   // sids revoked by this instance

function loadBlobs() { return require('@netlify/blobs'); }

function connectRevocations(event) {
  if (injectedStore) return { connected: false, injected: true };
  const blobs = loadBlobs();
  if (typeof blobs.connectLambda !== 'function') throw new Error('The installed @netlify/blobs does not provide connectLambda.');
  if (!event || typeof event.blobs !== 'string' || !event.blobs) throw new Error('This invocation carries no Netlify Blobs context.');
  blobs.connectLambda(event);
  return { connected: true, injected: false };
}

function getStore() {
  if (injectedStore) return injectedStore;
  return loadBlobs().getStore({ name: STORE_NAME });
}

function useMemoryRevocationsForTests(sharedMap) {
  const map = sharedMap || new Map();
  injectedStore = {
    async get(key) { await new Promise(r => setImmediate(r)); return map.has(key) ? map.get(key) : null; },
    async set(key, value) { await new Promise(r => setImmediate(r)); map.set(key, value); },
    _map: map,
    _isMemoryTestStore: true
  };
  revokedHere.clear();
  return injectedStore;
}
function resetRevocationsForTests() { injectedStore = null; revokedHere.clear(); }
// Forget this instance's memory, as a different function instance would have.
function forgetLocalForTests() { revokedHere.clear(); }

const SID_PATTERN = /^[0-9a-f]{32}$/;

async function revoke(session) {
  if (!session || !SID_PATTERN.test(session.sid)) throw new Error('Not a session that can be revoked.');
  revokedHere.add(session.sid);
  await getStore().set(PREFIX + session.sid, JSON.stringify({
    revokedAt: new Date().toISOString(),
    exp: session.exp
  }));
}

// Throws when the store cannot be read; the caller refuses the request.
async function isRevoked(sid) {
  if (!SID_PATTERN.test(String(sid || ''))) return true;
  if (revokedHere.has(sid)) return true;
  const body = await getStore().get(PREFIX + sid, { type: 'text' });
  if (body) { revokedHere.add(sid); return true; }
  return false;
}

module.exports = {
  connectRevocations, getStore, revoke, isRevoked,
  useMemoryRevocationsForTests, resetRevocationsForTests, forgetLocalForTests,
  STORE_NAME, PREFIX
};
