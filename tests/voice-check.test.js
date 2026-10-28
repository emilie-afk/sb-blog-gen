// House-style check: phrases and outline-label headings from the pack's lists.
// The lists here are synthetic; the real ones are in the private pack.
// Run: node tests/voice-check.test.js
const H = require('./support/harness');
H.applyTestEnv();
const { checkVoice } = require(H.ROOT + '/netlify/functions/lib/voice-check');
const promptPack = require(H.ROOT + '/netlify/functions/lib/prompt-pack');
const { loadPackJson, signForTests } = require('./support/test-pack');

let failures = 0;
const ok = (name, cond, extra) => { if (cond) console.log('PASS ' + name); else { failures++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + extra : '')); } };

const VC = { articleTypes: 'single_plant_gift, general_gift_guide', phrases: 'synthetic tagline one\nSynthetic Cliche\n\n', headingWords: 'zzlabel' };
const pack = { raw: { voiceCheck: VC } };
const html = '<p>Updated</p><h2>What is ZZLabel here</h2><p>This is a Synthetic&nbsp;cliche, honestly.</p><h3>Plain heading</h3>';

let r = checkVoice('single_plant_gift', pack, { html, excerpt: 'It ends on synthetic tagline one.', metaDescription: '' });
ok('a listed phrase in the article is reported, case- and entity-insensitive', r.warnings.some(w => /"synthetic cliche"/.test(w)), JSON.stringify(r.warnings));
ok('a listed phrase in the excerpt is reported', r.warnings.some(w => /"synthetic tagline one"/.test(w)));
ok('a heading containing a listed word is reported, a plain heading is not',
  r.warnings.some(w => /outline labels/.test(w) && /"What is ZZLabel here"/.test(w) && !/plain heading/.test(w)), JSON.stringify(r.warnings));
ok('exactly two warnings: one for phrases, one for headings', r.warnings.length === 2);

r = checkVoice('single_plant_gift', pack, { html: '<p>We say zzlabel in a paragraph.</p>', excerpt: '', metaDescription: '' });
ok('heading words only count inside headings', r.warnings.length === 0, JSON.stringify(r.warnings));

r = checkVoice('care_guide', pack, { html, excerpt: '', metaDescription: '' });
ok('article types not listed are not checked', r.warnings.length === 0);

r = checkVoice('single_plant_gift', { raw: {} }, { html, excerpt: '', metaDescription: '' });
ok('a pack without voiceCheck skips the check', r.warnings.length === 0);

r = checkVoice('single_plant_gift', { raw: { voiceCheck: { articleTypes: 'single_plant_gift', phrases: Array.from({ length: 9 }, (_, i) => 'zz' + i).join('\n') } } },
  { html: '<p>' + Array.from({ length: 9 }, (_, i) => 'zz' + i).join(' ') + '</p>', excerpt: '', metaDescription: '' });
ok('a long list is capped, with a count of the rest', r.warnings.length === 1 && /and 3 more/.test(r.warnings[0]), r.warnings[0]);

r = checkVoice('single_plant_gift', pack, { html: '<p>Curly ’quote’ and clean text.</p>', excerpt: undefined, metaDescription: null });
ok('missing excerpt and meta description do not break the check', r.warnings.length === 0);

// End to end: the warning reaches the payload, and only a count is logged.
(async () => {
  H.stubAnthropic(req => req.max_tokens > 1000
    ? { stop_reason: 'end_turn', content: [{ text: '<p style="font-size:12px;color:#888;font-style:italic;">Updated</p><h2 style="color:#34bfa2" id="a">Why ZZLabel matters</h2>' + '<p>Synthetic cliche sentence.</p>'.repeat(12) }] }
    : H.metadataReply());
  const { handler } = require(H.ROOT + '/netlify/functions/generate.js');
  H.useMemoryStores();
  const json = loadPackJson();
  json.voiceCheck = VC;
  promptPack.usePackForTests(json, { version: 'voice-test', sign: signForTests });
  const who = H.newSession();
  const logs = []; const realErr = console.error; console.error = (...a) => logs.push(a.join(' '));
  const res = await handler(H.event({ articleType: 'single_plant_gift', fields: { plantName: 'Test Plant', giftAngle: 'Low maintenance' } }, { as: who }));
  console.error = realErr;
  const d = JSON.parse(res.body);
  ok('end to end: the house-style warnings reach the editor', res.statusCode === 200 && d.warnings.some(w => /"synthetic cliche"/.test(w)) && d.warnings.some(w => /outline labels/.test(w)), JSON.stringify(d.warnings));
  ok('end to end: the article itself is not changed', /Synthetic cliche sentence/.test(d.html));
  ok('end to end: only a count is logged, never the matched text',
    logs.some(l => /House-style check: \{"matches":2\}/.test(l)) && !logs.some(l => /cliche|zzlabel/i.test(l)), JSON.stringify(logs));

  console.log(`\n${failures} failures`);
  if (failures) process.exitCode = 1;
})();
