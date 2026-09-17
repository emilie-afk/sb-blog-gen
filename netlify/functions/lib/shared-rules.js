// Shared prompt fragments used by every article format.
// Keep brand voice, HTML output rules and accuracy guardrails in one place so the
// four format builders stay small and stay consistent with each other.

const HEADING_COLOR = '#34bfa2';
const BRAND_GREEN = '#3a6b35';

function buildSharedStyleRules(options) {
  const gift = !!(options && options.gift);
  // For gift formats the voice rules already cover word repetition and
  // per-recommendation variety, so those lines are dropped here rather than
  // stated twice. No guardrail is lost, only the duplicate wording.
  const voiceLines = gift ? '' : `- Do not lean on the words "perfect", "thoughtful", "unique" and "meaningful". Use each at most once in the whole article.
- Do not repeat the same selling point across every recommendation.
`;
  return `WRITING RULES (apply to every section):
- Warm, helpful and conversational, like a plant loving friend giving advice.
- Written for real shoppers and plant recipients, useful before and after the purchase.
- Short, scannable paragraphs. Natural contractions are fine (it's, you'll, don't).
- Avoid corporate or clinical language.
${voiceLines}- Never use em dashes or en dashes. Use commas, periods, colons or parentheses instead.
- Do not make unsupported "best", "ultimate", "number one" or industry leading claims.
- Weave links naturally into sentences. Never write "For more information, check out...", "Learn more in our guide", "Check out our resource" or anything similar.
  BAD: "For more guidance on pruning, learn about How and When to Prune your plants."
  GOOD: "It's worth removing any leggy growth now and then, and here's how and when to prune your succulents."

HTML OUTPUT RULES:
- Return ONLY raw HTML for the article body. No markdown, no code fences, no commentary, no explanation.
- Do not include an <h1>. The title is handled separately.
- Every h2 and h3 must carry style="color:${HEADING_COLOR}" inline.
- Use only valid, Shopify friendly HTML: h2, h3, p, ul, ol, li, table, tr, th, td, a, strong, em, div, img, br.
- Do not include placeholders, TODOs or bracketed instructions in the output.
- Do not mention being an AI and do not explain the prompt.
- Write every section listed above and finish the article. Keep each section tight rather than spending the length on any one of them.`;
}

function buildPlantAccuracyRules(options) {
  const withEvidence = !!(options && options.withEvidence);
  // Pet safety, neglect and recovery claims are stated once in the evidence
  // rules for the gift formats, so they are not repeated here.
  const overlap = withEvidence ? '' : `- Never call a plant pet safe unless that has been confirmed in the supplied facts.
- Never say a plant thrives on neglect, or that missing water is harmless.
- Never promise that a plant recovers from damage, shipping stress or underwatering.
`;
  return `PLANT ACCURACY RULES:
- Never describe a plant as impossible to kill or "hard to kill". Say resilient or forgiving instead.
- Low maintenance is not the same as no maintenance. Be clear about what the plant still needs.
- Include toxicity cautions when they are relevant and known.
${overlap}- Do not invent symbolic or cultural meanings. If symbolism is uncertain, leave it out.
- No medical, therapeutic or emotional healing claims.`;
}

// The editorial voice for all gift formats. The occasion and relationship change
// the emotional register, never this voice. There is no tone selector.
function buildGiftVoiceRules(fields) {
  const recipient = (fields && fields.recipient) || '';
  const relationship = (fields && fields.relationship) || '';
  const registerLine = recipient || relationship
    ? `The reader is choosing a gift for: ${[recipient, relationship].filter(Boolean).join(', ')}. Let that set the emotional register, and keep it appropriate to that relationship.`
    : `No recipient was specified. Write for a general reader and do not assume a relationship.`;

  return `EDITORIAL VOICE:
Warm, practical and knowledgeable. Written by an experienced plant gifting specialist. Helpful before persuasive. Specific rather than poetic. Honest about who each gift suits and what care it requires.
${registerLine}
Read the occasion and relationship and pitch the emotional register yourself. A workplace occasion stays professional and never affectionate. A romantic occasion is personal and never corporate. A housewarming is casual and useful. A remembrance occasion is quiet and never celebratory.

VOICE AND STYLE:
- Write like an experienced plant gifting specialist helping someone choose well.
- Be warm but practical. Useful information comes before sentiment.
- Be specific rather than poetic.
- Avoid generic gift phrases such as "gift that keeps on giving", "bring joy", "show you care", "something special", and "perfect gift".
- Do not repeatedly begin sentences with "It's the kind of..." or "This is a...".
- Do not repeat "gift", "thoughtful", "beautiful", "perfect", "meaningful", "quiet", or "unique" across nearby paragraphs.
- Avoid using polished three part sentences in every paragraph.
- Mix sentence lengths naturally.
- Do not assume the recipient is a family member unless the brief says so.
- Explain why someone should choose one recommendation over another.
- Use direct selection language when useful: "Choose this if...", "This suits...", "Skip this if...", and "Consider another option if...".
- Each product recommendation must emphasize a different reason to choose it.
- Limit emotional or symbolic framing to the introduction.
- Keep individual product sections concrete.
- Do not praise every product equally. Give the reader real distinctions.
- Do not call every product low maintenance, beginner friendly or suitable for small spaces.
The article should read like "here is what we would consider before sending this plant or gift box to someone", not like "plants are beautiful symbols of growth and joy".`;
}

// Evidence rules. These sit above general botanical knowledge: a genus level fact
// may inform care guidance, but it can never become a claim about a product.
function buildEvidenceRules() {
  return `EVIDENCE RULES, these override anything else in this prompt:
State the following ONLY when the value appears in the supplied product data or the confirmed factual notes for that product:
pet safety, eco friendly attributes, gift packaging, included items, personalization, shipping behaviour, delivery expectations, temperature resilience, product dimensions, materials, subscription terms, guarantees, care level, light level.
- General botanical knowledge may inform basic care guidance, but use qualified language ("most succulents prefer", "as a rule") and never present a genus level fact as a verified feature of a product.
- Never call a product or plant pet safe, pet friendly, non toxic, eco friendly, gift ready or easy to ship unless that is in the supplied facts.
- Never write shipping advice specific to a product unless it was supplied. No claims about how a plant travels, bruises, or recovers in transit.
- Never invent a recommended ordering window, lead time, cutoff or delivery date.
- Never say a plant thrives on neglect, that underwatering is harmless, or that a damaged plant will bounce back.
- Never state that a product arrives ready to live in a home, arrives potted, or includes anything that was not supplied.
- If a product has no confirmed care or light data, omit the "Care level" and "Light" lines for that product, or write a clearly general statement such as "Most succulents want bright light" outside the product specific facts.
- If a guide characteristic was requested but no product level fact supports it, keep it as framing for the guide and never assert it about an individual product.
- Do not print a label with an empty value. Omit the whole line instead.
- Use the supplied product URL exactly as given when linking a product.`;
}

// Shared instructions for the comparison table. Written as a literal skeleton
// because a table described in prose came back with merged headers.
function comparisonTableSkeleton(includePrice) {
  const th = 'style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;text-align:left;"';
  const td = 'style="border:1px solid #dde;padding:8px 12px;"';
  return `Copy this table skeleton exactly, including every separate <th> element, and fill one <tr> per recommendation:
<table style="border-collapse:collapse;width:100%;margin:12px 0;">
<thead>
<tr>
<th ${th}>Gift</th>
<th ${th}>Best for</th>
<th ${th}>Light</th>
<th ${th}>Care level</th>${includePrice ? `\n<th ${th}>Price</th>` : ''}
</tr>
</thead>
<tbody>
<tr>
<td ${td}>[product title]</td>
<td ${td}>[best for]</td>
<td ${td}>[light, or "Varies" when not known]</td>
<td ${td}>[care level, or "Varies" when not known]</td>${includePrice ? `\n<td ${td}>[price, or "See product page" when no price was supplied]</td>` : ''}
</tr>
</tbody>
</table>
Every <th> must be its own element. Never merge the headers into one cell. Every row must match what you wrote above and what was supplied. Write "Varies" rather than inventing a value.`;
}

function buildProductAccuracyRules() {
  return `PRODUCT ACCURACY RULES:
- Write about the supplied products only. Never add, invent or substitute a product.
- Never invent price, availability, stock status, shipping time, delivery date, dimensions, gift packaging, personalization options, subscription terms, guarantee details, pet safety, eco friendly attributes, materials or promotional offers.
- Use those details only when they appear in the supplied product data or the factual notes.
- Do not infer "pet friendly", "eco conscious", "gift ready" or "easy to ship" from a product title.
- If a guide characteristic was requested but no product level fact supports it, keep the language general for the guide as a whole and do not state it as a fact about an individual product.
- Do not print empty labels. If a detail was not supplied, simply omit that line.
- Use the supplied product URL exactly as given when linking a product.`;
}

function formatReferences(references) {
  const lines = (references || [])
    .filter(r => r && r.url && r.text)
    .map((r, i) => `Reference ${i + 1}, link text: "${r.text}" → URL: ${r.url}`);
  if (!lines.length) return '';
  return `\nREFERENCE LINKS, weave each one naturally into the most relevant sentence:\n${lines.join('\n')}\n`;
}

// Only these keys ever reach a prompt. Storefront marketing copy (description,
// tags) is deliberately left out: it is not verified product fact.
function formatProductsForPrompt(products) {
  return (products || []).map((p, i) => {
    const parts = [`${i + 1}. Title: ${p.title}`, `   URL: ${p.url}`];
    if (p.price) parts.push(`   Price: ${p.price}`);
    if (p.productType) parts.push(`   Product type: ${p.productType}`);
    if (p.notes) parts.push(`   Confirmed factual notes: ${p.notes}`);
    else parts.push(`   No factual notes supplied. Do not state pet safety, packaging, contents, shipping, materials or care level for this product.`);
    return parts.join('\n');
  }).join('\n');
}

function updatedTag() {
  const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  return `<p style="font-size:12px;color:#888;font-style:italic;">Updated ${month}</p>`;
}

function ctaButton(url, label) {
  if (!url) return '';
  return `<p style="text-align:center;margin:16px 0;"><a href="${url}" style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-weight:700;font-size:15px;">${label}</a></p>`;
}

function additional(fields) {
  return fields.additionalInstructions
    ? `\nADDITIONAL INSTRUCTIONS FROM THE CONTENT TEAM (follow these unless they conflict with the accuracy rules):\n${fields.additionalInstructions}\n`
    : '';
}

function keywordLine(fields) {
  return fields.primaryKeyword
    ? `\nPRIMARY SEO KEYWORD: "${fields.primaryKeyword}". Use it in the first paragraph and a couple of times more where it reads naturally. Never keyword stuff.\n`
    : '';
}

module.exports = {
  HEADING_COLOR,
  BRAND_GREEN,
  buildSharedStyleRules,
  buildPlantAccuracyRules,
  buildProductAccuracyRules,
  buildGiftVoiceRules,
  buildEvidenceRules,
  comparisonTableSkeleton,
  formatReferences,
  formatProductsForPrompt,
  updatedTag,
  ctaButton,
  additional,
  keywordLine
};
