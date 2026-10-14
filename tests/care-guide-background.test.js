// Regression coverage for the care guide 504.
//
// The care guide was the last format on the synchronous endpoint, which Netlify
// caps at 60 seconds. These checks hold three things in place: the routing that
// moved it off that limit, the reference validation that used to drop a URL
// silently, and the plant-type routing that stopped potting soil being
// prescribed for an air plant.
//
// Run: node tests/care-guide-background.test.js

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const { validateRequest, PLANT_TYPES } = require(path.join(ROOT, 'netlify/functions/lib/validate'));
const { buildCareGuidePrompt } = require(path.join(ROOT, 'netlify/functions/lib/prompt-care-guide'));

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

const main = read('app/main.js');
const ui = read('app/ui.js');
const formats = read('app/formats.js');

console.log('\n── 1. The care guide uses the background endpoint ──');
// The routing itself. A unit test cannot run the browser, so the browser suite
// asserts the endpoint that is actually called; this asserts the list that
// decides it, which is what a future edit would get wrong.
const bgLine = (main.match(/const BACKGROUND_FORMATS = \[[^\]]*\]/) || [''])[0];
ok('care_guide is a background format', /'care_guide'/.test(bgLine), bgLine);
ok('both gift guides stay background formats',
  /'general_gift_guide'/.test(bgLine) && /'occasion_gift_guide'/.test(bgLine), bgLine);
ok('single-plant remains synchronous', !/'single_plant_gift'/.test(bgLine), bgLine);
ok('the comment no longer calls the care guide synchronous',
  !/care guide\s*\n?\/\/ and single-plant formats are bounded and stay on the synchronous/.test(main));
ok('the reason for the move is recorded in the code',
  /The care guide was the last format on the synchronous endpoint and it was\s*\n\/\/ timing out/.test(main));

console.log('\n── 2. Waiting copy fits the format ──');
ok('a starting message is chosen per format', /function startingMessage\(articleType\)/.test(main));
ok('the care guide message does not mention eight recommendations',
  /if \(articleType === 'care_guide'\) \{[\s\S]*?Writing your care guide[\s\S]*?\}/.test(main)
  && !/Writing your care guide[^']*eight recommendations/.test(main));
ok('the care guide message is exactly the approved wording',
  /return 'Writing your care guide\. Keep this tab open\.';/.test(main));
// The old copy promised "a minute or two". Nothing measures that, so it is gone.
ok('the care guide message claims no duration',
  !/a minute or two/.test(main) && !/care guide[^']*usually takes/.test(main));
ok('the gift guides keep their own message',
  /Starting the guide\. This runs in the background, usually well under a minute, longer for eight recommendations/.test(main));
ok('the generic timeout message no longer suggests fewer products',
  !/use fewer products/.test(ui) && /Generation took too long\. Please try again/.test(ui));
const statusFn = read('netlify/functions/generate-status.js');
ok('the expired-job message does not assume confirmed products',
  !/generate again with fewer recommendations/.test(statusFn)
  && /Everything you entered is still here, so you can generate again/.test(statusFn));

console.log('\n── 3. The background flow is format agnostic ──');
// If the handler special-cased article types, moving the care guide onto it
// would be unsafe. It does not: it validates whatever it is given.
const bg = read('netlify/functions/generate-background.js');
ok('generate-background validates any article type',
  /validateRequest\(payload\.articleType, payload\.fields\)/.test(bg));
ok('generate-background has no per-format branch',
  !/care_guide|general_gift_guide|occasion_gift_guide/.test(bg));
ok('generate-status returns the whole result record',
  /Object\.assign\(\{ jobId, status: 'complete' \}, record\.result\)/.test(statusFn));
const runGen = read('netlify/functions/lib/run-generation.js');
['title', 'alternative_titles', 'html', 'excerpt', 'meta_description',
 'products', 'related_articles', 'warnings'].forEach(key => {
  ok(`the payload carries ${key}`, new RegExp('^\\s*' + key + '[,:]', 'm').test(runGen));
});

console.log('\n── 4. Reference links are never dropped in silence ──');
const refCase = refs => validateRequest('care_guide', { plantName: 'Haworthia', references: refs });
throws('a URL with no link text is rejected, not discarded', 'missing_required',
  () => refCase([{ url: 'https://aspca.org', text: '' }]));
throws('link text with no URL is still rejected', 'missing_required',
  () => refCase([{ url: '', text: 'ASPCA' }]));
ok('a complete reference is kept',
  JSON.stringify(refCase([{ url: 'https://aspca.org', text: 'ASPCA' }]).fields.references)
    === '[{"url":"https://aspca.org","text":"ASPCA"}]');
ok('an empty reference box is not an error',
  refCase([{ url: '', text: '' }]).fields.references.length === 0);
ok('the browser rejects a URL with no link text', /Add the link text for this reference, or clear the URL/.test(main));
ok('the browser still rejects link text with no URL', /Add the reference URL, or clear the link text/.test(main));
ok('buildFields no longer drops a half-filled pair',
  /\}\)\)\.filter\(r => r\.url \|\| r\.text\);/.test(main));
ok('the hint says both halves are required', /Both halves are required for each link you add/.test(main));
// Accuracy: nothing fetches the page, so the hint must not imply otherwise.
ok('the hint does not claim the page is fetched or checked',
  /The page itself is not opened, read or used to check the article/.test(main));
ok('the hint does not promise fact checking',
  !/fact.?check|verif(y|ies|ied) the (page|source)/i.test(main));

console.log('\n── 5. Care instructions follow the plant type ──');
ok('the plant type is an allowlist',
  PLANT_TYPES.join('|') === 'Succulent|Cactus|Air plant (Tillandsia)|Houseplant|Not sure',
  PLANT_TYPES.join('|'));
ok('the form asks for the plant type', /name: 'plantType', type: 'select', label: 'Plant type', required: true/.test(formats));
ok('the form explains why it matters',
  /An air plant guide must not be given potting soil and repotting advice/.test(formats));
throws('an unrecognised plant type is rejected', 'invalid_input',
  () => validateRequest('care_guide', { plantName: 'X', plantType: 'Fern-ish' }));
ok('a missing plant type becomes "Not sure", never a guess',
  validateRequest('care_guide', { plantName: 'X' }).fields.plantType === 'Not sure');

// Each plant type gets a plant that actually belongs to it. Building every
// prompt from one Tillandsia hid the thing these checks exist to catch: a
// houseplant prompt that still reads as if it were describing a succulent.
const NAMES = {
  'Succulent': 'Echeveria Lola',
  'Cactus': 'Golden Barrel Cactus',
  'Air plant (Tillandsia)': 'Tillandsia Bulbosa Belize',
  'Houseplant': 'Monstera Deliciosa',
  'Not sure': 'Mixed 2" Plant Assortment'
};
const prompt = type => buildCareGuidePrompt(
  validateRequest('care_guide', { plantName: NAMES[type], plantType: type }).fields);
const air = prompt('Air plant (Tillandsia)');
const succ = prompt('Succulent');
const cactus = prompt('Cactus');
const house = prompt('Houseplant');
const unsure = prompt('Not sure');

ok('each plant type is tested with a plant of that type',
  air.includes('Tillandsia Bulbosa Belize') && succ.includes('Echeveria Lola')
  && cactus.includes('Golden Barrel Cactus') && house.includes('Monstera Deliciosa')
  && !house.includes('Tillandsia'));

ok('an air plant guide never links succulent potting soil', !/succulent-potting-soil/.test(air));
ok('an air plant guide never links a terracotta pot', !/terracotta-pot/.test(air));
ok('an air plant guide never links succulent pruning', !/how-and-when-to-prune-your-succulents/.test(air));
ok('an air plant guide covers water uptake instead of soil', /Water Uptake &amp; Fertilizer/.test(air));
ok('it states the plant is not fed through soil',
  /takes water and nutrients through its leaves, not through roots in soil/.test(air));
ok('it covers soaking and drying', /soaking or thorough misting/.test(air) && /how completely it must dry/.test(air));
ok('it covers airflow and mounting',
  /Drying &amp; Mounting/.test(air) && /airflow it needs while drying/.test(air) && /wired to a mount/.test(air));
ok('it covers fertilizer suited to air plants', /diluted bromeliad or air plant fertilizer/.test(air));
ok('it covers offsets rather than succulent pruning',
  /Trimming &amp; Offsets/.test(air) && /produces pups around the base after blooming/.test(air));
ok('potting is explained as inapplicable, not replaced with an invented need',
  /Potting and repotting do not apply to [^.]*, so say so in one natural clause rather than inventing a substitute requirement/.test(air));

ok('a succulent guide keeps the soil link', /succulent-potting-soil/.test(succ));
ok('a succulent guide keeps the pot link', /terracotta-pot/.test(succ));
ok('a succulent guide keeps the pruning link', /how-and-when-to-prune-your-succulents/.test(succ));
ok('a houseplant guide keeps potting guidance', /terracotta-pot/.test(house) && /Potting &amp; Repotting/.test(house));
ok('a houseplant guide does not force the succulent mix',
  /ONLY if a fast draining gritty mix genuinely suits/.test(house));

ok('an unconfirmed type is not guessed',
  /The content team did NOT confirm the plant type\. Do not guess one\./.test(unsure));
ok('an unconfirmed type avoids the succulent links',
  !/succulent-potting-soil/.test(unsure) && !/terracotta-pot/.test(unsure));
ok('an unconfirmed type still writes every section',
  /Growing Medium &amp; Fertilizer/.test(unsure) && /Potting or Mounting/.test(unsure) && /Pruning or Trimming/.test(unsure));

console.log('\n── 5b. Watering, Toxicity and Seasonal Care are routed too ──');
// These three sections used to demand succulent-only pages for every plant
// type: the overwatering guide, the "Toxic and Non-Toxic Succulents for Pets"
// page and the succulent winter care guide.
const SUCCULENT_ONLY = {
  'the overwatering guide': /overwatered-vs-underwatered/,
  'the succulent pet-toxicity page': /toxic-and-non-toxic-succulents-for-pets/,
  'the succulent winter care guide': /indoor-outdoor-winter-care-guide-for-succulents/
};
[['air plant', air], ['houseplant', house], ['not sure', unsure]].forEach(([label, p]) => {
  Object.entries(SUCCULENT_ONLY).forEach(([page, re]) => {
    ok(`${label}: ${page} is not linked`, !re.test(p));
  });
  // Dropping the link must not drop the advice.
  ok(`${label}: Watering is still a required section`, /<h3[^>]*>2\. Watering<\/h3>/.test(p));
  ok(`${label}: Watering is written out in full`,
    /2\. Watering[\s\S]*?fully written[\s\S]*?Write the watering advice out in full rather than leaning on a link/.test(p));
  ok(`${label}: Toxicity is still a required section`, /<h3[^>]*>5\. Toxicity<\/h3>/.test(p));
  ok(`${label}: Toxicity is answered rather than deferred to the link`,
    /The absence of a link is not a reason to leave the toxicity question unanswered/.test(p));
  ok(`${label}: Toxicity names a real fallback source`, /check with a vet or the ASPCA/.test(p));
  ok(`${label}: Seasonal Care is still a required section`, /5\. Seasonal Care Tips/.test(p));
  ok(`${label}: Seasonal Care keeps both halves of the year`,
    /<strong>Fall and Winter:<\/strong>/.test(p) && /<strong>Spring &amp; Summer:<\/strong>/.test(p));
  ok(`${label}: Fall and Winter is written out in full`,
    /Fall and Winter:<\/strong> \[1-2 sentences, fully written/.test(p));
  ok(`${label}: the guide names this plant in the routed sections`, p.includes(NAMES[label === 'air plant'
    ? 'Air plant (Tillandsia)' : label === 'houseplant' ? 'Houseplant' : 'Not sure']));
});
// Succulents and cacti are what those pages describe, so they keep the links.
[['succulent', succ], ['cactus', cactus]].forEach(([label, p]) => {
  Object.entries(SUCCULENT_ONLY).forEach(([page, re]) => {
    ok(`${label}: ${page} is still linked`, re.test(p));
  });
});
ok('the prompt rule covers all six link-bearing sections',
  /succulent soil, pot, pruning, overwatering, toxicity or winter care link/.test(house));
ok('a missing link never shortens a section',
  /A missing link is never a reason to shorten a section, skip the advice or send the reader elsewhere for it/.test(house));

console.log('\n── 6. Structure, styling and HTML survive the change ──');
[['air', air], ['succulent', succ], ['cactus', cactus], ['houseplant', house], ['not sure', unsure]].forEach(([name, p]) => {
  ok(`${name}: all ten sections present`,
    ['basic-information', 'indoors-vs-outdoors', 'general-care', 'extra-care',
     'common-problems', 'tips', 'qa', 'where-to-buy'].every(id => p.includes(`id="${id}"`)));
  ok(`${name}: the 12-row table is still required`, /12 rows/.test(p) && /12-row table/.test(p));
  ok(`${name}: headings keep the inline brand color`, /<h3 style="color:#34bfa2">/.test(p));
  ok(`${name}: raw HTML only`, /Return ONLY raw HTML, no markdown, no fences/.test(p));
  ok(`${name}: five Q&As still required`, /exactly 5 styled Q&As/.test(p));
  ok(`${name}: the care accuracy rules are present`, /CARE ACCURACY, these override the section hints below/.test(p));
  ok(`${name}: a soil row is answered honestly rather than invented`,
    /"Soil Type" and "Soil pH" say so plainly/.test(p));
  ok(`${name}: no section may be dropped`, /and do not leave a section out/.test(p));
});

console.log(`\n${failures} failures`);
if (failures) process.exitCode = 1;
