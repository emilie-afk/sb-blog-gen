#!/usr/bin/env node
// PRIVATE TOOL. Proves that a prompt pack renders exactly the prompts that the
// pre-migration source code produced, byte for byte, across every branch in
// tests/fixtures/prompt-briefs.js.
//
// This file contains no prompt content. It compares two things you supply:
//
//   --pack <file>         a prompt pack JSON file you hold privately
//   --ref <git ref>       the commit whose prompt modules are the reference, or
//   --baseline <dir>      a directory holding copies of those modules
//
// Use --ref before the Git history cleanup in docs/HISTORY-CLEANUP.md, while the
// old modules still exist in history. Afterwards, keep a private copy of the
// modules and pass --baseline.
//
// By default it prints only counts and, for a mismatch, the article type, the
// brief index and the character offset where the two first differ. --show adds
// forty characters either side of that offset. That context is prompt content,
// so --show is for a private terminal, never a shared log.
//
//   node tools/pack-parity.js --pack ./private/prompt-pack.json --ref 20043bc

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MODULES = [
  'shared-rules', 'prompt-care-guide', 'prompt-single-plant-gift',
  'prompt-general-gift-guide', 'prompt-occasion-gift-guide', 'prompt-metadata-related', 'rank-articles'
];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message) {
  console.error('pack-parity: ' + message);
  process.exit(2);
}

// The old modules are required from a scratch tree laid out like the
// repository, so their own relative requires (./shared-rules,
// ../../../data/catalog.js) resolve to the same data the new code reads.
function stageBaseline(ref, dir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-parity-'));
  const lib = path.join(tmp, 'netlify', 'functions', 'lib');
  fs.mkdirSync(lib, { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'data'), path.join(tmp, 'data'), 'dir');
  for (const name of MODULES) {
    const target = path.join(lib, name + '.js');
    if (ref) {
      let source;
      try {
        source = execFileSync('git', ['show', `${ref}:netlify/functions/lib/${name}.js`], { cwd: ROOT });
      } catch {
        fail(`${name}.js is not available at ${ref}.`);
      }
      fs.writeFileSync(target, source);
    } else {
      const from = path.join(dir, name + '.js');
      // rank-articles has never held prompt content, so the current file is used
      // when a baseline directory does not carry a copy of its own.
      if (!fs.existsSync(from) && name === 'rank-articles') {
        fs.copyFileSync(path.join(ROOT, 'netlify/functions/lib/rank-articles.js'), target);
        continue;
      }
      if (!fs.existsSync(from)) fail(`${from} is missing from the baseline directory.`);
      fs.copyFileSync(from, target);
    }
  }
  return { tmp, lib };
}

function firstDifference(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

function main() {
  const packFile = arg('--pack');
  const ref = arg('--ref');
  const baselineDir = arg('--baseline');
  const show = process.argv.includes('--show');
  if (!packFile) fail('pass --pack <file>.');
  if (!ref && !baselineDir) fail('pass --ref <git ref> or --baseline <dir>.');

  const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
  const promptPack = require(path.join(ROOT, 'netlify/functions/lib/prompt-pack'));
  const check = promptPack.validatePack(pack);
  if (!check.ok) fail('the pack is incomplete. Missing: ' + check.missing.join(', '));
  const handle = promptPack.packHandle(pack, 'parity', promptPack.hashPack(pack));

  const { validateRequest } = require(path.join(ROOT, 'netlify/functions/lib/validate'));
  const { allBriefs } = require(path.join(ROOT, 'tests/fixtures/prompt-briefs'));

  const current = {
    care_guide: require(path.join(ROOT, 'netlify/functions/lib/prompt-care-guide')).buildCareGuidePrompt,
    single_plant_gift: require(path.join(ROOT, 'netlify/functions/lib/prompt-single-plant-gift')).buildSinglePlantGiftPrompt,
    general_gift_guide: require(path.join(ROOT, 'netlify/functions/lib/prompt-general-gift-guide')).buildGeneralGiftGuidePrompt,
    occasion_gift_guide: require(path.join(ROOT, 'netlify/functions/lib/prompt-occasion-gift-guide')).buildOccasionGiftGuidePrompt
  };
  const currentMeta = require(path.join(ROOT, 'netlify/functions/lib/prompt-metadata-related')).buildMetadataAndRelatedPrompt;

  const { tmp, lib } = stageBaseline(ref, baselineDir);
  let baseline, baselineMeta;
  try {
    baseline = {
      care_guide: require(path.join(lib, 'prompt-care-guide')).buildCareGuidePrompt,
      single_plant_gift: require(path.join(lib, 'prompt-single-plant-gift')).buildSinglePlantGiftPrompt,
      general_gift_guide: require(path.join(lib, 'prompt-general-gift-guide')).buildGeneralGiftGuidePrompt,
      occasion_gift_guide: require(path.join(lib, 'prompt-occasion-gift-guide')).buildOccasionGiftGuidePrompt
    };
    baselineMeta = require(path.join(lib, 'prompt-metadata-related')).buildMetadataAndRelatedPrompt;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  let compared = 0;
  let mismatches = 0;
  const briefs = allBriefs();
  briefs.forEach((brief, index) => {
    const { articleType, fields } = validateRequest(brief.articleType, brief.fields);
    const pairs = [
      ['article', baseline[articleType](fields), current[articleType](fields, handle)],
      ['metadata', baselineMeta(articleType, fields), currentMeta(articleType, fields, handle)]
    ];
    for (const [kind, expected, actual] of pairs) {
      compared += 1;
      if (expected === actual) continue;
      mismatches += 1;
      const at = firstDifference(expected, actual);
      console.log(`MISMATCH ${articleType} ${kind} brief #${index} at offset ${at} (expected ${expected.length} chars, got ${actual.length})`);
      if (show) {
        console.log('  expected: ' + JSON.stringify(expected.slice(Math.max(0, at - 40), at + 40)));
        console.log('  actual:   ' + JSON.stringify(actual.slice(Math.max(0, at - 40), at + 40)));
      }
    }
  });

  console.log(`\n${compared} prompts compared across ${briefs.length} briefs, ${mismatches} mismatches.`);
  console.log(`pack hash ${promptPack.hashPack(pack)}`);
  if (mismatches) process.exitCode = 1;
}

main();
