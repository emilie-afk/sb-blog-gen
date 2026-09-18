// Gift-guide prompt quality: brand perspective, removed filler sections, and the
// evidence rules that keep unsupported claims out of the article.
//
// These check the RULES the prompt actually states, not one sample paragraph, so
// a rewrite that keeps the rules keeps passing and a rewrite that drops a
// guardrail fails.
//
// Run: node tests/prompt-voice.test.js

const path = require('path');
const ROOT = path.join(__dirname, '..');
const results = [];
const check = (name, cond, extra) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : ''));

const { validateRequest } = require(path.join(ROOT, 'netlify/functions/lib/validate'));
const { buildOccasionGiftGuidePrompt } = require(path.join(ROOT, 'netlify/functions/lib/prompt-occasion-gift-guide'));
const { buildGeneralGiftGuidePrompt } = require(path.join(ROOT, 'netlify/functions/lib/prompt-general-gift-guide'));
const { buildSinglePlantGiftPrompt } = require(path.join(ROOT, 'netlify/functions/lib/prompt-single-plant-gift'));
const { buildCareGuidePrompt } = require(path.join(ROOT, 'netlify/functions/lib/prompt-care-guide'));
const { ARTICLE_MAX_TOKENS, GIFT_ARTICLE_MAX_TOKENS, METADATA_MAX_TOKENS, articleMaxTokens } =
  require(path.join(ROOT, 'netlify/functions/lib/run-generation'));

const products = n => Array.from({ length: n }, (_, i) => ({
  title: 'Holiday Arrangement ' + (i + 1),
  url: 'https://succulentsbox.com/products/holiday-arrangement-' + (i + 1),
  price: '$3' + (i + 2) + '.00',
  source: 'live-gift-catalog'
}));

const occasion = buildOccasionGiftGuidePrompt(validateRequest('occasion_gift_guide', {
  occasion: 'Christmas', recipient: 'A close friend', numberOfRecommendations: 5, selectedProducts: products(5)
}).fields);
const general = buildGeneralGiftGuidePrompt(validateRequest('general_gift_guide', {
  recipient: 'Coworkers', numberOfRecommendations: 5, selectedProducts: products(5)
}).fields);
const singlePlant = buildSinglePlantGiftPrompt(validateRequest('single_plant_gift', {
  plantName: 'Snake Plant', giftAngle: 'Low maintenance', recipient: 'A new homeowner'
}).fields);
const careGuide = buildCareGuidePrompt(validateRequest('care_guide', { plantName: 'Haworthia' }).fields);

const giftPrompts = [['occasion', occasion], ['general', general]];
const allGiftPrompts = giftPrompts.concat([['single-plant', singlePlant]]);
const everyPrompt = allGiftPrompts.concat([['care guide', careGuide]]);

// ── 1-3. First-party Succulents Box perspective ──────────────────
for (const [name, prompt] of allGiftPrompts) {
  check(`${name}: writes as Succulents Box, not about it`,
    /Succulents Box blog/.test(prompt) && /first person as the brand/.test(prompt));
  check(`${name}: names the gifts as ours`, /our \[exact item name\]/.test(prompt));
  check(`${name}: forbids third-party and affiliate framing`,
    /NEVER WRITE LIKE A THIRD PARTY/.test(prompt)
    && /affiliate/.test(prompt)
    && /Succulents Box sells/.test(prompt)
    && /this seller/.test(prompt)
    && /according to the retailer/i.test(prompt)
    && /our top pick/.test(prompt)
    && /best value/.test(prompt));
  check(`${name}: forbids implying we do not know our own items`,
    /never let it turn into advertising copy/i.test(prompt) || /do not know our own items/i.test(prompt));
}
check('single-plant guide stays gift-focused, not a care guide',
  /gift focused post/.test(singlePlant)
  && /NOT a care guide with a gift title/.test(singlePlant)
  && /a full care guide belongs in a care guide/i.test(singlePlant));

// ── 4-7. Filler sections are prohibited, not required ────────────
for (const [name, prompt] of giftPrompts) {
  check(`${name}: no required "why plants" section`,
    /must NOT be followed by a section explaining why plants make good gifts/.test(prompt)
    && !/<h2[^>]*id="why-plants"/.test(prompt));
  check(`${name}: "why plants" titles are banned by name`,
    /Why plants make great gifts/.test(prompt) && /The meaning of giving plants/.test(prompt));
  check(`${name}: no "ordering and timing" section`,
    /Ordering and timing, shipping advice, or delivery deadlines\./.test(prompt)
    && !/<h2[^>]*id="ordering"/.test(prompt));
  check(`${name}: no "care after the gift" section`,
    /Care after the gift, a care primer, or any general succulent care section\./.test(prompt)
    && !/<h2[^>]*id="care-basics"/.test(prompt));
  check(`${name}: questions are optional with no fixed count`,
    /There is no required number/.test(prompt) && !/\[exactly 5\]/.test(prompt));
  check(`${name}: personalization section is optional`,
    /Leave this section out rather than write filler/.test(prompt));
  check(`${name}: no plant symbolism section`, /plant symbolism/i.test(prompt));
}
check('general guide drops the selection-methodology section',
  /How we chose these gifts, or any selection methodology section\./.test(general)
  && !/<h2[^>]*id="how-we-chose"/.test(general));

// ── 8-9. Evidence rules ──────────────────────────────────────────
const unsupported = ['gift packaging', 'gift wrapping', 'gift messages', 'included care cards',
  'included accessories', 'drainage holes', 'pot materials', 'personalization', 'shipping speed',
  'delivery dates', 'local pickup', 'guarantees', 'return policies', 'exact dimensions'];
for (const [name, prompt] of allGiftPrompts) {
  check(`${name}: unsupported claims are enumerated`,
    unsupported.every(term => prompt.includes(term)),
    unsupported.filter(t => !prompt.includes(t)).join(', '));
  check(`${name}: no repotting or modifying our gifts`,
    /Never suggest repotting one of our arrangements/.test(prompt)
    && /inspect, repair, rewrap, repot, modify/.test(prompt));
  check(`${name}: universal watering schedules banned`,
    /Never give a universal watering schedule/.test(prompt)
    && /water every two to three weeks/.test(prompt)
    && /most succulents need bright indirect light/.test(prompt));
  check(`${name}: omit anything not in the confirmed record`,
    /If a detail is not in the confirmed catalog record or the supplied reference material, leave it out/.test(prompt));
}

// ── 10. Transactional and generic wording ────────────────────────
const bannedWording = ['budget matters', 'covers most recipients', 'something bigger',
  'pooling with others', 'removes guesswork', 'X points toward Y'];
for (const [name, prompt] of allGiftPrompts) {
  check(`${name}: production wording problems are banned by name`,
    bannedWording.every(w => prompt.toLowerCase().includes(w.toLowerCase())),
    bannedWording.filter(w => !prompt.toLowerCase().includes(w.toLowerCase())).join(', '));
  check(`${name}: "recipient" repetition is called out`, /Avoid the word "recipient" repeatedly/.test(prompt));
  check(`${name}: repetitive recommendation patterns are banned`,
    /Do not write one template with the names swapped/.test(prompt));
}

// ── 11-15. What must still be required ───────────────────────────
for (const [name, prompt] of giftPrompts) {
  check(`${name}: one section per confirmed gift is required`,
    /Write one section for each of the 5 featured gifts/.test(prompt));
  check(`${name}: only the confirmed items may appear`,
    /the only items that may appear in this article/.test(prompt)
    && /Never add, invent or substitute an item/.test(prompt));
  check(`${name}: exact URL rule kept`,
    /Use the supplied item URL exactly as given when linking a gift, and link only to that URL/.test(prompt));
  check(`${name}: verified price rule kept`,
    /Use the verified price when one was supplied, and never invent or estimate one/.test(prompt));
  check(`${name}: every confirmed URL is in the prompt`,
    products(5).every(p => prompt.includes(p.url)));
  check(`${name}: comparison table still required`,
    /<th [^>]*>Gift<\/th>/.test(prompt)
    && /Best suited for/.test(prompt)
    && /Every <th> must be its own element/.test(prompt)
    && /never collapse the header row/i.test(prompt));
  check(`${name}: table columns stay supported`,
    /ONLY when that detail was supplied/.test(prompt)
    && /do not invent an attribute just to have another column/i.test(prompt));
  // The selection section is CONDITIONAL, not required. Its old instruction
  // listed comparisons the product data cannot support ("desk sized against
  // statement piece", "the kind of person it is for"), and a required section
  // gets written whether or not the facts support one. It is now bound to
  // confirmed data and omitted when they do not.
  check(`${name}: selection guidance is conditional and evidence-bound`,
    /CONDITIONAL, not required: guidance that helps someone choose between these gifts/.test(prompt)
    && /Write it only when the confirmed facts support a useful comparison/.test(prompt)
    && /Build the selection guidance ONLY from differences explicitly supported by the confirmed product data/.test(prompt)
    && /Omit this section entirely if the confirmed facts do not support a useful comparison/.test(prompt)
    && !/Build it on real differences between the featured items/.test(prompt));
  check(`${name}: the article may end after the table`,
    /It may end after the comparison table when the confirmed facts support no useful comparison/.test(prompt));
  // The ceremonial closing was REMOVED on purpose. The article may end after the
  // selection guidance or a useful FAQ; a closing that restates the selection is
  // one of the failures this pass exists to stop.
  check(`${name}: no ceremonial closing is required`,
    /THE ARTICLE ENDS THERE/.test(prompt)
    && /It does NOT need a ceremonial conclusion, and you must not write one/.test(prompt)
    && !/A short closing from us/.test(prompt));
  check(`${name}: shorter structure is not an excuse for thinner content`,
    /Removing those sections is not a reason to write less/.test(prompt));
}

// ── 16. The standard care guide is untouched ─────────────────────
check('care guide keeps its full structure',
  ['Basic Information', 'Indoors vs Outdoors', 'General Care', 'Extra Care', 'Common Problems',
   'Tips', 'Q&A', 'Where to Buy'].every(section => careGuide.includes(section)),
  ['Basic Information', 'General Care', 'Extra Care', 'Where to Buy'].filter(x => !careGuide.includes(x)).join(', '));
check('care guide keeps its care detail', /12-row table/.test(careGuide) && /Watering/.test(careGuide));
check('care guide is not given the gift-guide section removals',
  !/SECTIONS THAT MUST NOT EXIST/.test(careGuide));
check('care guide speaks as Succulents Box, not about it',
  /our own greenhouses/.test(careGuide) && !/Succulents Box sells/.test(careGuide));

// ── 17-18. Style and safety guardrails ───────────────────────────
// The gift prompts this pass rewrote are em-dash free in their own text. The
// standard care guide's instruction text still uses a few as separators: it
// predates this pass and the brief says to leave that format unchanged. Its
// OUTPUT rule is identical, and generate strips dashes from every article
// regardless, so no article can carry one.
for (const [name, prompt] of allGiftPrompts) {
  check(`${name}: prompt contains no em or en dash`, !/[—–]/.test(prompt),
    (prompt.match(/.{0,30}[—–].{0,30}/) || [''])[0]);
}
for (const [name, prompt] of everyPrompt) {
  check(`${name}: em dash ban stated to the model`, /Never use em dashes or en dashes/.test(prompt));
  check(`${name}: plant accuracy guardrails kept`,
    /impossible to kill/.test(prompt) && /No medical, therapeutic or emotional healing claims/.test(prompt));
}
for (const [name, prompt] of allGiftPrompts) {
  check(`${name}: pet safety guardrail kept`, /pet safe/.test(prompt));
  check(`${name}: thrives on neglect banned`, /thrives on neglect/.test(prompt));
}
const sensitive = buildOccasionGiftGuidePrompt(validateRequest('occasion_gift_guide', {
  occasion: 'Pregnancy and Infant Loss Remembrance Day', numberOfRecommendations: 3,
  selectedProducts: products(3), sensitiveOccasion: true
}).fields);
check('sensitive occasion mode survives the rewrite',
  /SENSITIVE OCCASION MODE IS ON/.test(sensitive)
  && /No urgency of any kind/.test(sensitive)
  && /never as a retail holiday/.test(sensitive));
const noDate = buildOccasionGiftGuidePrompt(validateRequest('occasion_gift_guide', {
  occasion: "National Boss's Day", numberOfRecommendations: 2, selectedProducts: products(2)
}).fields);
check('date handling survives the rewrite',
  /NO DATE WAS SUPPLIED/.test(noDate) && /Never guess or compute the date/.test(noDate));

// ── 19. Token limits unchanged by this pass ──────────────────────
check('gift formats still get 6000 output tokens',
  GIFT_ARTICLE_MAX_TOKENS === 6000
  && articleMaxTokens('occasion_gift_guide') === 6000
  && articleMaxTokens('general_gift_guide') === 6000
  && articleMaxTokens('single_plant_gift') === 6000);
check('care guide still gets 3500', ARTICLE_MAX_TOKENS === 3500 && articleMaxTokens('care_guide') === 3500);
check('metadata still gets 600', METADATA_MAX_TOKENS === 600);

console.log(results.filter(r => r.startsWith('FAIL')).join('\n'));
const failures = results.filter(r => r.startsWith('FAIL')).length;
console.log(`${results.length - failures} checks passed`);
console.log('\n' + failures + ' failures of ' + results.length);
process.exitCode = failures ? 1 : 0;
