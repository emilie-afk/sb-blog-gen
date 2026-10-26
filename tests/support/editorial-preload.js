// Preload for the private editorial regression suites.
//
// Those suites predate the prompt pack: they call the prompt builders and the
// shared-rules helpers without a pack argument, and assert on the instructions
// the result contains. This preload wraps those functions so each call receives
// the pack named by SB_PROMPT_PACK, which lets the suites run unchanged against
// the real instructions.
//
// The suites themselves, and the pack, are private (docs/PROMPT-PACK.md). This
// file holds no editorial content, so it is committed.
//
//   SB_PROMPT_PACK=./private/prompt-pack.json \
//     node -r ./tests/support/editorial-preload.js private/editorial-tests/prompt-voice.test.js

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const lib = name => require(path.join(ROOT, 'netlify/functions/lib', name));

if (!process.env.SB_PROMPT_PACK) {
  console.error('editorial-preload: set SB_PROMPT_PACK to a private pack file. The synthetic pack holds no editorial content to test.');
  process.exit(2);
}
const { testPack } = require('./test-pack');
const PACK = testPack();

// Builders first: they hold their own references to the shared-rules helpers,
// taken when they were loaded, so wrapping the helpers afterwards cannot reach
// inside them.
const builders = [
  ['prompt-care-guide', 'buildCareGuidePrompt'],
  ['prompt-single-plant-gift', 'buildSinglePlantGiftPrompt'],
  ['prompt-general-gift-guide', 'buildGeneralGiftGuidePrompt'],
  ['prompt-occasion-gift-guide', 'buildOccasionGiftGuidePrompt']
];
for (const [file, name] of builders) {
  const mod = lib(file);
  const original = mod[name];
  mod[name] = fields => original(fields, PACK);
}
const meta = lib('prompt-metadata-related');
const buildMeta = meta.buildMetadataAndRelatedPrompt;
meta.buildMetadataAndRelatedPrompt = (articleType, fields) => buildMeta(articleType, fields, PACK);

// The helpers, pack first.
const shared = lib('shared-rules');
for (const name of ['buildSharedStyleRules', 'buildPlantAccuracyRules', 'buildGiftVoiceRules', 'buildEvidenceRules',
  'buildStorefrontDescriptionRules', 'comparisonTableSkeleton', 'formatReferences', 'formatProductsForPrompt',
  'additional', 'keywordLine']) {
  const original = shared[name];
  shared[name] = (...args) => original(PACK, ...args);
}

// runGeneration is given the same pack when a suite calls it without one.
const run = lib('run-generation');
const runGeneration = run.runGeneration;
run.runGeneration = opts => runGeneration(Object.assign({ pack: PACK }, opts));
