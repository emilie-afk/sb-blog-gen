// General Gift Guide prompt. Recipient, lifestyle or feature based list article.
//
// The template and its wording live in the private prompt pack. This file
// decides which confirmed products appear, in what order and how many, builds
// the brief, and fills the template.
const {
  buildSharedStyleRules, buildPlantAccuracyRules, buildGiftVoiceRules,
  buildEvidenceRules, buildStorefrontDescriptionRules, comparisonTableSkeleton, formatReferences, formatProductsForPrompt,
  updatedTag, ctaButton, additional, keywordLine, HEADING_COLOR
} = require('./shared-rules');

function buildGeneralGiftGuidePrompt(fields, pack) {
  const products = fields.selectedProducts || [];
  const count = Math.min(fields.numberOfRecommendations || products.length, products.length);
  const shown = products.slice(0, count);
  const chars = (fields.giftCharacteristics || []).slice();
  if (fields.customCharacteristic) chars.push(fields.customCharacteristic);
  const cta = ctaButton(fields.collectionUrl, 'Shop plant gifts');

  const brief = [
    fields.recipient
      ? pack.render('generalGiftGuide.brief.recipient', { recipient: fields.recipient })
      : pack.get('generalGiftGuide.brief.noRecipient'),
    pack.render('generalGiftGuide.brief.count', { count }),
    fields.budgetRange ? pack.render('generalGiftGuide.brief.budget', { budget: fields.budgetRange }) : '',
    chars.length ? pack.render('generalGiftGuide.brief.characteristics', { characteristics: chars.join(', ') }) : ''
  ].filter(Boolean).join('\n');

  return pack.render('generalGiftGuide.document', {
    brief,
    products: formatProductsForPrompt(pack, shown),
    count,
    updatedTag: updatedTag(),
    headingColor: HEADING_COLOR,
    comparisonTable: comparisonTableSkeleton(pack, shown.some(p => p.price)),
    cta,
    refsNote: formatReferences(pack, fields.references),
    keywordLine: keywordLine(pack, fields),
    additional: additional(pack, fields),
    giftVoice: buildGiftVoiceRules(pack, fields),
    styleRules: buildSharedStyleRules(pack, { gift: true }),
    plantAccuracy: buildPlantAccuracyRules(pack, { withEvidence: true }),
    evidenceRules: buildEvidenceRules(pack),
    storefrontRules: buildStorefrontDescriptionRules(pack)
  });
}

module.exports = { buildGeneralGiftGuidePrompt };
