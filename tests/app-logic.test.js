// Application logic that does not depend on any prompt wording: request
// validation, title resolution, structural output checks, the comparison-table
// repair, the output sanitiser, storefront description handling and the
// background-format routing.
//
// These checks used to live alongside assertions about the prompt text itself.
// The prompt text has moved to the private prompt pack, so the editorial
// assertions moved with it (see docs/PROMPT-PACK.md, "Editorial regression
// suites"). Everything here is about code that stays in this repository.
//
// Run: node tests/app-logic.test.js

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const { validateRequest, PLANT_TYPES, DESCRIPTION_CAP, MAX_TAGS, TAG_CAP } = require('../netlify/functions/lib/validate');
const { resolveTitles, buildFallbackTitle } = require('../netlify/functions/lib/title');
const { validateArticleOutput } = require('../netlify/functions/lib/validate-output');
const { repairArticleHtml, _internals: repairInternals } = require('../netlify/functions/lib/repair-output');
const { sanitizeArticleHtml } = require('../netlify/functions/lib/sanitize-output');
const { _internals: catalogInternals } = require('../netlify/functions/gift-catalog.js');

let failures = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('PASS ' + name); return; }
  failures += 1;
  console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + extra : ''));
}
function throws(name, code, fn) {
  try { fn(); ok(name, false, 'expected an error, got none'); }
  catch (e) { ok(name, e.code === code, 'got ' + e.code + ': ' + e.message); }
}

const prods = n => Array.from({ length: n }, (_, i) => ({
  title: 'Gift Box ' + (i + 1), url: 'https://succulentsbox.com/products/g' + (i + 1),
  price: '$4' + (i + 1) + '.00', source: 'live-gift-catalog', handle: 'g' + (i + 1)
}));

console.log('\n── 1. Request validation ──');
ok('care guide valid', !!validateRequest('care_guide', { plantName: 'Haworthia' }).fields.plantName);
throws('care guide needs a plant name', 'missing_required', () => validateRequest('care_guide', {}));
throws('unknown format rejected', 'invalid_article_type', () => validateRequest('nope', {}));
throws('javascript URL rejected', 'invalid_url', () => validateRequest('care_guide', { plantName: 'X', productUrl: 'javascript:alert(1)' }));
throws('reference text without a URL rejected', 'missing_required', () => validateRequest('care_guide', { plantName: 'X', references: [{ text: 'hi' }] }));
throws('reference URL without text rejected, not dropped', 'missing_required',
  () => validateRequest('care_guide', { plantName: 'X', references: [{ url: 'https://example.com', text: '' }] }));
ok('a complete reference is kept',
  JSON.stringify(validateRequest('care_guide', { plantName: 'X', references: [{ url: 'https://example.com', text: 'Ex' }] }).fields.references)
    === '[{"url":"https://example.com","text":"Ex"}]');
ok('an empty reference box is not an error',
  validateRequest('care_guide', { plantName: 'X', references: [{ url: '', text: '' }] }).fields.references.length === 0);
ok('plant type is an allowlist',
  PLANT_TYPES.join('|') === 'Succulent|Cactus|Air plant (Tillandsia)|Houseplant|Not sure', PLANT_TYPES.join('|'));
throws('unknown plant type rejected', 'invalid_input', () => validateRequest('care_guide', { plantName: 'X', plantType: 'Fern-ish' }));
ok('missing plant type becomes "Not sure", never a guess',
  validateRequest('care_guide', { plantName: 'X' }).fields.plantType === 'Not sure');
throws('custom angle needs a description', 'missing_required', () => validateRequest('single_plant_gift', { plantName: 'X', giftAngle: 'Custom angle' }));
throws('gift guide needs products', 'no_products', () => validateRequest('general_gift_guide', { numberOfRecommendations: 3, selectedProducts: [] }));
ok('eight recommendations allowed', validateRequest('general_gift_guide', { numberOfRecommendations: 8, selectedProducts: prods(8) }).fields.numberOfRecommendations === 8);
throws('nine recommendations rejected', 'invalid_input', () => validateRequest('general_gift_guide', { numberOfRecommendations: 9, selectedProducts: prods(9) }));
throws('more recommendations than products rejected', 'not_enough_products', () => validateRequest('general_gift_guide', { numberOfRecommendations: 5, selectedProducts: prods(3) }));
throws('manual product with a bad URL rejected', 'invalid_url', () => validateRequest('general_gift_guide', { numberOfRecommendations: 1, selectedProducts: [{ title: 'Box', url: 'not-a-url' }] }));
ok('tone is ignored if sent', !('tone' in validateRequest('occasion_gift_guide', { occasion: 'X', tone: 'Romantic', numberOfRecommendations: 1, selectedProducts: prods(1) }).fields));
ok('includeYearInTitle defaults false', validateRequest('occasion_gift_guide', { occasion: 'X', numberOfRecommendations: 1, selectedProducts: prods(1) }).fields.includeYearInTitle === false);

console.log('\n── 2. Storefront descriptions and tags are rebuilt, not trusted ──');
const one = p => validateRequest('general_gift_guide', { numberOfRecommendations: 1, selectedProducts: [p] }).fields.selectedProducts[0];
const base = { title: 'Gift Box', url: 'https://succulentsbox.com/products/box' };
ok('description survives validation', one(Object.assign({}, base, { description: 'Four succulents.' })).description === 'Four succulents.');
ok('over-long description clamped', one(Object.assign({}, base, { description: 'x'.repeat(DESCRIPTION_CAP + 50) })).description.length === DESCRIPTION_CAP);
const stripped = one(Object.assign({}, base, { description: '<script>steal()</script><p>Four <b>succulents</b></p>' })).description;
ok('script bodies and markup removed from descriptions', !/steal|[<>]/.test(stripped) && /Four\s+succulents/.test(stripped), stripped);
ok('tag count limited', one(Object.assign({}, base, { tags: Array.from({ length: MAX_TAGS + 5 }, (_, i) => 't' + i) })).tags.length === MAX_TAGS);
const messy = one(Object.assign({}, base, { tags: ['ok', 'ok', '', 42, null, 'y'.repeat(TAG_CAP + 9), '<b>x</b>'] })).tags;
ok('tags are strings, unique, capped and unmarked',
  messy.every(t => typeof t === 'string' && t.length <= TAG_CAP && !/[<>]/.test(t)) && messy.filter(t => t === 'ok').length === 1, JSON.stringify(messy));
ok('unknown product fields discarded', !('evil' in one(Object.assign({}, base, { evil: 1 }))));
ok('notes stay separate from the description',
  (p => p.notes === 'n' && p.description === 'd')(one(Object.assign({}, base, { notes: 'n', description: 'd' }))));
ok('unknown source falls back to manual', one(Object.assign({}, base, { source: 'made-up' })).source === 'manual');
const short = catalogInternals.shortDescription('<script>bad()</script><p>Set of <em>four</em> succulents</p>');
ok('catalog descriptions lose script bodies and keep text', !/bad\(\)/.test(short) && /Set of four succulents/.test(short), short);

console.log('\n── 3. Titles ──');
const og = validateRequest('occasion_gift_guide', { occasion: 'Christmas', numberOfRecommendations: 2, selectedProducts: prods(2), recipient: 'Coworkers', occasionYear: '2026' });
const ogYear = validateRequest('occasion_gift_guide', { occasion: 'Christmas', occasionYear: '2026', includeYearInTitle: true, numberOfRecommendations: 2, selectedProducts: prods(2) });
let t = resolveTitles('occasion_gift_guide', og.fields, { title: 'Plant Gifts for Christmas 2026', alternative_titles: ['A', 'B'] });
ok('year stripped from an AI title unless requested', t.title === 'Plant Gifts for Christmas', t.title);
ok('two alternatives returned', t.alternatives.length === 2);
ok('year kept when requested', /2026/.test(resolveTitles('occasion_gift_guide', ogYear.fields, { title: 'Plant Gifts for Christmas 2026' }).title));
t = resolveTitles('occasion_gift_guide', og.fields, null);
ok('fallback title built from the brief', t.usedFallback && t.title === '2 Plant Gifts for Coworkers for Christmas', t.title);
ok('fallback general', buildFallbackTitle('general_gift_guide', { numberOfRecommendations: 4, recipient: 'Coworkers' }) === '4 Plant Gift Ideas for Coworkers');
ok('fallback single plant', buildFallbackTitle('single_plant_gift', { plantName: 'Snake Plant', occasion: 'Housewarming' }) === 'Snake Plant as a Housewarming Gift');
ok('care guide keeps its title pattern', resolveTitles('care_guide', { plantName: 'Haworthia' }, { title: 'X' }).title === 'How to grow and care for Haworthia');
ok('em dash stripped from titles', !/[—–]/.test(resolveTitles('general_gift_guide', { numberOfRecommendations: 2 }, { title: 'Gifts — for you' }).title));

console.log('\n── 4. Structural output checks ──');
const f2 = validateRequest('general_gift_guide', { numberOfRecommendations: 2, selectedProducts: prods(2) }).fields;
const goodTable = `<table><thead><tr><th>Gift</th><th>A good choice for</th><th>Style or format</th><th>Price</th></tr></thead><tbody><tr><td>Gift Box 1</td><td>a</td><td>b</td><td>c</td></tr><tr><td>Gift Box 2</td><td>a</td><td>b</td><td>c</td></tr></tbody></table>`;
const links = `<a href="https://succulentsbox.com/products/g1">Gift Box 1</a><a href="https://succulentsbox.com/products/g2">Gift Box 2</a>`;
ok('clean output has no warnings', validateArticleOutput('general_gift_guide', f2, goodTable + links).length === 0);
ok('the previous header spelling still validates', validateArticleOutput('general_gift_guide', f2, goodTable.replace('A good choice for', 'Best suited for') + links).length === 0);
ok('merged header flagged', validateArticleOutput('general_gift_guide', f2, '<table><tr><th>GiftBest forPrice</th></tr><tr><td>x</td></tr></table>' + links).some(w => /merged/.test(w)));
ok('missing table flagged', validateArticleOutput('general_gift_guide', f2, links).some(w => /comparison table is missing/.test(w)));
ok('missing product link flagged', validateArticleOutput('general_gift_guide', f2, goodTable).some(w => /product link is missing/.test(w)));
ok('unconfirmed product link flagged', validateArticleOutput('general_gift_guide', f2, goodTable + links + '<a href="https://succulentsbox.com/products/mystery">x</a>').some(w => /not confirmed/.test(w)));
ok('care guide skips table checks', validateArticleOutput('care_guide', {}, '<p>no table</p>').length === 0);

console.log('\n── 5. Comparison-table repair ──');
const th = 'style="background:#f0f5f0;"';
const collapsed = `<table><thead><tr><th ${th}>Gift Best suited for Style or format Price</th></tr></thead><tbody><tr><td>Our "Best" Box</td><td>a</td><td>b</td><td>$32</td></tr></tbody></table>`;
const fixed = repairArticleHtml(collapsed);
ok('collapsed header repaired into one th per column', fixed.repaired === 1 && (fixed.html.match(/<th /g) || []).length === 4, fixed.html);
ok('repair keeps attributes and quotes', fixed.html.includes(th) && fixed.html.includes('Our "Best" Box'));
const wellFormed = `<table><tr><th>Gift</th><th>Best suited for</th></tr><tr><td>a</td><td>b</td></tr></table>`;
ok('a correct table is untouched', repairArticleHtml(wellFormed).html === wellFormed);
ok('repair refuses an unknown label', repairArticleHtml('<table><tr><th>Gift Mystery</th></tr><tr><td>a</td><td>b</td></tr></table>').repaired === 0);
ok('splitter rejects leftovers', repairInternals.splitHeaderLabels('Gift Nonsense') === null);

console.log('\n── 6. Server-side output sanitiser ──');
const normal = '<p style="font-size:12px;color:#888;">Updated</p><h2 style="color:#34bfa2" id="qa">Q&amp;A</h2><table><tr><th style="x">A</th></tr></table><p>3 &lt; 5, <a href="https://succulentsbox.com/x" style="color:#3a6b35;">link</a><br><img src="https://cdn.shopify.com/a.jpg" alt="a"/></p>';
const n = sanitizeArticleHtml(normal);
ok('a normal article passes through byte for byte', n.html === normal && n.changed === false);
const cases = [
  ['script removed with its content', '<p>Hi<script>alert(1)</script> there</p>', '<p>Hi there</p>'],
  ['event handler removed', '<p onclick="x()">a</p>', '<p>a</p>'],
  ['javascript link removed', '<a href="javascript:alert(1)">x</a>', '<a>x</a>'],
  ['entity-encoded javascript link removed', '<a href="java&#115;cript:alert(1)">x</a>', '<a>x</a>'],
  ['whitespace-split javascript link removed', '<a href=" jav\tascript:x">x</a>', '<a>x</a>'],
  ['data link removed', '<a href="data:text/html,x">d</a>', '<a>d</a>'],
  ['image onerror removed', '<img src=x onerror=alert(1)>', '<img src="x">'],
  ['iframe removed', '<iframe src="https://example.com"></iframe>after', 'after'],
  ['style url() removed', '<p style="background:url(javascript:x)">a</p>', '<p>a</p>'],
  ['comment removed', '<!-- hidden --><p>a</p>', '<p>a</p>'],
  ['svg removed with its content', '<svg><script>x</script></svg>ok', 'ok'],
  ['unterminated tag escaped', '<p>open <script src=x', '<p>open &lt;script src=x'],
  ['form controls removed, text kept', '<form action=x><input name=a></form>text', 'text']
];
for (const [name, input, expected] of cases) {
  const r = sanitizeArticleHtml(input);
  ok(name, r.changed && r.html === expected, JSON.stringify(r.html));
}

console.log('\n── 7. Background routing and waiting copy ──');
const main = read('app/main.js');
const ui = read('app/ui.js');
const bgLine = (main.match(/const BACKGROUND_FORMATS = \[[^\]]*\]/) || [''])[0];
ok('care guide and both gift guides run in the background',
  /'care_guide'/.test(bgLine) && /'general_gift_guide'/.test(bgLine) && /'occasion_gift_guide'/.test(bgLine), bgLine);
ok('single-plant remains synchronous', !/'single_plant_gift'/.test(bgLine), bgLine);
ok('care guide waiting copy is the approved wording', /return 'Writing your care guide\. Keep this tab open\.';/.test(main));
ok('waiting copy claims no unmeasured duration', !/a minute or two/.test(main));
ok('timeout message does not suggest fewer products', !/use fewer products/.test(ui) && /Generation took too long\. Please try again/.test(ui));
ok('reference hint does not claim the page is checked', /The page itself is not opened, read or used to check the article/.test(main));
ok('half-filled references rejected in the browser too',
  /Add the link text for this reference, or clear the URL/.test(main) && /Add the reference URL, or clear the link text/.test(main));
const bg = read('netlify/functions/generate-background.js');
ok('generate-background has no per-format branch', !/'care_guide'|'general_gift_guide'|'occasion_gift_guide'/.test(bg));

console.log(`\n${failures} failures`);
if (failures) process.exitCode = 1;
