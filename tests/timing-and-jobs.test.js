// Generation timing, output limits, and the background job lifecycle.
//
// The Anthropic SDK is stubbed with a controllable latency and stop_reason, so
// the required scenarios run without the network and without an API key. What
// this suite cannot do is measure how long the real model takes; that only comes
// from a deployed run reading the generation_timing lines.
//
// Run: node tests/timing-and-jobs.test.js

const path = require('path');
const ROOT = path.join(__dirname, '..');
const results = [];
const check = (name, cond, extra) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : ''));

// ── Stub the SDK before any function module loads it ─────────────
const sdkPath = require.resolve('@anthropic-ai/sdk', { paths: [ROOT] });
const behaviour = {
  articleMs: 5, metadataMs: 5,
  articleFail: false, metadataFail: false,
  articleStopReason: 'end_turn',
  articleText: null,
  metadataText: '{"title":"Plant Gifts Worth Sending","alternative_titles":["Desk Plants","Low Light Gifts"],"excerpt":"One. Two.","meta_description":"Meta.","articles":[{"t":"Watering Tips","u":"https://succulentsbox.com/blogs/blog/watering-tips"}]}'
};
function articleHtml(products) {
  const rows = products.map(p => `<tr><td>${p.title}</td><td>a</td><td>b</td><td>c</td></tr>`).join('');
  const links = products.map(p => `<h3 style="color:#34bfa2"><a href="${p.url}">${p.title}</a></h3><p>Why this one differs.</p>`).join('');
  return '<p style="font-size:12px;color:#888;">Updated September 2026</p>' + links +
    '<table><thead><tr><th>Gift</th><th>Best for</th><th>Light</th><th>Care level</th></tr></thead><tbody>' +
    rows + '</tbody></table>' + '<p>Care basics and questions.</p>'.repeat(6);
}
let lastCall = {};
class FakeAnthropic {
  constructor() {
    this.messages = {
      create: async (opts) => {
        const isArticle = opts.max_tokens > 1000;
        lastCall[isArticle ? 'article' : 'metadata'] = { max_tokens: opts.max_tokens };
        await new Promise(r => setTimeout(r, isArticle ? behaviour.articleMs : behaviour.metadataMs));
        if (isArticle && behaviour.articleFail) throw new Error('overloaded');
        if (!isArticle && behaviour.metadataFail) throw new Error('rate limited');
        if (isArticle) {
          return {
            stop_reason: behaviour.articleStopReason,
            content: [{ text: behaviour.articleText !== null ? behaviour.articleText : articleHtml(behaviour.products || []) }]
          };
        }
        return { stop_reason: 'end_turn', content: [{ text: behaviour.metadataText }] };
      }
    };
  }
}
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: FakeAnthropic };

process.env.SITE_PASSWORD = 'pw';
process.env.ANTHROPIC_API_KEY = 'k';

const { ARTICLE_MAX_TOKENS, METADATA_MAX_TOKENS } = require(path.join(ROOT, 'netlify/functions/lib/run-generation'));
const generate = require(path.join(ROOT, 'netlify/functions/generate.js'));
const background = require(path.join(ROOT, 'netlify/functions/generate-background.js'));
const status = require(path.join(ROOT, 'netlify/functions/generate-status.js'));

// ── Capture the timing log lines ─────────────────────────────────
const logLines = [];
const realLog = console.log;
console.log = (...args) => {
  const first = args[0];
  if (typeof first === 'string' && first.includes('"event":"generation_timing"')) logLines.push(JSON.parse(first));
  else realLog(...args);
};

const products = n => Array.from({ length: n }, (_, i) => ({
  title: 'Gift Box ' + (i + 1),
  url: 'https://succulentsbox.com/products/gift-box-' + (i + 1),
  price: '$4' + (i + 1) + '.00',
  source: 'live-gift-catalog'
}));

const occasionFields = n => ({
  occasion: 'Christmas', recipient: 'Coworkers', numberOfRecommendations: n,
  selectedProducts: products(n), giftCharacteristics: ['Low maintenance']
});
const generalFields = n => ({
  recipient: 'New grads', numberOfRecommendations: n, selectedProducts: products(n)
});
const sensitiveFields = n => ({
  occasion: 'Pregnancy and Infant Loss Remembrance Day', numberOfRecommendations: n,
  selectedProducts: products(n), sensitiveOccasion: true
});

const callSync = (articleType, fields) => generate.handler({
  httpMethod: 'POST', body: JSON.stringify({ token: 'pw', articleType, fields })
});

(async () => {
  // ── Token budgets ──────────────────────────────────────────────
  check('article max_tokens reduced to ~3500', ARTICLE_MAX_TOKENS === 3500, String(ARTICLE_MAX_TOKENS));
  check('metadata max_tokens reduced to ~600', METADATA_MAX_TOKENS === 600, String(METADATA_MAX_TOKENS));

  // ── Required scenarios ─────────────────────────────────────────
  const scenarios = [
    ['occasion guide, 4 products', 'occasion_gift_guide', occasionFields(4), 4],
    ['occasion guide, 8 products', 'occasion_gift_guide', occasionFields(8), 8],
    ['general guide, 4 products', 'general_gift_guide', generalFields(4), 4],
    ['sensitive occasion, 4 products', 'occasion_gift_guide', sensitiveFields(4), 4]
  ];
  for (const [name, type, fields, n] of scenarios) {
    behaviour.products = products(n);
    logLines.length = 0;
    const res = await callSync(type, fields);
    const body = JSON.parse(res.body);
    check(name + ': returns an article', res.statusCode === 200 && body.html.includes('<table'), String(res.statusCode));
    check(name + ': every confirmed product is used', body.products.length === n);
    check(name + ': comparison table survives the smaller budget', /<th[\s>]/.test(body.html));
    check(name + ': not flagged truncated', body.truncated === false);
    check(name + ': timing line emitted', logLines.length === 1 && logLines[0].context === 'generate');
    const t = logLines[0] || { phases: {} };
    check(name + ': phases recorded',
      ['validation', 'prompt_build', 'article_call', 'metadata_call', 'ai_calls', 'response_processing']
        .every(p => typeof t.phases[p] === 'number'), JSON.stringify(t.phases));
    check(name + ': calls ran in parallel',
      t.phases.ai_calls < t.phases.article_call + t.phases.metadata_call + 5,
      `ai_calls=${t.phases.ai_calls} article=${t.phases.article_call} metadata=${t.phases.metadata_call}`);
  }

  // ── Timing logs carry no content ───────────────────────────────
  const line = JSON.stringify(logLines[0]);
  check('timing log has no prompt or article text',
    !/succulentsbox\.com|Gift Box|Christmas|<table|You are writing/.test(line), line.slice(0, 120));
  check('timing log has no credentials', !/pw|sk-|password|apiKey|ANTHROPIC/i.test(line));
  check('timing log keys are the allowlist',
    Object.keys(logLines[0]).every(k =>
      ['event', 'context', 'totalMs', 'phases', 'articleType', 'productCount',
       'recommendationCount', 'articleChars', 'truncated', 'ok', 'jobId'].includes(k)),
    Object.keys(logLines[0]).join(','));

  // ── Failure paths still behave ─────────────────────────────────
  behaviour.products = products(4);
  behaviour.metadataFail = true;
  let res = await callSync('occasion_gift_guide', occasionFields(4));
  let body = JSON.parse(res.body);
  check('metadata failure still returns the article', res.statusCode === 200 && !!body.html);
  check('metadata failure warns', body.warnings.some(w => /excerpt/i.test(w)));
  check('metadata failure still produces a title', !!body.title);
  behaviour.metadataFail = false;

  behaviour.articleFail = true;
  res = await callSync('occasion_gift_guide', occasionFields(4));
  check('article failure returns 502', res.statusCode === 502 && JSON.parse(res.body).code === 'ai_failure');
  behaviour.articleFail = false;

  behaviour.articleText = '<p>too short</p>';
  res = await callSync('occasion_gift_guide', occasionFields(4));
  check('incomplete article response returns 502',
    res.statusCode === 502 && JSON.parse(res.body).code === 'incomplete_response');
  behaviour.articleText = null;

  // ── Truncation is never silent ─────────────────────────────────
  behaviour.articleStopReason = 'max_tokens';
  res = await callSync('occasion_gift_guide', occasionFields(4));
  body = JSON.parse(res.body);
  check('hitting the output cap is flagged, not hidden',
    body.truncated === true && body.warnings.some(w => /cut off|stops mid-way/i.test(w)),
    JSON.stringify(body.warnings.slice(0, 1)));
  behaviour.articleStopReason = 'end_turn';

  // ── Background job lifecycle ───────────────────────────────────
  logLines.length = 0;
  behaviour.products = products(8);
  behaviour.articleMs = 60;
  const jobId = 'job_' + Date.now().toString(36) + '_abcdefgh';
  const accepted = await background.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ token: 'pw', jobId, articleType: 'occasion_gift_guide', fields: occasionFields(8) })
  });
  check('background start is accepted', accepted.statusCode === 202 && JSON.parse(accepted.body).jobId === jobId);
  check('background emits its own timing line', logLines.some(l => l.context === 'generate-background' && l.jobId === jobId));

  const askStatus = (id, token) => status.handler({
    httpMethod: 'POST', body: JSON.stringify({ token: token || 'pw', jobId: id })
  });

  let st = JSON.parse((await askStatus(jobId)).body);
  check('finished job reports complete', st.status === 'complete' && !!st.html);
  check('completed job carries the full payload',
    st.products.length === 8 && Array.isArray(st.alternative_titles) && !!st.meta_description);

  const unknown = JSON.parse((await askStatus('job_missing_00000000')).body);
  check('unknown job reports expired', unknown.status === 'expired' && unknown.code === 'job_expired');
  check('expired message tells the user their work is safe', /still here/.test(unknown.error));

  check('status rejects a bad job reference',
    (await askStatus('not-a-job')).statusCode === 400);
  check('status rejects a bad token', (await askStatus(jobId, 'wrong')).statusCode === 401);
  check('status rejects GET', (await status.handler({ httpMethod: 'GET' })).statusCode === 405);

  // A failing job is recorded as failed, not lost.
  behaviour.articleFail = true;
  const failId = 'job_' + Date.now().toString(36) + '_failfail';
  await background.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ token: 'pw', jobId: failId, articleType: 'general_gift_guide', fields: generalFields(4) })
  });
  const failed = JSON.parse((await askStatus(failId)).body);
  check('failed job reports failed with a safe message',
    failed.status === 'failed' && failed.code === 'ai_failure' && !/\.js:\d+/.test(failed.error || ''),
    failed.error);
  behaviour.articleFail = false;

  check('background rejects a bad token',
    (await background.handler({ httpMethod: 'POST', body: JSON.stringify({ token: 'nope' }) })).statusCode === 401);
  check('background validates fields',
    (await background.handler({
      httpMethod: 'POST',
      body: JSON.stringify({ token: 'pw', articleType: 'occasion_gift_guide', fields: { occasion: 'X', numberOfRecommendations: 9, selectedProducts: products(9) } })
    })).statusCode === 400);

  console.log = realLog;
  console.log(results.filter(r => r.startsWith('FAIL')).join('\n'));
  const failures = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`${results.length - failures} checks passed`);
  console.log('\n' + failures + ' failures of ' + results.length);
  process.exitCode = failures ? 1 : 0;
})();
