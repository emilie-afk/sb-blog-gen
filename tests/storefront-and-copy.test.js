// Tests for the two faults fixed in this pass:
//   1. storefront descriptions and tags were dropped on the way to the prompt, so
//      gift boxes could only be written about in vague language;
//   2. the copy buttons reported success without checking whether the copy
//      actually happened.
// Plus the deterministic comparison-table header repair.

const assert = require('assert');
const { validateRequest, DESCRIPTION_CAP, MAX_TAGS, TAG_CAP } = require('../netlify/functions/lib/validate');
const { formatProductsForPrompt, buildStorefrontDescriptionRules, buildGiftVoiceRules, buildEvidenceRules } = require('../netlify/functions/lib/shared-rules');
const { buildGeneralGiftGuidePrompt } = require('../netlify/functions/lib/prompt-general-gift-guide');
const { buildOccasionGiftGuidePrompt } = require('../netlify/functions/lib/prompt-occasion-gift-guide');
const { buildMetadataAndRelatedPrompt } = require('../netlify/functions/lib/prompt-metadata-related');
const { repairArticleHtml, _internals } = require('../netlify/functions/lib/repair-output');
const { validateArticleOutput } = require('../netlify/functions/lib/validate-output');
const { shortDescription } = requireCatalogInternals();

function requireCatalogInternals() {
  const mod = require('../netlify/functions/gift-catalog.js');
  return mod._internals || {};
}

let failures = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('PASS ' + name); return; }
  failures += 1;
  console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + extra : ''));
}

// ── Part 1: validation rebuilds description and tags ────────────────────────

function req(products) {
  return validateRequest('general_gift_guide', {
    numberOfRecommendations: products.length,
    selectedProducts: products
  }).fields.selectedProducts;
}

const base = { title: 'Succulent Gift Box', url: 'https://succulentsbox.com/products/box' };

const kept = req([Object.assign({}, base, {
  description: 'Includes four 2 inch succulents in a kraft box.',
  tags: ['gift', 'box', 'succulent']
})])[0];
ok('description survives validation', kept.description === 'Includes four 2 inch succulents in a kraft box.', kept.description);
ok('tags survive validation', JSON.stringify(kept.tags) === '["gift","box","succulent"]', JSON.stringify(kept.tags));

const capped = req([Object.assign({}, base, { description: 'x'.repeat(DESCRIPTION_CAP + 500) })])[0];
ok('over-long description is clamped, not rejected', capped.description.length === DESCRIPTION_CAP, capped.description.length);

const stripped = req([Object.assign({}, base, {
  description: '<script>steal()</script><p>Four <strong>succulents</strong></p><style>a{}</style>'
})])[0];
ok('script and style bodies removed from description', !/steal|a\{\}/.test(stripped.description), stripped.description);
ok('markup removed from description', !/[<>]/.test(stripped.description), stripped.description);
ok('description text preserved', /Four\s+succulents/.test(stripped.description), stripped.description);

const manyTags = req([Object.assign({}, base, {
  tags: Array.from({ length: MAX_TAGS + 15 }, (_, i) => 'tag' + i)
})])[0];
ok('tag count is limited', manyTags.tags.length === MAX_TAGS, manyTags.tags.length);

const messyTags = req([Object.assign({}, base, {
  tags: ['ok', 'ok', '', '   ', 42, null, { a: 1 }, ['x'], 'y'.repeat(TAG_CAP + 40), '<b>bold</b>']
})])[0];
ok('non-string tags discarded', messyTags.tags.every(t => typeof t === 'string'), JSON.stringify(messyTags.tags));
ok('duplicate and empty tags discarded', messyTags.tags.filter(t => t === 'ok').length === 1, JSON.stringify(messyTags.tags));
ok('tag length capped', messyTags.tags.every(t => t.length <= TAG_CAP), JSON.stringify(messyTags.tags));
ok('tag markup stripped', messyTags.tags.every(t => !/[<>]/.test(t)), JSON.stringify(messyTags.tags));

const wrongTypes = req([Object.assign({}, base, { description: { evil: true }, tags: 'not-a-list' })])[0];
ok('non-string description becomes empty', wrongTypes.description === '', JSON.stringify(wrongTypes.description));
ok('non-array tags become an empty list', Array.isArray(wrongTypes.tags) && wrongTypes.tags.length === 0, JSON.stringify(wrongTypes.tags));

const unknown = req([Object.assign({}, base, { description: 'ok', evilField: 'x', __proto__key: 'y' })])[0];
ok('unknown fields still discarded', !('evilField' in unknown) && !('__proto__key' in unknown), Object.keys(unknown).join(','));

const bothFields = req([Object.assign({}, base, { description: 'From the shop page.', notes: 'Confirmed by the team.' })])[0];
ok('manual notes stay separate from the storefront description',
  bothFields.notes === 'Confirmed by the team.' && bothFields.description === 'From the shop page.',
  JSON.stringify(bothFields));

let urlStillChecked = false;
try { req([{ title: 'x', url: 'javascript:alert(1)', description: 'y' }]); }
catch (e) { urlStillChecked = e.code === 'invalid_url'; }
ok('URL validation still enforced', urlStillChecked);

let sourceStillChecked = req([Object.assign({}, base, { source: 'made-up-source', description: 'y' })])[0];
ok('source validation still enforced', sourceStillChecked.source === 'manual', sourceStillChecked.source);

// ── Part 1: the description reaches the prompt, labelled ────────────────────

const formatted = formatProductsForPrompt([{
  title: 'Succulent Gift Box', url: 'https://succulentsbox.com/products/box',
  description: 'Includes four 2 inch succulents in a kraft box.', tags: ['gift', 'box']
}]);
ok('prompt carries the exact storefront label',
  formatted.includes('Official storefront description, use only for concrete item details: Includes four 2 inch succulents in a kraft box.'),
  formatted);
ok('prompt labels tags as categorisation only', /Storefront tags, categorisation only, not product facts: gift, box/.test(formatted), formatted);

const noDesc = formatProductsForPrompt([{ title: 'A', url: 'https://succulentsbox.com/products/a' }]);
ok('no empty storefront label when there is no description', !/Official storefront description/.test(noDesc), noDesc);

const rules = buildStorefrontDescriptionRules();
ok('rules require paraphrase, not copying', /Paraphrase it in your own words/.test(rules));
ok('rules reject promotional adjectives as evidence', /Promotional adjectives .* are marketing language, not evidence/.test(rules));
ok('rules let concrete details count as fact', /concrete detail stated in the description counts as supplied fact/.test(rules));
ok('confirmed notes outrank the storefront description', /confirmed factual notes win/.test(rules));

// ── Parts 2, 3, 4, 7: gift-box writing, banned phrases, noun preference ─────

const voice = buildGiftVoiceRules({ recipient: 'a coworker' });
['curated gift box', 'carefully curated', 'thoughtfully curated', 'curated selection',
 'handpicked collection', 'specially selected', 'perfectly paired', 'coordinated set'].forEach(phrase => {
  ok(`banned phrase listed: ${phrase}`, voice.includes(phrase));
});
ok('the word curated is banned outright', /Do not use the word "curated" at all/.test(voice));
ok('a sparse item gets a short recommendation, not padding', /Do not pad it out with atmosphere/.test(voice));
ok('short recommendation when contents are unknown', /A brief accurate paragraph is better than a long vague one/.test(voice));
ok('no unsupported gift-ready or packaging claims', /boxed, gift ready, ready to give, ready to ship/.test(voice));
ok('no unboxing narration', /Never describe an unboxing/.test(voice));
ok('plant gift is not the default noun', /"Plant gift" is not the default noun/.test(voice));
ok('exact item name preferred first', /1\. The exact item name as supplied\./.test(voice));
// "Living gift" moved from a sparingly-allowed option to an outright ban, so the
// noun preference list is one shorter and "Plant gift" is now item 4.
ok('living gift is banned outright', /Never write "living gift"\./.test(voice)
  && !/"Living gift", occasionally/.test(voice));
ok('plant gift ranked last', /4\. "Plant gift", last/.test(voice));
ok('AI filler banned', /No sentences that would be equally true of any gift on any site/.test(voice));
ok('accuracy beats equal length', /Accuracy beats symmetry/.test(voice));

// ── Correction: treat each item as one complete gift ───────────────────────

ok('gift is treated as one complete gift', /TREAT EACH ITEM AS ONE COMPLETE GIFT/.test(voice));
ok('arrangements, dish gardens and gift boxes are all covered',
  /every arrangement, dish garden, gift box and gift set/.test(voice));
ok('dismantling into components is prohibited', /Never dismantle it into its parts/.test(voice));
ok('inventory walk is prohibited', /plant, then pot, then moss, then dish, then candle, then card, then packaging, then accessories/.test(voice));
ok('an included element may only be mentioned when it explains the whole',
  /mention an included element when it materially explains the overall gift/.test(voice));
ok('elements must not each get their own benefit', /never assign each one its own benefit/.test(voice));
// The three-question formula was REMOVED on purpose: requiring "who it suits"
// in every entry is what produced a relationship narrative per item. What
// replaces it is a description of the job with an explicit licence to vary.
ok('the recommendation formula was removed, not replaced with another one',
  !/what the gift feels like as a whole, who or what moment it suits, and what basic care its plant needs/.test(voice));
ok('a recommendation describes the gift rather than the reasoning',
  /WRITE THE RECOMMENDATION, NOT THE REASONING/.test(voice)
  && /Then write the gift, not the working out/.test(voice));
ok('recommendations may differ in shape, order and length',
  /Not every recommendation needs the same combination, or the same order, or the same length/.test(voice));

['assembled', 'constructed', 'secured', 'anchored', 'built', 'requires no setup', 'comes complete', 'individual components'].forEach(word => {
  ok(`manufacturing term discouraged: ${word}`, voice.includes(`"${word}"`), word);
});
ok('manufacturing and catalog language has its own rule', /NO MANUFACTURING OR CATALOG LANGUAGE/.test(voice));

ok('concise plant care is still allowed inside a recommendation',
  /only to give concise, useful care guidance, and only in one or two natural sentences/.test(voice));
ok('air plants grow without soil is available as a care distinction', /air plants grow without soil/.test(voice));
ok('succulent care distinction is available', /succulents generally want bright light and the soil should dry between waterings/.test(voice));
ok('windowless office caveat is available', /may not suit a windowless office/.test(voice));
ok('pet safety still gated on verification', /Pet safety may be mentioned only when it was verified/.test(voice));
ok('standalone care section still prohibited', /never write a standalone care section/.test(voice));

ok('the failure examples are present', /WHAT NOT TO WRITE\. Three real failures/.test(voice));
ok('dish garden counter-example present',
  /Three live Tillandsia air plants rise from preserved reindeer moss/.test(voice));
ok('arrangement counter-example present',
  /The purple and orange succulents contrast with the white planter and matching dish/.test(voice));
ok('gift box counter-example present',
  /The box includes a succulent, candle, and notecard/.test(voice));
// The positive rewrites moved into the approved samples, which are real
// approved copy rather than examples written for the prompt. Relationship
// grading keeps its ban in the banned-phrase list.
ok('the positive rewrites now come from the approved samples',
  /APPROVED STYLE SAMPLES/.test(voice)
  && !/Air Plant Dish Garden has a sculptural, low-slung look/.test(voice));
ok('relationship grading is still banned by name',
  /thoughtful without being too personal/.test(voice)
  && /more personal than a card/.test(voice));
// The examples must not themselves contain the phrases the rules ban.
['brings personality to a desk', 'ready to place', 'arrives assembled, so there is nothing'].forEach(phrase => {
  const inExample = new RegExp('Write instead: "[^"]*' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  ok(`no banned phrase inside a positive example: ${phrase}`, !inExample.test(voice));
});

['handpicked', 'the gift box is the gift itself', 'this one carries that energy', 'the meaning is built in', 'removes guesswork'].forEach(phrase => {
  ok(`banned phrase retained: ${phrase}`, voice.includes(phrase));
});

ok('storefront description is source material, not an outline',
  /It is NOT a paragraph outline and NOT a checklist/.test(rules));
ok('do not work through the description detail by detail',
  /Do not work through it detail by detail/.test(rules));

const singlePrompt = require('../netlify/functions/lib/prompt-single-plant-gift')
  .buildSinglePlantGiftPrompt({ plantName: 'Air Plant Dish Garden', giftAngle: 'Symbolic or meaningful' });
ok('single-plant prompt applies the complete-gift rule to sets',
  /treat it as ONE complete gift throughout the article/.test(singlePrompt));
ok('single-plant prompt carries the shared complete-gift rules',
  /TREAT EACH ITEM AS ONE COMPLETE GIFT/.test(singlePrompt));

// ── Parts 5, 6: characteristics are an angle; office and light claims ───────

const evidence = buildEvidenceRules();
ok('characteristics rule is absolute', /This rule is absolute and overrides every other instruction/.test(evidence));
ok('characteristics never asserted about an item', /Never state, imply, summarise or restate a requested characteristic/.test(evidence));
ok('characteristics never asserted about the collection', /every gift here is low light/.test(evidence));
ok('office and setting claims gated', /suited to an office, a desk, a cubicle/.test(evidence));
ok('light conditions never conflated', /Never treat any of them as equivalent/.test(evidence));
ok('care effort claims gated', /needs little water, little attention, little care/.test(evidence));

const giftFields = {
  numberOfRecommendations: 1,
  giftCharacteristics: ['Low light', 'Pet friendly'],
  selectedProducts: [{ title: 'Box', url: 'https://succulentsbox.com/products/box', description: 'Four succulents.' }]
};
const guidePrompt = buildGeneralGiftGuidePrompt(giftFields);
ok('gift guide prompt carries the storefront rules', /Official storefront description/.test(guidePrompt) && /USING THE OFFICIAL STOREFRONT DESCRIPTION/.test(guidePrompt));
ok('gift guide prompt bans a light and space section', /A light and space requirements section/.test(guidePrompt));
ok('gift guide keeps its existing removed-section list', /Why plants make good gifts/.test(guidePrompt));

const occasionPrompt = buildOccasionGiftGuidePrompt(Object.assign({ occasion: 'Christmas' }, giftFields));
ok('occasion prompt carries the storefront rules', /USING THE OFFICIAL STOREFRONT DESCRIPTION/.test(occasionPrompt));
ok('occasion prompt bans a light and space section', /A light and space requirements section/.test(occasionPrompt));

const metaPrompt = buildMetadataAndRelatedPrompt('general_gift_guide', giftFields);
ok('title prompt carries the characteristics rule', /GUIDE CHARACTERISTICS ARE A REQUESTED ANGLE, NEVER A VERIFIED FACT/.test(metaPrompt));
ok('title must not promise every item is a plant', /Do not promise that every item is a plant/.test(metaPrompt));
ok('title must not claim a shared characteristic', /Do not claim they are all plants, all low light/.test(metaPrompt));

// ── Part 9: deterministic comparison-table repair ──────────────────────────

const th = 'style="background:#f0f5f0;"';
const collapsed = `<table><thead><tr><th ${th}>Gift Best suited for Style or format Price</th></tr></thead>` +
  `<tbody><tr><td>Our "Best" Box</td><td>a desk</td><td>a gift box</td><td>$32</td></tr></tbody></table>`;
const fixed = repairArticleHtml(collapsed);
ok('collapsed header row is repaired', fixed.repaired === 1);
ok('repair produces one th per column', (fixed.html.match(/<th /g) || []).length === 4, fixed.html);
ok('repair keeps the header labels', /<th [^>]*>Gift<\/th>/.test(fixed.html) && /<th [^>]*>Best suited for<\/th>/.test(fixed.html), fixed.html);
ok('repair keeps the existing th attributes', fixed.html.includes(th));
ok('quotes in a product name survive the repair', fixed.html.includes('Our "Best" Box'), fixed.html);
ok('repaired table passes output validation',
  !validateArticleOutput('general_gift_guide', { selectedProducts: [] }, fixed.html).some(w => /merged|missing these headers/.test(w)),
  JSON.stringify(validateArticleOutput('general_gift_guide', { selectedProducts: [] }, fixed.html)));

const wellFormed = `<table><tr><th>Gift</th><th>Best suited for</th></tr><tr><td>a</td><td>b</td></tr></table>`;
const untouched = repairArticleHtml(wellFormed);
ok('a correct table is left exactly as it was', untouched.repaired === 0 && untouched.html === wellFormed);

const unknownLabel = `<table><tr><th>Gift Mystery Column</th></tr><tr><td>a</td><td>b</td></tr></table>`;
ok('repair refuses an unrecognised header', repairArticleHtml(unknownLabel).repaired === 0);

const countMismatch = `<table><tr><th>Gift Price</th></tr><tr><td>a</td><td>b</td><td>c</td></tr></table>`;
ok('repair refuses when the column count does not match', repairArticleHtml(countMismatch).repaired === 0);
ok('a table the repair refuses is still flagged',
  validateArticleOutput('general_gift_guide', { selectedProducts: [] }, countMismatch).some(w => /merged/.test(w)));

ok('splitter handles separators', JSON.stringify(_internals.splitHeaderLabels('Gift | Best suited for | Price')) === '["Gift","Best suited for","Price"]');
ok('splitter handles no separators', JSON.stringify(_internals.splitHeaderLabels('GiftBest suited forPrice')) === '["Gift","Best suited for","Price"]');
ok('splitter rejects leftovers', _internals.splitHeaderLabels('Gift Nonsense') === null);
ok('repair is a no-op on html with no table', repairArticleHtml('<p>hello</p>').html === '<p>hello</p>');

// ── gift-catalog description extraction ────────────────────────────────────

if (typeof shortDescription === 'function') {
  const out = shortDescription('<script>bad()</script><p>Set of <em>four</em> succulents</p>');
  ok('catalog strips script bodies', !/bad\(\)/.test(out), out);
  ok('catalog keeps the real text', /Set of four succulents/.test(out), out);
} else {
  console.log('SKIP catalog shortDescription not exported');
}

ok('list prompts ask for the gift as one complete thing',
  /Write about the gift as one complete thing/.test(guidePrompt) && /Write about the gift as one complete thing/.test(occasionPrompt));
ok('list prompts still ban a general care section',
  /general succulent care section/.test(guidePrompt) && /general succulent care section/.test(occasionPrompt));

console.log(`\n${failures} failures`);
if (failures) process.exitCode = 1;
