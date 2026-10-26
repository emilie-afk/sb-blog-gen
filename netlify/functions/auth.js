// Sign in and sign out.
//
// WHAT CHANGED. This used to answer a correct password with
// { ok: true, token: <the password> }. The shared password was therefore handed
// back to the browser, carried in the body of every later request, and never
// expired. It now mints a signed, expiring session instead: the password is
// compared here and never leaves the server, and the browser receives an
// HttpOnly cookie it cannot read plus a CSRF value it echoes in a header.
//
// NOTHING SENSITIVE IS LOGGED. The submitted password, the issued session and
// the CSRF value never reach console. A failed attempt logs the outcome and the
// hashed address only, which is what a throttle needs and nothing more.

const { configure, issueSession, verifySession, authorize, safeEqual,
        sessionCookie, clearedCookie, readCookie, COOKIE_NAME } = require('./lib/session');
const limits = require('./lib/limits');
const revocations = require('./lib/revocations');
const counters = require('./lib/counter-store');
const { logEvent } = require('./lib/timing');

function json(statusCode, payload, cookies, extraHeaders) {
  const response = {
    statusCode,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extraHeaders || {}),
    body: JSON.stringify(payload)
  };
  // Netlify's Lambda compatibility layer takes several Set-Cookie values through
  // multiValueHeaders; a single headers entry would silently drop all but one.
  if (cookies && cookies.length) response.multiValueHeaders = { 'Set-Cookie': cookies };
  return response;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid request body', code: 'bad_request' });
  }

  // Missing or weak security configuration denies access. There is no mode in
  // which this function lets a caller through without it.
  const config = configure();
  if (!config.ok) {
    console.error('Session configuration incomplete:', config.code);
    return json(503, { error: config.error, code: config.code });
  }

  const action = body.action === 'logout' ? 'logout' : 'login';

  // ── Sign out ───────────────────────────────────────────────────
  // The cookie is cleared, AND the session is revoked on the server, so a copy
  // of the cookie and CSRF value taken before sign-out stops working too (see
  // lib/revocations.js for the propagation window). A caller with no valid
  // session still gets the cleared cookie, because refusing to clear a cookie
  // is never useful. If the revocation cannot be recorded the cookie is still
  // cleared, and the response says plainly that the session could not be ended
  // on the server and when it will expire on its own.
  if (action === 'logout') {
    const current = verifySession(readCookie(event, COOKIE_NAME), config);
    if (!current.valid) return json(200, { ok: true, loggedOut: true, revoked: false }, [clearedCookie()]);
    try {
      revocations.connectRevocations(event);
      await revocations.revoke(current.session);
    } catch (err) {
      console.error('Session revocation could not be recorded:', err && err.message);
      return json(503, {
        ok: false,
        loggedOut: true,
        revoked: false,
        code: 'revocation_unavailable',
        error: `Signed out on this device, but the session could not be ended on the server. It expires on its own at ${new Date(current.session.exp).toISOString()}.`
      }, [clearedCookie()]);
    }
    logEvent('session_ended', { sid: current.session.sid });
    return json(200, { ok: true, loggedOut: true, revoked: true }, [clearedCookie()]);
  }

  // ── Sign in ───────────────────────────────────────────────────
  // The throttle is durable because it lives in Netlify Blobs. If that store
  // cannot be reached, sign-in is refused rather than left unthrottled: every
  // generation path needs Blobs anyway (jobs, prompt pack, revocations), so an
  // outage that disables the throttle has already disabled the app, and failing
  // open would only remove the brake on password guessing.
  try {
    counters.connectCounters(event);
  } catch (err) {
    console.error('Counter store unavailable for login throttling:', err && err.message);
    return json(503, { error: 'Sign-in is temporarily unavailable. Please try again in a few minutes.', code: 'login_unavailable' });
  }

  const throttle = await limits.checkLoginThrottle(event, config.secret);
  if (throttle.unavailable) {
    return json(503, { error: 'Sign-in is temporarily unavailable. Please try again in a few minutes.', code: 'login_unavailable' });
  }
  if (!throttle.allowed) {
    logEvent('login_throttled', { attempts: throttle.attempts, limit: throttle.limit });
    return json(429, {
      error: 'Too many sign-in attempts from this connection. Please wait and try again.',
      code: 'rate_limited'
    }, null, { 'Retry-After': String(throttle.retryAfterSeconds) });
  }

  const submitted = typeof body.password === 'string' ? body.password : '';
  // Constant time, so the response time does not reveal how much of the password
  // was correct.
  if (!submitted || !safeEqual(submitted, config.password)) {
    await limits.recordLoginFailure(event, config.secret);
    logEvent('login_failed', {});
    return json(401, { error: 'Incorrect password. Please try again.', code: 'unauthorized' });
  }

  await limits.clearLoginFailures(event, config.secret);

  const { token, payload } = issueSession(config);
  logEvent('session_started', { sid: payload.sid, expiresInMs: config.ttlMs });

  // The body carries the CSRF value and the expiry, never the session itself and
  // never the password. The browser holds the CSRF value in memory only.
  return json(200, {
    ok: true,
    csrfToken: payload.csrf,
    expiresAt: new Date(payload.exp).toISOString()
  }, [sessionCookie(token, Math.floor(config.ttlMs / 1000))]);
};

// Exported for the security suite, which checks the shape of a refusal without
// going through the network.
exports._internals = { authorize };
