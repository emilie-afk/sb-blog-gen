// Single-Plant Gift Guide prompt. One plant, framed as a gift.
//
// The template and its wording live in the private prompt pack. This file builds
// the brief from validated fields and fills the template.
const {
  buildSharedStyleRules, buildPlantAccuracyRules, buildGiftVoiceRules,
  buildEvidenceRules, buildStorefrontDescriptionRules, formatReferences, updatedTag, ctaButton, additional, keywordLine
} = require('./shared-rules');

function buildSinglePlantGiftPrompt(fields, pack) {
  const plant = fields.plantName;
  const sci = fields.sciName ? ` (${fields.sciName})` : '';
  const angle = fields.giftAngle === 'Custom angle' ? (fields.customGiftAngle || '') : fields.giftAngle;
  const cta = ctaButton(fields.productUrl, `Shop ${plant}`);

  const brief = [
    pack.render('singlePlantGift.brief.plant', { plant, sci }),
    fields.recipient ? pack.render('singlePlantGift.brief.recipient', { recipient: fields.recipient }) : '',
    fields.occasion ? pack.render('singlePlantGift.brief.occasion', { occasion: fields.occasion }) : '',
    pack.render('singlePlantGift.brief.angle', { angle }),
    fields.careConsiderations ? pack.render('singlePlantGift.brief.care', { care: fields.careConsiderations }) : '',
    fields.productNotes ? pack.render('singlePlantGift.brief.productNotes', { notes: fields.productNotes }) : '',
    fields.productUrl ? pack.render('singlePlantGift.brief.productUrl', { url: fields.productUrl }) : ''
  ].filter(Boolean).join('\n');

  return pack.render('singlePlantGift.document', {
    plant,
    sci,
    brief,
    updatedTag: updatedTag(),
    introLink: fields.productUrl
      ? pack.render('singlePlantGift.introLink', { plant, url: fields.productUrl })
      : '',
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

module.exports = { buildSinglePlantGiftPrompt };
