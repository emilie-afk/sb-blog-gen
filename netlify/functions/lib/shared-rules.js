// Shared prompt fragments used by every article format.
// Keep brand voice, HTML output rules and accuracy guardrails in one place so the
// four format builders stay small and stay consistent with each other.

const HEADING_COLOR = '#34bfa2';
const BRAND_GREEN = '#3a6b35';

function buildSharedStyleRules() {
  return `WRITING RULES (apply to every section):
- Warm, helpful and conversational, like a plant loving friend giving advice.
- Written for real shoppers and plant recipients, useful before and after the purchase.
- Short, scannable paragraphs. Natural contractions are fine (it's, you'll, don't).
- Avoid corporate or clinical language.
- Do not lean on the words "perfect", "thoughtful", "unique" and "meaningful". Use each at most once in the whole article.
- Never use em dashes or en dashes. Use commas, periods, colons or parentheses instead.
- Do not make unsupported "best", "ultimate", "number one" or industry leading claims.
- Do not repeat the same selling point across every recommendation.
- Weave links naturally into sentences. Never write "For more information, check out...", "Learn more in our guide", "Check out our resource" or anything similar.
  BAD: "For more guidance on pruning, learn about How and When to Prune your plants."
  GOOD: "It's worth removing any leggy growth now and then, and here's how and when to prune your succulents."

HTML OUTPUT RULES:
- Return ONLY raw HTML for the article body. No markdown, no code fences, no commentary, no explanation.
- Do not include an <h1>. The title is handled separately.
- Every h2 and h3 must carry style="color:${HEADING_COLOR}" inline.
- Use only valid, Shopify friendly HTML: h2, h3, p, ul, ol, li, table, tr, th, td, a, strong, em, div, img, br.
- Do not include placeholders, TODOs or bracketed instructions in the output.
- Do not mention being an AI and do not explain the prompt.`;
}

function buildPlantAccuracyRules() {
  return `PLANT ACCURACY RULES:
- Never describe a plant as impossible to kill or "hard to kill". Say resilient or forgiving instead.
- Low maintenance is not the same as no maintenance. Be clear about what the plant still needs.
- Never call a plant pet safe unless that has been confirmed in the supplied facts. Include toxicity cautions when they are relevant and known.
- Do not invent symbolic or cultural meanings. If symbolism is uncertain, leave it out.
- No medical, therapeutic or emotional healing claims.`;
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
    .map((r, i) => `Reference ${i + 1} — link text: "${r.text}" → URL: ${r.url}`);
  if (!lines.length) return '';
  return `\nREFERENCE LINKS, weave each one naturally into the most relevant sentence:\n${lines.join('\n')}\n`;
}

function formatProductsForPrompt(products) {
  return (products || []).map((p, i) => {
    const parts = [`${i + 1}. Title: ${p.title}`, `   URL: ${p.url}`];
    if (p.price) parts.push(`   Price: ${p.price}`);
    if (p.productType) parts.push(`   Product type: ${p.productType}`);
    if (p.notes) parts.push(`   Confirmed factual notes: ${p.notes}`);
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
  formatReferences,
  formatProductsForPrompt,
  updatedTag,
  ctaButton,
  additional,
  keywordLine
};
