// Rate and usage policy. The mechanics live in counter-store.js; the numbers and
// the decisions live here.
//
// TWO DIFFERENT JOBS:
//
// 1. Login throttling, which slows down guessing at a single shared password.
//    Counted per client address over a rolling window.
//
// 2. Usage limits on generation, which bound what one signed-in session, and the
//    whole app, can spend on model calls in a period. The login is shared by the
//    team, so a per-session limit is the only per-user limit available, and the
//    app-wide limit is what actually caps the bill.
//
// WHAT HAPPENS WHEN THE COUNTER STORE IS UNREACHABLE. Both checks fail CLOSED:
// sign-in and generation are refused with a "temporarily unavailable" error.
// That costs nothing in practice, because every generation path already needs
// Netlify Blobs (jobs, prompt pack, session revocations), so an outage that
// breaks the counters has already stopped the app; failing open would only
// remove the brakes.
//
// WHAT THESE LIMITS ARE NOT. They are best-effort counters, not a guaranteed
// spending cap. Counting is eventually consistent, so a burst inside a
// propagation window can be undercounted, and a deploy's own Blobs credentials
// could delete counters. The guaranteed cap is the spend limit set on the
// Anthropic account itself (docs/SECURITY.md).

const counters = require('./counter-store');

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function policy(env) {
  const e = env || process.env;
  return {
    loginMaxAttempts: positiveInt(e.LOGIN_MAX_ATTEMPTS, 10),
    loginWindowMs: positiveInt(e.LOGIN_WINDOW_MS, 15 * 60 * 1000),
    sessionMaxGenerations: positiveInt(e.GENERATION_LIMIT_PER_SESSION, 40),
    sessionWindowMs: positiveInt(e.GENERATION_WINDOW_MS, 60 * 60 * 1000),
    appMaxGenerations: positiveInt(e.GENERATION_LIMIT_PER_DAY, 400),
    appWindowMs: positiveInt(e.GENERATION_DAY_MS, 24 * 60 * 60 * 1000)
  };
}

function loginPrefix(event, secret) {
  return `login-fail/${counters.hashIdentifier(counters.clientAddress(event), secret)}`;
}

// Called before the password is compared, so a locked-out caller never reaches
// the comparison at all.
async function checkLoginThrottle(event, secret, env, now) {
  const p = policy(env);
  try {
    const used = await counters.countWithin(loginPrefix(event, secret), p.loginWindowMs, now);
    if (used >= p.loginMaxAttempts) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(p.loginWindowMs / 1000),
        attempts: used,
        limit: p.loginMaxAttempts
      };
    }
    return { allowed: true, attempts: used, limit: p.loginMaxAttempts };
  } catch (err) {
    console.error('Login throttle unavailable:', err && err.message);
    return { allowed: false, unavailable: true, limit: p.loginMaxAttempts };
  }
}

async function recordLoginFailure(event, secret, now) {
  try {
    await counters.record(loginPrefix(event, secret), now);
  } catch (err) {
    console.error('Login failure could not be recorded:', err && err.message);
  }
}

// A correct password retires that address's failures, so one typo earlier in the
// day never counts against someone who has just signed in successfully.
async function clearLoginFailures(event, secret) {
  try {
    await counters.clearPrefix(loginPrefix(event, secret));
  } catch (err) {
    console.error('Login failures could not be cleared:', err && err.message);
  }
}

// Checked before a generation is started, on both the synchronous and the
// background path, so neither can be used to get round the other.
async function checkGenerationAllowance(sid, env, now) {
  const p = policy(env);
  try {
    const [bySession, byApp] = await Promise.all([
      counters.countWithin(`use/session/${sid}`, p.sessionWindowMs, now),
      counters.countWithin('use/app', p.appWindowMs, now)
    ]);

    if (bySession >= p.sessionMaxGenerations) {
      return {
        allowed: false,
        status: 429,
        code: 'rate_limited',
        error: `This session has generated ${bySession} articles in the last hour, which is the limit. Please wait a little before generating again.`,
        scope: 'session'
      };
    }
    if (byApp >= p.appMaxGenerations) {
      return {
        allowed: false,
        status: 429,
        code: 'rate_limited',
        error: 'The generator has reached its daily limit for everyone. Please try again tomorrow, or ask for the limit to be raised.',
        scope: 'app'
      };
    }
    return { allowed: true, bySession, byApp };
  } catch (err) {
    console.error('Usage limits unavailable:', err && err.message);
    return {
      allowed: false,
      status: 503,
      code: 'limits_unavailable',
      error: 'Generation is temporarily unavailable because usage could not be checked. Please try again in a few minutes.',
      scope: 'unavailable'
    };
  }
}

// Recorded once a generation is actually going to run, never on a request that
// was rejected, so a rejected call cannot consume someone's allowance. It is
// recorded BEFORE the model call, and a failure to record it throws: the caller
// then refuses to generate, so no generation runs uncounted.
async function recordGeneration(sid, now) {
  try {
    await Promise.all([
      counters.record(`use/session/${sid}`, now),
      counters.record('use/app', now)
    ]);
  } catch (err) {
    console.error('Usage could not be recorded:', err && err.message);
    throw Object.assign(new Error('Usage could not be recorded.'), {
      code: 'limits_unavailable',
      status: 503,
      safeMessage: 'Generation is temporarily unavailable because usage could not be recorded. Please try again in a few minutes.'
    });
  }
}

module.exports = {
  policy, checkLoginThrottle, recordLoginFailure, clearLoginFailures,
  checkGenerationAllowance, recordGeneration,
  _internals: { loginPrefix }
};
