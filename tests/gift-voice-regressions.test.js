// Regression coverage for the coworker gift guide that prompted this pass.
//
// These check the RULES the prompt states, not a generated article. Searching a
// generated article after the fact only tells you about one sample; a missing
// rule is the thing that lets the failure come back. Each numbered case below is
// one of the failures in that article, and each asserts the instruction that
// makes it impossible rather than the prose it produced.
//
// Run: node tests/gift-voice-regressions.test.js

const path = require('path');
const ROOT = path.join(__dirname, '..');

const { validateRequest } = require(path.join(ROOT, 'netlify/functions/lib/validate'));
const { buildOccasionGiftGuidePrompt } = require(path.join(ROOT, 'netlify/functions/lib/prompt-occasion-gift-guide'));
const { buildGeneralGiftGuidePrompt } = require(path.join(ROOT, 'netlify/functions/lib/prompt-general-gift-guide'));
const { buildSinglePlantGiftPrompt } = require(path.join(ROOT, 'netlify/functions/lib/prompt-single-plant-gift'));
const { buildCareGuidePrompt } = require(path.join(ROOT, 'netlify/functions/lib/prompt-care-guide'));

let failures = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('PASS ' + name); return; }
  failures += 1;
  console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + extra : ''));
}

// The exact shape that produced the failing article: five confirmed gifts, a
// coworker framing, prices on every item.
const products = [
  { title: 'Pre-Assembled Air Plant Dish Garden', url: 'https://succulentsbox.com/products/air-plant-dish-garden', price: '$32.00', source: 'live-gift-catalog', description: 'Three Tillandsia displayed on preserved reindeer moss in a glazed dish.' },
  { title: 'Purple and Orange Succulent Arrangement', url: 'https://succulentsbox.com/products/purple-orange', price: '$45.00', source: 'live-gift-catalog' },
  { title: 'Succulent Birthday Gift Box', url: 'https://succulentsbox.com/products/birthday-box', price: '$26.00', source: 'live-gift-catalog' },
  { title: 'Thank You Gift Box', url: 'https://succulentsbox.com/products/thank-you-box', price: '$26.00', source: 'live-gift-catalog' },
  { title: 'DIY Air Plant Terrarium Kit', url: 'https://succulentsbox.com/products/diy-terrarium', price: '$38.00', source: 'live-gift-catalog' }
];

const general = buildGeneralGiftGuidePrompt(validateRequest('general_gift_guide', {
  recipient: 'Coworkers', giftCharacteristics: ['Low maintenance', 'Desk friendly'],
  numberOfRecommendations: 5, selectedProducts: products
}).fields);
const occasion = buildOccasionGiftGuidePrompt(validateRequest('occasion_gift_guide', {
  occasion: 'Employee Appreciation Day', recipient: 'Coworkers',
  numberOfRecommendations: 5, selectedProducts: products
}).fields);
const singlePlant = buildSinglePlantGiftPrompt(validateRequest('single_plant_gift', {
  plantName: 'Air Plant Dish Garden', giftAngle: 'Desk or office gift', recipient: 'A coworker'
}).fields);
const careGuide = buildCareGuidePrompt(validateRequest('care_guide', { plantName: 'Haworthia' }).fields);

const listPrompts = [['general', general], ['occasion', occasion]];
const giftPrompts = listPrompts.concat([['single-plant', singlePlant]]);

// A rule counts as present only when it is stated in EVERY gift prompt: a
// guardrail that reaches two of the three formats is a guardrail with a hole.
function inEveryGiftPrompt(name, pattern, prompts) {
  const set = prompts || giftPrompts;
  const missing = set.filter(([, p]) => !pattern.test(p)).map(([n]) => n);
  ok(name, missing.length === 0, missing.length ? 'missing from: ' + missing.join(', ') : undefined);
}

// Phrases the article actually used, which the prompt must now name and ban.
// Naming them verbatim matters: a general instruction to "avoid filler" is what
// was already in place when these were written.
function bannedVerbatim(label, phrase) {
  inEveryGiftPrompt(`banned by name: ${label}`, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

console.log('\n── 1. "modest light" contradicted by bright-light care ──');
inEveryGiftPrompt('modest light is banned as an unsupported setting claim', /is appropriate for modest light/);
inEveryGiftPrompt('a modest-light claim cannot coexist with bright-light care guidance',
  /Never describe the light in an item's setting as modest, low or limited and then give care guidance that requires bright conditions/);
inEveryGiftPrompt('light conditions are never treated as interchangeable',
  /Never treat any of them as equivalent, and never substitute one for another/);

console.log('\n── 2. "none of them demand much attention" ──');
bannedVerbatim('none of them demand much attention', 'none of them demand much attention');
inEveryGiftPrompt('collective claims need every item to support them',
  /Never say "all of these", "every one of these" or "none of them" share a characteristic unless every confirmed item's own data supports it/);
inEveryGiftPrompt('the introduction makes no group claim',
  /The introduction makes no claim about the items as a group/, listPrompts);
inEveryGiftPrompt('the introduction may not claim none of the gifts demand attention',
  /that none of the gifts demand attention/, listPrompts);

console.log('\n── 3. "designed to sit comfortably in a workplace" ──');
bannedVerbatim('designed to sit comfortably in a workplace', 'designed to sit comfortably in a workplace');
inEveryGiftPrompt('the brief\'s setting is editorial context, not a product fact',
  /That is editorial context, not a verified product characteristic/);
inEveryGiftPrompt('unsupported workplace claims are enumerated',
  /fits any desk, works anywhere in an office, suits any office style, is ideal for every workspace/);

console.log('\n── 4. the dish garden taken apart into Tillandsia, dish and moss ──');
inEveryGiftPrompt('a complete gift is never dismantled', /Never dismantle it into its parts and discuss each part in turn/);
inEveryGiftPrompt('the inventory walk is named explicitly',
  /plant, then pot, then moss, then dish, then candle, then card, then packaging, then accessories/);
inEveryGiftPrompt('the storefront description is not an outline',
  /it is not an outline for the paragraph/);
inEveryGiftPrompt('supplied facts are selected, not recited',
  /Do not recite every supplied fact merely because it is available/);
inEveryGiftPrompt('the dish-garden counter-example is shown',
  /Three live Tillandsia air plants rise from preserved reindeer moss[\s\S]*?That is a product description that takes the gift apart/);

console.log('\n── 5. air plants described as growing from a dish ──');
inEveryGiftPrompt('air plants are displayed, never planted', /AIR PLANTS ARE DISPLAYED, NOT PLANTED/);
inEveryGiftPrompt('the growing-from wording is banned in every form',
  /Never write that they grow from, grow out of, grow in, or are planted in moss, a dish, stones, sand, a globe or any other display material/);
bannedVerbatim('grow from a dish', 'grow from a dish');

console.log('\n── 6. "already arranged and ready to place" ──');
bannedVerbatim('ready to place', 'ready to place');
bannedVerbatim('already arranged', 'already arranged');
bannedVerbatim('ready-made', 'ready-made');
bannedVerbatim('ready to display', 'ready to display');
inEveryGiftPrompt('pre-assembled is allowed only inside the exact product name',
  /"pre-assembled" \(outside the exact supplied item name\)/);
inEveryGiftPrompt('the exact supplied name is preserved in the linked heading',
  /The linked heading must carry the EXACT supplied item name, including words like "Pre-Assembled"/);
inEveryGiftPrompt('the short name may be used in prose and the table',
  /you may shorten it to the natural short name \(for example "the Air Plant Dish Garden"\)/);

console.log('\n── 7. gift boxes broken into candles, cards, lotions, mugs, chocolates ──');
inEveryGiftPrompt('the inventory ban names the gift-box contents too',
  /a stone, a ribbon, a mug, a lotion or a chocolate/);
inEveryGiftPrompt('elements are never each given their own benefit', /never assign each one its own benefit/);
inEveryGiftPrompt('the gift-box counter-example is shown',
  /The candle adds warmth, the card makes it personal[\s\S]*?gives each piece its own marketing benefit/);
inEveryGiftPrompt('a DIY kit may explain the activity without listing materials',
  /That is not permission to list the materials it contains/);

console.log('\n── 8. "without overstepping into personal territory" ──');
bannedVerbatim('without overstepping into personal territory', 'without overstepping into personal territory');
bannedVerbatim('thoughtful without being too personal', 'thoughtful without being too personal');
bannedVerbatim('professional without being cold', 'professional without being cold');
bannedVerbatim('meaningful without overstepping', 'meaningful without overstepping');
bannedVerbatim('without crossing a line', 'without crossing a line');
bannedVerbatim('more thoughtful than a card', 'more thoughtful than a card');
bannedVerbatim('fits a professional relationship', 'fits a professional relationship');
bannedVerbatim('without it becoming part of their workday', 'without it becoming part of their workday');
inEveryGiftPrompt('a gift is never classified by relationship', /A GIFT IS NOT CLASSIFIED BY RELATIONSHIP/);
inEveryGiftPrompt('the forbidden classifications are enumerated',
  /personal or impersonal, intimate or not intimate, professional, safe for a particular relationship/);
inEveryGiftPrompt('no relationship narrative is manufactured', /Do not manufacture a relationship narrative for a recommendation/);
inEveryGiftPrompt('most recommendations carry no emotional statement at all',
  /Most recommendations should contain no statement about professional boundaries, intimacy, thoughtfulness, gratitude or emotional meaning at all/);
inEveryGiftPrompt('the old emotional-register instruction is gone', /^(?!.*pitch the emotional register)/s);
inEveryGiftPrompt('the brief\'s recipient is context, not a gift property',
  /It is editorial context, not a property of any gift|No recipient was specified/);

console.log('\n── 9. "the succulent lives on after the celebration" ──');
bannedVerbatim('the succulent lives on after the celebration', 'the succulent lives on after the celebration');
bannedVerbatim('lives on after the celebration', 'lives on after the celebration');
bannedVerbatim('something to enjoy after the celebration', 'something to enjoy after the celebration');
inEveryGiftPrompt('no sentimental story about the gift afterwards',
  /Do not invent a sentimental story about opening the gift, displaying it, remembering it, or continuing to enjoy it/);

console.log('\n── 10. "set it on a desk without worry" ──');
bannedVerbatim('set it on a desk or shelf without worry', 'set it on a desk or shelf without worry');
bannedVerbatim('set it on a desk without worry', 'set it on a desk without worry');
inEveryGiftPrompt('placed-without-worry is an unsupported claim', /can be placed without worry/);

console.log('\n── 11. "suits any office style" ──');
bannedVerbatim('suits any office style', 'suits any office style');
bannedVerbatim('the minimal design suits any office style', 'the minimal design suits any office style');
bannedVerbatim('brings personality to a desk', 'brings personality to a desk');
bannedVerbatim('without feeling like decor', 'without feeling like decor');
bannedVerbatim("whether they're a plant person or new to living plants", "whether they're a plant person or new to living plants");

console.log('\n── 12. "this gift box does it with intention" ──');
bannedVerbatim('does it with intention', 'does it with intention');
bannedVerbatim('carries that energy', 'carries that energy');
bannedVerbatim('brings the occasion into focus', 'brings the occasion into focus');
bannedVerbatim('gratitude deserves its own moment', 'gratitude deserves its own moment');
bannedVerbatim('makes space for gratitude', 'makes space for gratitude');
bannedVerbatim('the presentation does the work', 'the presentation does the work');
bannedVerbatim('a moment worth marking', 'a moment worth marking');
bannedVerbatim('properly celebrated', 'properly celebrated');
bannedVerbatim('without needing a speech', 'without needing a speech');
inEveryGiftPrompt('a reworded banned line is still banned',
  /do not write a close paraphrase of one either. A reworded version of a banned line is still a banned line/);

console.log('\n── 13. a bare price appended to every recommendation ──');
inEveryGiftPrompt('price belongs in the table', /Verified prices belong in the comparison table/);
inEveryGiftPrompt('no bare price on a recommendation',
  /Do not append a bare price to a recommendation, and do not end a recommendation with one/);
inEveryGiftPrompt('the exact price openers are banned',
  /No "\$26\.00" on its own, no "At \$26\.00\.\.\.", no "Priced at\.\.\.", no "For \$\.\.\."/);
ok('the recommendation template no longer asks for the price',
  listPrompts.every(([, p]) => /Do not append the price\./.test(p) && !/Include the verified price when one was supplied/.test(p)));

console.log('\n── 14. a paragraph repeating every price from the table ──');
inEveryGiftPrompt('no paragraph narrating the table prices',
  /Never write a paragraph that narrates the prices already visible in the table/);
inEveryGiftPrompt('a price-summary section is banned outright',
  /A paragraph that summarises the prices already shown in the table/, listPrompts);
['price-wise', 'most affordable', 'most accessible', 'investment piece', 'premium option',
 'budget-friendly', 'substantial for the price'].forEach(w => bannedVerbatim(w, w));

console.log('\n── 15. "makes the gift land differently" ──');
bannedVerbatim('makes the gift land differently', 'makes the gift land differently');
bannedVerbatim('moves the gift from thoughtful to genuinely felt', 'moves the gift from thoughtful to genuinely felt');
bannedVerbatim('matches the person and the moment', 'matches the person and the moment');

console.log('\n── 16. a generic "Choose and Send" conclusion ──');
inEveryGiftPrompt('Choose and Send is banned by name', /"Choose and Send"/, listPrompts);
inEveryGiftPrompt('In Closing is banned by name', /"In Closing"/, listPrompts);
inEveryGiftPrompt('a final sales paragraph is banned',
  /A final sales paragraph, a second selection summary, or any closing that repeats the selection section/, listPrompts);
inEveryGiftPrompt('the article may simply end', /THE ARTICLE ENDS THERE/, listPrompts);
inEveryGiftPrompt('no ceremonial conclusion', /It does NOT need a ceremonial conclusion, and you must not write one/, listPrompts);

console.log('\n── 17. "We\'re here when you\'re ready" ──');
bannedVerbatim("we're here when you're ready", "we're here when you're ready");
bannedVerbatim('pick the one that feels right', 'pick the one that feels right');
bannedVerbatim('choose the version that feels right', 'choose the version that feels right');
bannedVerbatim('ready for the moment', 'ready for the moment');

console.log('\n── 18. a rigid air-plant watering frequency with no evidence ──');
inEveryGiftPrompt('no frequency without item-level evidence',
  /Never give a frequency, a schedule or a count, such as "mist two or three times a week" or "water every ten days", unless that exact schedule is in the supplied data for that exact item/);
inEveryGiftPrompt('air plants are not maintenance free', /Never imply air plants are maintenance free/);
inEveryGiftPrompt('no promise about fluorescent office light',
  /Never promise a plant will thrive under fluorescent office lighting/);
inEveryGiftPrompt('direct sun and bright indirect light are not the same',
  /Never treat direct sunlight and bright indirect light as the same thing/);
inEveryGiftPrompt('universal watering schedules still banned', /Never give a universal watering schedule/);

console.log('\n── 19. duplicate selection and closing sections ──');
inEveryGiftPrompt('sections must not restate one another', /DO NOT SAY THE SAME THING TWICE/);
inEveryGiftPrompt('no second selection summary', /Do not write a second selection summary after the selection section/);
// The voice rules are shared by three formats with different structures. A rule
// that contradicts a format's own STRUCTURE would make the prompt incoherent,
// so the shared rules defer to it explicitly rather than overriding it.
inEveryGiftPrompt('the shared rules defer to each format\'s own structure',
  /The structure wins where the two differ/);
ok('the single-plant format keeps the care step its structure asks for',
  /The essential care the person receiving it will need/.test(singlePlant)
  && /do not add a closing the STRUCTURE above did not ask for/.test(singlePlant));
inEveryGiftPrompt('no repeating a recommendation later in different words',
  /Do not repeat a recommendation's point in a later section in different words/);
inEveryGiftPrompt('generic pre-recommendation sections are banned',
  /Any generic section before the recommendations, however it is titled/, listPrompts);
inEveryGiftPrompt('the named filler sections are banned',
  /"Why these gifts work", "Gifts for every workspace", "A Personal Message"/, listPrompts);
inEveryGiftPrompt('artificial grouping is banned',
  /Do not split the featured gifts into invented categories/, listPrompts);

console.log('\n── Structure: required vs optional ──');
// Selection guidance is CONDITIONAL, not required. It was the section most
// likely to invent claims, because a required section gets written whether or
// not the facts support one. The summary, the section itself and the end-of-
// article rule must all agree on that, or the prompt licenses what it forbids.
ok('the required structure is intro, recommendations and the table only',
  listPrompts.every(([, p]) =>
    /That is the whole required article: introduction, one section per gift, and the comparison table\./.test(p)));
ok('the summary makes selection guidance conditional',
  listPrompts.every(([, p]) =>
    /Add selection guidance only when confirmed facts support a useful comparison\./.test(p)));
ok('the selection section itself is marked conditional',
  listPrompts.every(([, p]) =>
    /4\. CONDITIONAL, not required: guidance that helps someone choose between these gifts/.test(p)
    && /Write it only when the confirmed facts support a useful comparison/.test(p)));
ok('the selection section is omitted when the facts do not support it',
  listPrompts.every(([, p]) =>
    /Omit this section entirely if the confirmed facts do not support a useful comparison/.test(p)));
ok('the article may end after the table when no comparison is supported',
  listPrompts.every(([, p]) =>
    /It may end after the comparison table when the confirmed facts support no useful comparison/.test(p)));
ok('the article may still end after the selection guidance or a FAQ',
  listPrompts.every(([, p]) =>
    /after the selection guidance when they do, or after a useful FAQ/.test(p)));
// The three statements must not contradict each other: nothing may still call
// the selection section part of the required article.
ok('nothing still describes selection guidance as required',
  listPrompts.every(([, p]) =>
    !/required article: introduction, one section per gift, the table, and the selection guidance/.test(p)));
ok('the FAQ is optional and evidence-bound',
  listPrompts.every(([, p]) => /OPTIONAL, only when there are real questions/.test(p) && /There is no required number/.test(p)));
ok('personalization is optional and gated on confirmed information',
  listPrompts.every(([, p]) =>
    /OPTIONAL, and only when confirmed gift message or personalization information applies to these items AND has not already been covered/.test(p)));
ok('one introductory paragraph, not two or three',
  listPrompts.every(([, p]) => /ONE short introductory paragraph/.test(p) && !/a short introduction of two or three paragraphs/.test(p)));

console.log('\n── Comparison table ──');
ok('the four headers stay separate cells',
  listPrompts.every(([, p]) =>
    /<th [^>]*>Gift<\/th>/.test(p) && /<th [^>]*>Best suited for<\/th>/.test(p)
    && /<th [^>]*>Style or format<\/th>/.test(p) && /<th [^>]*>Price<\/th>/.test(p)));
ok('style or format is a gift-level description',
  listPrompts.every(([, p]) => /"Style or format" names the KIND of gift in a few words. It is not a contents list/.test(p)));
ok('good table entries are shown',
  listPrompts.every(([, p]) => /Good: "Air plant dish garden"\. "Succulent birthday gift box"/.test(p)));
ok('component-inventory table entries are shown as wrong',
  listPrompts.every(([, p]) => /Bad: "Gift box with plant and candle"\. "Planted arrangement in a decorative dish"/.test(p)));
ok('best suited for may not be invented',
  listPrompts.every(([, p]) =>
    /Never invent light tolerance, a relationship boundary, a personality trait, a desk size or a recipient preference to fill that cell/.test(p)));

console.log('\n── Evidence: nothing inferred from the kind of thing an item is ──');
['dimensions', 'what a variant contains', 'what a variant costs', 'pot drainage',
 'whether a saucer catches water', 'size relative to the other items', 'neglect tolerance'].forEach(term => {
  inEveryGiftPrompt(`never inferred: ${term}`, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
inEveryGiftPrompt('no superlative across the collection',
  /Never call an item the largest, smallest, easiest, cheapest, most affordable or most anything in the collection/);
inEveryGiftPrompt('a tag is not a factual claim',
  /never turn a tag into a factual claim unless the product description confirms it/);
inEveryGiftPrompt('an unsupported requested characteristic is simply not claimed',
  /Never pretend the item has it/);

// ── Contradiction sweep ────────────────────────────────────────────────────
// Everything above verifies that a PROHIBITION is present. That is only half the
// job: the three faults found in review were all positive instructions elsewhere
// in the same prompt that licensed exactly what the prohibitions forbid. A rule
// and its contradiction can both be present and the tests above still pass.
//
// This sweep reads the prompt as blocks and asks a different question: does the
// idea appear anywhere OUTSIDE a prohibition? A block counts as prohibitive when
// it carries a prohibition marker anywhere in it, which covers both "Never do X"
// and a bulleted ban list under a "Do not write any of these" heading. Anything
// else is an instruction the model is expected to follow.
const PROHIBITION = /\b(never|do not|don't|cannot|must not|avoid|banned|prohibit|rather than guess)\b|Do NOT write|Bad:/i;

// Sentence level, not block level. A first attempt tested whole blocks and let a
// real fault through: the selection-guidance block ended with "Do not restate
// every recommendation", and that unrelated prohibition made the whole block
// read as prohibitive, hiding the instruction to compare "desk sized against
// statement piece" earlier in it. A prohibition somewhere nearby does not make
// an instruction safe.
function sentences(text) {
  return String(text).split(/(?<=[.:!?])\s+|\n/);
}

// A match is licensed unless its OWN sentence prohibits it, or it sits in a block
// whose opening sentence declares a prohibition (which is how the bulleted ban
// lists are written: one "Do not write any of these" heading, then the phrases).
function onlyEverProhibited(label, pattern, prompts) {
  const set = prompts || giftPrompts;
  const offenders = [];
  for (const [name, prompt] of set) {
    for (const block of String(prompt).split(/\n\s*\n/)) {
      if (!pattern.test(block)) continue;
      const parts = sentences(block);
      const headingProhibits = parts.length > 0 && PROHIBITION.test(parts[0]);
      if (headingProhibits) continue;
      for (const sentence of parts) {
        if (!pattern.test(sentence)) continue;
        if (PROHIBITION.test(sentence)) continue;
        offenders.push(name + ': ' + sentence.replace(/\s+/g, ' ').slice(0, 110));
      }
    }
  }
  ok(`never licensed elsewhere: ${label}`, offenders.length === 0, offenders.join(' | '));
}

console.log('\n── Contradiction sweep: no positive instruction licenses banned output ──');

// Fix 1. The selection guidance used to list "desk sized against statement
// piece", "the kind of person it is for", "the relationship" and "the tone of
// the occasion" as things to compare. Each is a claim the product data does not
// support, invited by the very section that was supposed to be evidence-bound.
onlyEverProhibited('desk size or statement-piece comparisons', /desk sized|statement piece/i);
onlyEverProhibited('comparing by the kind of person', /the kind of person it is for/i);
onlyEverProhibited('comparing by relationship or tone of occasion', /the relationship, the tone of the occasion/i);
onlyEverProhibited('festive versus year round design intent', /festive design against year round style/i);
onlyEverProhibited('compact against centerpiece', /compact against centerpiece/i);
ok('selection guidance is bound to confirmed data',
  listPrompts.every(([, p]) =>
    /Build the selection guidance ONLY from differences explicitly supported by the confirmed product data/.test(p)));
ok('selection guidance names the supported difference types',
  listPrompts.every(([, p]) =>
    /the verified gift format, the plant type, a DIY activity, care requirements, an occasion named in the official item, and the supplied prices/.test(p)));
ok('selection guidance is omitted when the facts do not support it',
  listPrompts.every(([, p]) =>
    /Omit this section entirely if the confirmed facts do not support a useful comparison/.test(p)));
ok('selection guidance forbids the six inferences',
  listPrompts.every(([, p]) =>
    /Never infer size, placement, personality, relationship suitability, design intent, or visual impact/.test(p)));

// Fix 2. The manufacturing-language rule told the model to write "language that
// helps the reader picture the gift in the person's space", which is an
// instruction to invent the room the next section forbids inventing.
onlyEverProhibited('picturing the gift in someone\'s space', /picture the gift in the person's space/i);
inEveryGiftPrompt('manufacturing language is replaced by plain verified description',
  /Describe the complete gift plainly using verified details/);
inEveryGiftPrompt('the replacement itself forbids an imagined scene',
  /Do not replace manufacturing language with an imagined room, desk, shelf, unboxing scene, or recipient reaction/);

// Fix 3. The single-plant structure still asked for "what that gives the person
// who receives it", "who might appreciate it", "the kind of space it suits" and
// a closing that "returns to the gift".
onlyEverProhibited('what the plant gives the person receiving it', /what that gives the person who receives it/i);
onlyEverProhibited('who might appreciate it', /who might appreciate it/i);
onlyEverProhibited('the kind of space it suits', /the kind of space it suits/i);
onlyEverProhibited('a closing that returns to the gift', /closing from us that returns to the gift/i);
ok('the single-plant section 2 stays on the plant',
  /Stay on the plant itself: do not follow this with a sentence about what that gives the person who receives it/.test(singlePlant));
ok('the single-plant setting section is bound to confirmed facts',
  /built ONLY from confirmed light, size and care facts for this plant/.test(singlePlant));
ok('the single-plant prompt forbids an invented recipient personality',
  /Do not invent a recipient personality, a relationship justification, or a reason this plant suits a particular kind of person/.test(singlePlant));
ok('the single-plant setting section is dropped when unsupported',
  /leave this section out rather than guess at one/.test(singlePlant));
ok('the single-plant closing is optional and never ceremonial',
  /OPTIONAL: a short closing from us/.test(singlePlant)
  && /never a ceremonial wrap-up, never an emotional summary, and never a restatement of the article/.test(singlePlant));

// The positive examples are instructions too: a model copies what it is shown.
// These are the phrases the rules ban, checked inside the "Write instead" lines
// specifically, where an example would be modelling the fault rather than fixing it.
const positiveExamples = (prompt) => (prompt.match(/Write instead: "[^"]*"/g) || []).join(' ');
[
  ['a desk or shelf placement', /\b(desk|shelf|office|cubicle|room)\b/i],
  ['a visual-impact claim', /more presence|visual presence|statement/i],
  ['a recipient judgement', /would love|would appreciate|perfect for|suits someone who/i],
  ['a price', /\$\d/]
].forEach(([label, pattern]) => {
  const bad = giftPrompts.filter(([, p]) => pattern.test(positiveExamples(p))).map(([n]) => n);
  ok(`no ${label} inside a "Write instead" example`, bad.length === 0, bad.join(', '));
});

// The style examples model the whole article's register, so they get the same
// treatment: every claim in them must be a verified format or a plant fact.
ok('the style examples model only verified formats and plant facts',
  giftPrompts.every(([, p]) =>
    /Notice that every statement in them is either a verified gift format or a verified plant fact, and that neither example places a gift in a room or guesses at who would like it/.test(p)));
ok('the style examples contain no room or surface placement',
  giftPrompts.every(([, p]) => {
    const examples = (p.match(/Opening: "[^"]*"|Choosing between gifts: "[^"]*"/g) || []).join(' ');
    return !/\b(shelf|desk|table|office|room|surface)\b/i.test(examples);
  }));

console.log('\n── Scope: the care guide is untouched ──');
ok('the care guide gets none of the gift voice rules',
  !/A GIFT IS NOT CLASSIFIED BY RELATIONSHIP/.test(careGuide)
  && !/AIR PLANTS ARE DISPLAYED, NOT PLANTED/.test(careGuide)
  && !/THE ARTICLE ENDS THERE/.test(careGuide));
ok('the care guide keeps its own structure',
  ['Basic Information', 'General Care', 'Extra Care', 'Where to Buy'].every(s => careGuide.includes(s)));

console.log('\n── The prompts stay em-dash free ──');
giftPrompts.forEach(([name, p]) => {
  ok(`${name}: no em or en dash in the prompt text`, !/[—–]/.test(p),
    (p.match(/.{0,40}[—–].{0,40}/) || [''])[0]);
});

console.log(`\n${failures} failures`);
if (failures) process.exitCode = 1;
