// Shared prompt fragments used by every article format.
//
// The wording of every fragment lives in the private prompt pack (see
// prompt-pack.js), not here. What stays in this file is the part that is not
// confidential and that the application depends on being correct: which
// fragment a format asks for, the values filled into it, the HTML colours the
// output validator checks, and how user-supplied references and confirmed
// products are laid out for the model.
//
// Every builder takes the pack handle as its first argument. A builder never
// loads a pack itself, so one generation cannot mix fragments from two
// versions.

const HEADING_COLOR = '#34bfa2';
const BRAND_GREEN = '#3a6b35';

// The comparison-table cell styles are presentation, not instructions, so they
// stay in source and are handed to the template.
const TABLE_TH = 'style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;text-align:left;"';
const TABLE_TD = 'style="border:1px solid #dde;padding:8px 12px;"';

function buildSharedStyleRules(pack, options) {
  const gift = !!(options && options.gift);
  // Gift formats state word repetition and per-recommendation variety in the
  // voice rules, so the standard lines are left out there rather than repeated.
  return pack.render('shared.styleRules.body', {
    voiceLines: gift ? '' : pack.get('shared.styleRules.voiceLines'),
    headingColor: HEADING_COLOR
  });
}

function buildPlantAccuracyRules(pack, options) {
  const withEvidence = !!(options && options.withEvidence);
  // Gift formats state the pet safety, neglect and recovery rules once, in the
  // evidence rules, so they are not repeated here.
  return pack.render('shared.plantAccuracy.body', {
    overlap: withEvidence ? '' : pack.get('shared.plantAccuracy.overlap')
  });
}

// The recipient and relationship from the brief frame the article. They are
// rebuilt by validate.js field by field before they get here.
function buildGiftVoiceRules(pack, fields) {
  const recipient = (fields && fields.recipient) || '';
  const relationship = (fields && fields.relationship) || '';
  const contextLine = recipient || relationship
    ? pack.render('shared.giftVoice.contextWithBrief', {
        framing: [recipient, relationship].filter(Boolean).join(', ')
      })
    : pack.get('shared.giftVoice.contextWithoutBrief');
  return pack.render('shared.giftVoice.body', { contextLine });
}

function buildEvidenceRules(pack) {
  return pack.get('shared.evidenceRules');
}

// Written as a literal skeleton because a table described in prose came back
// with merged headers. repair-output.js knows these header labels.
function comparisonTableSkeleton(pack, includePrice) {
  return pack.render('shared.comparisonTable.body', {
    th: TABLE_TH,
    td: TABLE_TD,
    priceHeader: includePrice ? pack.render('shared.comparisonTable.priceHeader', { th: TABLE_TH }) : '',
    priceCell: includePrice ? pack.render('shared.comparisonTable.priceCell', { td: TABLE_TD }) : ''
  });
}

// A reference is used only when both halves were supplied; validate.js already
// rejects a half-filled pair, so this filter is a second line, not the first.
function formatReferences(pack, references) {
  const lines = (references || [])
    .filter(r => r && r.url && r.text)
    .map((r, i) => pack.render('shared.references.line', { index: i + 1, text: r.text, url: r.url }));
  if (!lines.length) return '';
  return pack.render('shared.references.block', { lines: lines.join('\n') });
}

// Only these keys ever reach a prompt, and each one arrives from validate.js,
// which rebuilds it field by field: nothing the browser sent is passed through.
// The storefront description and tags are untrusted storefront copy. They are
// labelled as such by the pack, and HTML has already been stripped from them.
function formatProductsForPrompt(pack, products) {
  return (products || []).map((p, i) => {
    const parts = [
      pack.render('shared.productEntry.title', { index: i + 1, title: p.title }),
      pack.render('shared.productEntry.url', { url: p.url })
    ];
    if (p.price) parts.push(pack.render('shared.productEntry.price', { price: p.price }));
    if (p.productType) parts.push(pack.render('shared.productEntry.productType', { productType: p.productType }));
    if (p.description) parts.push(pack.render('shared.productEntry.description', { description: p.description }));
    if (p.tags && p.tags.length) parts.push(pack.render('shared.productEntry.tags', { tags: p.tags.join(', ') }));
    if (p.notes) parts.push(pack.render('shared.productEntry.notes', { notes: p.notes }));
    else parts.push(pack.get('shared.productEntry.noNotes'));
    return parts.join('\n');
  }).join('\n');
}

function buildStorefrontDescriptionRules(pack) {
  return pack.get('shared.storefrontDescriptionRules');
}

// Presentation only: the dateline and the shop button are HTML the article
// carries, not instructions, so they stay in source.
function updatedTag() {
  const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  return `<p style="font-size:12px;color:#888;font-style:italic;">Updated ${month}</p>`;
}

function ctaButton(url, label) {
  if (!url) return '';
  return `<p style="text-align:center;margin:16px 0;"><a href="${url}" style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-weight:700;font-size:15px;">${label}</a></p>`;
}

function additional(pack, fields) {
  return fields.additionalInstructions
    ? pack.render('shared.additionalInstructions', { instructions: fields.additionalInstructions })
    : '';
}

function keywordLine(pack, fields) {
  return fields.primaryKeyword
    ? pack.render('shared.keywordLine', { keyword: fields.primaryKeyword })
    : '';
}

module.exports = {
  HEADING_COLOR,
  BRAND_GREEN,
  TABLE_TH,
  TABLE_TD,
  buildSharedStyleRules,
  buildPlantAccuracyRules,
  buildGiftVoiceRules,
  buildEvidenceRules,
  buildStorefrontDescriptionRules,
  comparisonTableSkeleton,
  formatReferences,
  formatProductsForPrompt,
  updatedTag,
  ctaButton,
  additional,
  keywordLine
};
