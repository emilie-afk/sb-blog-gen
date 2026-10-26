// Signed, expiring server sessions.
//
// WHAT THIS REPLACES. auth.js used to answer a correct password with the
// password itself as the "token", and every protected function compared the
// submitted token against SITE_PASSWORD. That meant the shared password was
// handed to the browser, travelled in the body of every request, and could be
// read out of any captured request forever: there was no expiry and no way to
// invalidate it short of changing the password for everyone.
//
// WHAT THIS IS INSTEAD. A session is a short string the server signs and the
// browser cannot forge or read usefully:
//
//     v1.<base64url(payload JSON)>.<base64url(HMAC-SHA256 of the payload)>
//
// The payload carries a random session id, the issue and expiry times, the
// invalidation epoch and a CSRF value. The password never appears in it, and
// nothing in it is secret: the signature is what makes it unforgeable, and
// SESSION_SECRET never leaves the server.
//
// EXPIRY is enforced here, on the server, from the signed `exp`. The cookie's
// own Max-Age is a convenience for the browser and is never trusted.
//
// INVALIDATION, two ways:
//   - one session: sign-out records the session id in a server-side revocation
//     store (lib/revocations.js), checked on every authorised request, so a
//     copy of the cookie and CSRF value stops working after sign-out
//   - every session: each one is stamped with SESSION_EPOCH; raising it in the
//     Netlify UI invalidates every session issued before it, without changing
//     the password. See docs/SECURITY.md.
//
// CSRF. The session rides in a cookie, so the browser attaches it to any request
// an attacker's page can cause. SameSite=Strict blocks the common cases; the
// CSRF value is the part that does not depend on browser behaviour. It is signed
// into the session, returned to the browser in the login response body (never in
// a cookie, never in storage), and must come back in the X-CSRF-Token header on
// every state-changing call.
//
// FAIL CLOSED. Missing SITE_PASSWORD or SESSION_SECRET is not a reason to let a
// request through: configure() reports the fault and every caller denies access.
//
// NOTHING HERE IS LOGGED. No password, no session string, no secret, no CSRF
// value is ever passed to console. Callers log the session id only, which is a
// random opaque value with no authority of its own.

const crypto = require('crypto');
const revocations = require('./revocations');

const COOKIE_NAME = 'sb_session';
const CSRF_HEADER = 'x-csrf-token';
const VERSION = 'v1';

// Twelve hours: a working day plus slack, so a content session does not expire
// mid-article, and a laptop left open overnight does not stay signed in.
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

// Equal-length constant-time comparison. timingSafeEqual throws on a length
// mismatch, which would itself leak length, so the lengths are checked first and
// the comparison still runs on a fixed-size digest.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  const ha = crypto.createHash('sha256').update(ba).digest();
  const hb = crypto.createHash('sha256').update(bb).digest();
  return crypto.timingSafeEqual(ha, hb) && ba.length === bb.length;
}

// Reads the server configuration this module depends on. Returns
// { ok: false, code, error } when anything required is missing or too weak, and
// every caller treats that as a denial rather than a reason to continue.
function configure(env) {
  const e = env || process.env;
  const password = e.SITE_PASSWORD;
  const secret = e.SESSION_SECRET;

  if (!password) {
    return {
      ok: false,
      code: 'server_config',
      error: 'SITE_PASSWORD is not configured on Netlify. Sign in is unavailable until it is set.'
    };
  }
  if (!secret) {
    return {
      ok: false,
      code: 'server_config',
      error: 'SESSION_SECRET is not configured on Netlify. Sign in is unavailable until it is set.'
    };
  }
  if (String(secret).length < MIN_SECRET_LENGTH) {
    return {
      ok: false,
      code: 'server_config',
      error: `SESSION_SECRET is too short. Use at least ${MIN_SECRET_LENGTH} characters.`
    };
  }

  const ttlMs = Number(e.SESSION_TTL_MS) > 0 ? Number(e.SESSION_TTL_MS) : DEFAULT_TTL_MS;
  const epoch = String(e.SESSION_EPOCH || '1');
  return { ok: true, password, secret, ttlMs, epoch };
}

function sign(payloadB64, secret) {
  return b64url(crypto.createHmac('sha256', secret).update(payloadB64).digest());
}

function randomId(bytes) {
  return crypto.randomBytes(bytes || 16).toString('hex');
}

// Mints a new session. The caller decides nothing about its contents: the id,
// the CSRF value and the times are all generated here.
function issueSession(config, now) {
  const issuedAt = typeof now === 'number' ? now : Date.now();
  const payload = {
    sid: randomId(16),
    csrf: randomId(16),
    iat: issuedAt,
    exp: issuedAt + config.ttlMs,
    epoch: config.epoch
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const token = `${VERSION}.${payloadB64}.${sign(payloadB64, config.secret)}`;
  return { token, payload };
}

// Verifies a session string. Every failure returns the same shape and a reason
// code; the reason is for the server log and the test suite, never for the
// browser, which only ever learns that it must sign in again.
function verifySession(token, config, now) {
  if (!config || !config.ok) return { valid: false, reason: 'server_config' };
  if (typeof token !== 'string' || !token) return { valid: false, reason: 'missing' };

  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [version, payloadB64, signature] = parts;
  if (version !== VERSION) return { valid: false, reason: 'bad_version' };

  const expected = sign(payloadB64, config.secret);
  if (!safeEqual(signature, expected)) return { valid: false, reason: 'bad_signature' };

  let payload;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!payload || typeof payload.sid !== 'string' || !payload.sid) {
    return { valid: false, reason: 'malformed' };
  }
  if (String(payload.epoch) !== String(config.epoch)) {
    return { valid: false, reason: 'revoked' };
  }
  const at = typeof now === 'number' ? now : Date.now();
  if (!Number.isFinite(payload.exp) || payload.exp <= at) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true, session: payload };
}

// ── Cookies ──────────────────────────────────────────────────────
// Header names arrive in any case from Netlify, so the lookup is case
// insensitive rather than assuming a particular casing.
function header(event, name) {
  const headers = (event && event.headers) || {};
  const wanted = String(name).toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) return headers[key];
  }
  return undefined;
}

function readCookie(event, name) {
  const raw = header(event, 'cookie');
  if (!raw) return '';
  for (const part of String(raw).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return '';
}

// Secure is unconditional. Netlify serves this app over HTTPS, and browsers
// already treat localhost as a secure origin, so the local test server is not a
// reason to weaken the production cookie.
function sessionCookie(token, maxAgeSeconds) {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ].join('; ');
}

function clearedCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// ── Request authorization ────────────────────────────────────────
// The single entry point every protected handler uses. It answers before any
// model call, any prompt read and any job-store access.
//
// `requireCsrf` is on by default: these endpoints are all POSTs that start work
// or read private data, so the only exception a caller should make is one it can
// justify. The CSRF value is compared against the one signed into the session,
// so an attacker needs the header AND the cookie, and a cross-site page can read
// neither.
function authorize(event, options) {
  const opts = options || {};
  const config = opts.config || configure(opts.env);
  if (!config.ok) {
    return {
      ok: false,
      status: 503,
      code: config.code,
      error: config.error,
      reason: 'server_config'
    };
  }

  const token = readCookie(event, COOKIE_NAME);
  const result = verifySession(token, config, opts.now);
  if (!result.valid) {
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      error: 'Your session has expired. Please sign in again.',
      reason: result.reason
    };
  }

  if (opts.requireCsrf !== false) {
    const sent = header(event, CSRF_HEADER);
    if (!sent || !safeEqual(sent, result.session.csrf)) {
      return {
        ok: false,
        status: 403,
        code: 'csrf_failed',
        error: 'That request could not be verified. Please sign in again.',
        reason: 'csrf'
      };
    }
  }

  return { ok: true, session: result.session, config };
}

// The check every protected handler awaits. The signature, expiry, epoch and
// CSRF checks run first and need no storage; then the session is checked
// against the revocation store. If that store cannot be read the request is
// refused (fail closed), with its own code so it is not mistaken for an expired
// session.
async function authorizeRequest(event, options) {
  const result = authorize(event, options);
  if (!result.ok) return result;
  let revoked;
  try {
    revocations.connectRevocations(event);
    revoked = await revocations.isRevoked(result.session.sid);
  } catch (err) {
    console.error('Session revocation check unavailable:', err && err.message);
    return {
      ok: false,
      status: 503,
      code: 'session_check_unavailable',
      error: 'Your sign-in could not be checked just now. Please try again in a minute.',
      reason: 'revocation_unavailable'
    };
  }
  if (revoked) {
    return { ok: false, status: 401, code: 'unauthorized', error: 'Your session has expired. Please sign in again.', reason: 'revoked' };
  }
  return result;
}

module.exports = {
  configure, issueSession, verifySession, authorize, authorizeRequest,
  sessionCookie, clearedCookie, readCookie, header, safeEqual, randomId,
  COOKIE_NAME, CSRF_HEADER, VERSION, DEFAULT_TTL_MS, MIN_SECRET_LENGTH
};
