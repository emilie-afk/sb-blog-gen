#!/usr/bin/env node
// Builds tests/fixtures/synthetic-prompt-pack.json, the only prompt pack the
// committed test suites use.
//
// Every template in it is a marker naming the template, followed by the
// placeholders the application fills for that template, and nothing else:
//
//     "careGuide.sections.linked.watering": "⟨careGuide.sections.linked.watering⟩ {{h3}} {{overwateringLink}} ..."
//
// That is enough to test everything the repository is responsible for (which
// template a plant type or format selects, which internal links reach which
// guide, that every value is filled and nothing is left unfilled) while holding
// none of the editorial content, which is not in this repository.
//
// The placeholder list is discovered rather than written by hand: the builders
// are run over every synthetic brief with a recording pack, which notes each
// value name passed to each template. Run this after changing what a builder
// passes:
//
//     node tests/fixtures/make-synthetic-pack.js

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { REQUIRED_TEMPLATES } = require(path.join(ROOT, 'netlify/functions/lib/prompt-pack'));
const { validateRequest } = require(path.join(ROOT, 'netlify/functions/lib/validate'));
const { allBriefs } = require('./prompt-briefs');

function discover() {
  const seen = new Map(REQUIRED_TEMPLATES.map(k => [k, new Set()]));
  const recorder = {
    version: 'recorder',
    get(p) { if (!seen.has(p)) seen.set(p, new Set()); return `⟨${p}⟩`; },
    render(p, values) {
      if (!seen.has(p)) seen.set(p, new Set());
      for (const k of Object.keys(values || {})) seen.get(p).add(k);
      return `⟨${p}⟩` + Object.keys(values || {}).map(k => ` ${values[k]}`).join('');
    }
  };
  const builders = [
    ['care_guide', require(path.join(ROOT, 'netlify/functions/lib/prompt-care-guide')).buildCareGuidePrompt],
    ['single_plant_gift', require(path.join(ROOT, 'netlify/functions/lib/prompt-single-plant-gift')).buildSinglePlantGiftPrompt],
    ['general_gift_guide', require(path.join(ROOT, 'netlify/functions/lib/prompt-general-gift-guide')).buildGeneralGiftGuidePrompt],
    ['occasion_gift_guide', require(path.join(ROOT, 'netlify/functions/lib/prompt-occasion-gift-guide')).buildOccasionGiftGuidePrompt]
  ];
  const { buildMetadataAndRelatedPrompt } = require(path.join(ROOT, 'netlify/functions/lib/prompt-metadata-related'));
  for (const brief of allBriefs()) {
    const { articleType, fields } = validateRequest(brief.articleType, brief.fields);
    builders.find(b => b[0] === articleType)[1](fields, recorder);
    buildMetadataAndRelatedPrompt(articleType, fields, recorder);
  }
  return seen;
}

function build() {
  const seen = discover();
  const pack = { meta: { format: 'sb-prompt-pack', schema: 1, synthetic: true } };
  for (const key of [...seen.keys()].sort()) {
    const names = [...seen.get(key)].sort();
    const value = `⟨${key}⟩` + names.map(n => ` {{${n}}}`).join('');
    let node = pack;
    const parts = key.split('.');
    parts.slice(0, -1).forEach(p => { node[p] = node[p] || {}; node = node[p]; });
    node[parts[parts.length - 1]] = value;
  }
  return pack;
}

if (require.main === module) {
  const out = path.join(__dirname, 'synthetic-prompt-pack.json');
  fs.writeFileSync(out, JSON.stringify(build(), null, 2) + '\n');
  console.log('wrote', path.relative(ROOT, out));
}

module.exports = { build };
