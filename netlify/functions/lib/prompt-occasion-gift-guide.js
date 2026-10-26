// Occasion Gift Guide prompt. Built around a specific holiday, observance or
// milestone. There is no tone selector: the occasion, recipient, relationship and
// the sensitive-occasion flag set the emotional register.
//
// The template and its wording, including the sensitive-occasion rules, live in
// the private prompt pack. This file decides which confirmed products appear,
// whether a date was supplied, whether sensitive mode is on, and whether the
// close may carry a button, and fills the template.
const {
  buildSharedStyleRules, buildPlantAccuracyRules, buildGiftVoiceRules,
  buildEvidenceRules, buildStorefrontDescriptionRules, comparisonTableSkeleton, formatReferences, formatProductsForPrompt,
  updatedTag, ctaButton, additional, keywordLine, HEADING_COLOR
} = require('./shared-rules');

function buildOccasionGiftGuidePrompt(fields, pack) {
  const products = fields.selectedProducts || [];
  const count = Math.min(fields.numberOfRecommendations || products.length, products.length);
  const shown = products.slice(0, count);
  const chars = (fields.giftCharacteristics || []).slice();
  if (fields.customCharacteristic) chars.push(fields.customCharacteristic);
  const sensitive = !!fields.sensitiveOccasion;
  // A sensitive occasion never gets a button. At most it gets a soft text link.
  const cta = sensitive ? '' : ctaButton(fields.collectionUrl, 'Shop the collection');
  const closing = cta || (fields.collectionUrl && sensitive
    ? pack.render('occasionGiftGuide.sensitiveSoftLink', { url: fields.collectionUrl })
    : '');

  const dateRule = fields.occasionDate
    ? pack.render('occasionGiftGuide.dateSupplied', { date: fields.occasionDate })
    : pack.get('occasionGiftGuide.dateMissing');

  const brief = [
    pack.render('occasionGiftGuide.brief.occasion', { occasion: fields.occasion }),
    fields.occasionYear ? pack.render('occasionGiftGuide.brief.year', { year: fields.occasionYear }) : '',
    fields.recipient ? pack.render('occasionGiftGuide.brief.recipient', { recipient: fields.recipient }) : '',
    fields.relationship ? pack.render('occasionGiftGuide.brief.relationship', { relationship: fields.relationship }) : '',
    pack.render('occasionGiftGuide.brief.count', { count }),
    fields.budgetRange ? pack.render('occasionGiftGuide.brief.budget', { budget: fields.budgetRange }) : '',
    chars.length ? pack.render('occasionGiftGuide.brief.characteristics', { characteristics: chars.join(', ') }) : ''
  ].filter(Boolean).join('\n');

  return pack.render('occasionGiftGuide.document', {
    brief,
    dateRule,
    products: formatProductsForPrompt(pack, shown),
    count,
    sensitiveBlock: sensitive ? pack.get('occasionGiftGuide.sensitiveBlock') : '',
    updatedTag: updatedTag(),
    headingColor: HEADING_COLOR,
    comparisonTable: comparisonTableSkeleton(pack, shown.some(p => p.price)),
    closing,
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

module.exports = { buildOccasionGiftGuidePrompt };
