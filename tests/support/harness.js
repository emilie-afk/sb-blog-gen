// Shared setup for handler tests: synthetic security configuration, a signed
// session, request events carrying it, and in-memory stores for jobs, counters
// and the prompt pack.
//
// Every secret here is a synthetic value made up for the tests. None is, or
// resembles, a production value.

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const TEST_ENV = {
  SITE_PASSWORD: 'synthetic-test-password',
  SESSION_SECRET: 'synthetic-session-secret-for-tests-only-0123456789',
  SESSION_EPOCH: '1',
  ANTHROPIC_API_KEY: 'synthetic-api-key'
};

function applyTestEnv(overrides) {
  Object.assign(process.env, TEST_ENV, overrides || {});
}

const session = require(path.join(ROOT, 'netlify/functions/lib/session'));
const jobs = require(path.join(ROOT, 'netlify/functions/lib/job-store'));
const counters = require(path.join(ROOT, 'netlify/functions/lib/counter-store'));
const { installTestPack } = require('./test-pack');
const revocations = require(path.join(ROOT, 'netlify/functions/lib/revocations'));

// A signed session as auth.js would issue it.
function newSession(now) {
  applyTestEnv();
  const config = session.configure();
  return session.issueSession(config, now);
}

// A POST event. `as` is a session from newSession(); `csrf` overrides the header
// (false omits it); `cookie` overrides the cookie header entirely.
function event(body, opts) {
  const o = opts || {};
  const headers = Object.assign({}, o.headers || {});
  if (o.as) {
    headers.cookie = o.cookie !== undefined ? o.cookie : `${session.COOKIE_NAME}=${o.as.token}`;
    if (o.csrf !== false) headers['x-csrf-token'] = o.csrf !== undefined ? o.csrf : o.as.payload.csrf;
  } else if (o.cookie !== undefined) {
    headers.cookie = o.cookie;
  }
  return { httpMethod: o.method || 'POST', headers, body: JSON.stringify(body || {}) };
}

function useMemoryStores(packVersion) {
  jobs.resetStoreForTests();
  const jobStore = jobs.useMemoryStoreForTests();
  const counterStore = counters.useMemoryCountersForTests();
  const revocationStore = revocations.useMemoryRevocationsForTests();
  const packStore = installTestPack(packVersion);
  return { jobStore, counterStore, revocationStore, packStore };
}

// A stub Anthropic SDK, installed before any handler loads the real one. Every
// call is recorded, so a test can assert that no model call happened at all.
function stubAnthropic(behaviour) {
  const sdkPath = require.resolve('@anthropic-ai/sdk', { paths: [ROOT] });
  const calls = [];
  const real = require(sdkPath);
  class FakeAnthropic {
    constructor(opts) { this.opts = opts; this.messages = { create: async req => {
      calls.push(req);
      return behaviour(req, calls);
    } }; }
  }
  // The real error classes stay reachable, because run-generation tests errors
  // with instanceof against them.
  for (const key of Object.keys(real)) if (!(key in FakeAnthropic)) FakeAnthropic[key] = real[key];
  require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: FakeAnthropic };
  return calls;
}

function articleReply(extra) {
  return {
    content: [{ text: '<p style="font-size:12px;color:#888;font-style:italic;">Updated</p><h2 style="color:#34bfa2" id="x">Care</h2>'
      + '<p>Water when the soil is dry.</p>'.repeat(12) + (extra || '') }],
    stop_reason: 'end_turn'
  };
}

function metadataReply() {
  return {
    content: [{ text: JSON.stringify({
      title: 'Synthetic Title', alternative_titles: ['Alternative One', 'Alternative Two'],
      excerpt: 'A synthetic excerpt.', meta_description: 'A synthetic meta description.', articles: [], products: []
    }) }],
    stop_reason: 'end_turn'
  };
}

// The default behaviour: article calls (max_tokens above 1000) get an article,
// metadata calls get metadata.
function defaultReply(req) {
  return req.max_tokens > 1000 ? articleReply() : metadataReply();
}

module.exports = { TEST_ENV, applyTestEnv, newSession, event, useMemoryStores, stubAnthropic, articleReply, metadataReply, defaultReply, ROOT };
