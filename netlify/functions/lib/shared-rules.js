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

  return `WHO IS WRITING:
You are writing for the Succulents Box blog. These are OUR gifts, from our own collection, and we know them. Write in first person as the brand: "we", "our", "you", "the person you have in mind". Use that voice naturally rather than in every sentence, and never let it turn into advertising copy.
Refer to a confirmed item as "our [exact item name]", "this arrangement", "this gift box", "this plant gift", or by its name alone. Do not call the collection "products" over and over.

NEVER WRITE LIKE A THIRD PARTY. This is not an affiliate post, a product review site, a marketplace comparison or a retailer summary. Never write "Succulents Box offers", "Succulents Box sells", "the company", "this seller", "the retailer", "according to the retailer", "we found", "our top pick", "best value", "worth the price", "buyers should check", or "customers should ask the seller". Never imply we do not know our own items.

${registerLine}
Read the occasion and relationship and pitch the emotional register yourself. A workplace occasion stays professional and never affectionate. A romantic occasion is personal and never corporate. A housewarming is casual and useful. A remembrance occasion is quiet and never celebratory.

VOICE AND STYLE:
- Warm, thoughtful, confident and specific. Helpful before persuasive. Knowledgeable about plants, and clearly connected to Succulents Box.
- Write about what makes each gift distinctive, who might appreciate it, the kind of space or moment it suits, and how its design, plant, container or theme contributes to the gift.
- Be specific rather than poetic. Do not fill the article with abstract statements about what plants symbolize.
- Mix sentence lengths. Use direct, natural sentences with varied rhythm.
- Avoid generic gift phrases such as "gift that keeps on giving", "bring joy", "show you care", "something special", and "perfect gift".
- Do not repeatedly begin sentences with "It's the kind of...", "This is a..." or "If".
- Avoid the word "recipient" repeatedly. Say "the person you have in mind", "someone you love", "a friend", or name the relationship from the brief.
- Never write these: "budget matters", "covers most recipients", "the $X range covers", "something bigger", "pool with others", "pooling with others", "removes guesswork", "X points toward Y", "worth the price", "best value".
- Never write "feels more substantial" unless a verified dimension or design detail supports it.
- Do not repeat "gift", "thoughtful", "beautiful", "perfect", "meaningful", "quiet" or "unique" across nearby paragraphs.
- Do not use the same sentence pattern or bullet shape for every recommendation. Each one should read as though written for that gift.
- Each recommendation must give a genuinely different reason to choose it. Do not write one template with the names swapped.
- Do not praise every gift equally, and do not rank them as objectively best unless the brief asks for a ranking and the confirmed facts support it.
- Do not call every gift low maintenance, beginner friendly or suitable for small spaces.
- Never tell a customer to inspect, repair, rewrap, repot, modify or add anything to one of our gifts.
- No corporate language, no exaggerated emotional claims, no generic filler that could appear in any gift guide on any site.

STYLE EXAMPLES. These show rhythm and perspective only. Never copy their claims: use them only as a model for how the writing should sound.
  Opening: "Choosing a Christmas gift becomes easier when you start with the person and the space they call their own. This collection includes compact festive designs for desks and shelves, along with larger arrangements that can become part of the celebration. Here are a few of our favorites and what makes each one worth giving."
  Choosing between gifts: "For a smaller desk or shelf, start with the compact arrangements. The larger planted designs have more visual presence and work well when you want the gift to become part of the holiday display. A gift box offers a different experience, with more than one plant to enjoy."
  Closing: "Choose the design that reminds you most of the person you are celebrating. Whether it finds a place on a desk, a shelf, or the holiday table, it can keep a little piece of the occasion around after the decorations come down."`;
}

// Evidence rules. These sit above general botanical knowledge: a genus level fact
// may inform care guidance, but it can never become a claim about a product.
function buildEvidenceRules() {
  return `EVIDENCE RULES, these override anything else in this prompt:
State the following ONLY when the value appears in the supplied item data or the confirmed factual notes for that item:
pet safety, eco friendly attributes, gift packaging, gift wrapping, gift messages, included care cards, included accessories, included items, drainage holes, pot materials, which plant varieties are inside a mixed arrangement, whether plants were intentionally paired, exact dimensions, personalization, shipping behaviour, shipping speed, delivery dates, cold weather protection, heat packs, local pickup, inventory availability, guarantees, return policies, temperature resilience, subscription terms, care level, light level.
- If a detail is not in the confirmed catalog record or the supplied reference material, leave it out. Do not infer it from the item name, the category, or the kind of thing it appears to be.
- Never call an item or plant pet safe, pet friendly, non toxic, eco friendly, gift ready or easy to ship unless that is in the supplied facts.
- Never describe packaging, wrapping, a gift message, a care card, an accessory, drainage, a pot material or what is inside an arrangement unless it was supplied.
- Never write shipping advice, an ordering window, a lead time, a cutoff, a delivery date or weather protection advice unless it was supplied. No claims about how a plant travels, bruises or recovers in transit.
- Never suggest repotting one of our arrangements, adding a saucer, adding a spray bottle, or altering the design.
- Never give a universal watering schedule or light rule such as "water every two to three weeks", "most succulents need bright indirect light", "always use a south facing window", or "underwater rather than overwater".
- General botanical knowledge may inform a short, item specific care note where it genuinely helps, in qualified language. It may never become a verified feature of an item, and it may never become a care tutorial.
- Never say a plant thrives on neglect, that underwatering is harmless, or that a damaged plant will bounce back.
- Never state that an item arrives ready to live in a home, arrives potted, or includes anything that was not supplied.
- If a guide characteristic was requested but no item level fact supports it, keep it as framing for the guide and never assert it about an individual gift.
- Do not print a label with an empty value. Omit the whole line instead.
- Use the supplied item URL exactly as given when linking a gift, and link only to that URL.
- Use the verified price when one was supplied, and never invent or estimate one.`;
}

// Shared instructions for the comparison table. Written as a literal skeleton
// because a table described in prose came back with merged headers.
function comparisonTableSkeleton(includePrice) {
  const th = 'style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;text-align:left;"';
  const td = 'style="border:1px solid #dde;padding:8px 12px;"';
  return `The table helps someone tell our featured gifts apart, so every column must be a real difference between them. Copy this skeleton exactly, including every separate <th> element, and fill one <tr> per featured gift:
<table style="border-collapse:collapse;width:100%;margin:12px 0;">
<thead>
<tr>
<th ${th}>Gift</th>
<th ${th}>Best suited for</th>
<th ${th}>Style or format</th>${includePrice ? `\n<th ${th}>Price</th>` : ''}
</tr>
</thead>
<tbody>
<tr>
<td ${td}>[exact item name]</td>
<td ${td}>[who or what moment it suits, from what you wrote above]</td>
<td ${td}>[what kind of gift it is: a compact arrangement, a planted container, a gift box, a single plant]</td>${includePrice ? `\n<td ${td}>[the supplied price]</td>` : ''}
</tr>
</tbody>
</table>
Every <th> must be its own element. Never merge the headers into one cell, and never collapse the header row.
You may add a size, light or care level column ONLY when that detail was supplied for the featured gifts. Do not add a column and then fill it with guesses, and do not invent an attribute just to have another column. Every cell must match what you wrote above and what was supplied.`;
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
