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
Refer to a confirmed item as "our [exact item name]", "this arrangement", "this gift box", or by its name alone. Do not call the collection "products" over and over.

WHAT TO CALL THESE ITEMS. "Plant gift" is not the default noun and must not become the phrase you reach for. Prefer, in this order:
1. The exact item name as supplied.
2. What the item actually is: an arrangement, a gift box, a planted container, a terrarium, a set of two succulents, a single plant in a ceramic pot. Use the storefront description to know which.
3. Plain "gift".
4. "Living gift", occasionally, and never more than once in the article.
5. "Plant gift", last, and only where nothing above fits.

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

TREAT EACH ITEM AS ONE COMPLETE GIFT. This governs every arrangement, dish garden, gift box and gift set, and it overrides any instruction that would have you list what is inside.
- Write about the gift as a whole thing someone receives. Never dismantle it into its parts and discuss each part in turn.
- Do not walk an item like an inventory: plant, then pot, then moss, then dish, then candle, then card, then packaging, then accessories. That reads as a product page, not a recommendation.
- The official storefront description is evidence for understanding what the item is. It is NOT a checklist of details that must appear in the article, and it is not an outline for the paragraph.
- Each recommendation answers three questions: what the gift feels like as a whole, who or what moment it suits, and what basic care its plant needs.
- You may mention an included element when it materially explains the overall gift. Never review the elements separately, and never assign each one its own benefit.
- If the supplied data does not say much, write a short recommendation about what is known and stop. A brief accurate paragraph is better than a long vague one. Do not pad it out with atmosphere.
- Never claim the box is boxed, gift ready, ready to give, ready to ship, includes a gift message, a card, a care card, ribbon, tissue or any packaging detail unless that was supplied.
- Never describe an unboxing, an arrival, a reveal or a first impression.
- These phrases are banned outright, in any form, including as parts of longer sentences: "curated gift box", "carefully curated", "thoughtfully curated", "curated selection", "handpicked collection", "handpicked", "specially selected", "perfectly paired", "coordinated set", "the gift box is the gift itself", "this one carries that energy", "the meaning is built in", "removes guesswork". Do not use the word "curated" at all.
- Do not describe a set as designed, paired, matched or chosen to complement unless the supplied data says so. Items in a box are contents, not a stated design intent.

NO MANUFACTURING LANGUAGE. These words make a living gift sound like a manufactured object. Do not use them: "assembled", "constructed", "secured", "anchored", "built", "requires no setup", "comes complete", "individual components". Write instead in language that helps the reader picture the gift in the person's space.

CARE GUIDANCE INSIDE A RECOMMENDATION. The plant itself may be discussed separately from the gift, but only to give concise, useful care guidance, and only in one or two natural sentences inside that recommendation.
- Useful distinctions, when they apply to that item: air plants grow without soil; air plants still need bright light, airflow and regular misting or rinsing; succulents generally need watering less often than many houseplants; succulent soil should dry between waterings; succulents still need a bright spot; a plant may not suit a windowless office. Pet safety may be mentioned only when it was verified for that item.
- Never expand this into a care tutorial, and never write a standalone care section. See the section list for what must not exist.

WORKED EXAMPLES, showing the difference between taking a gift apart and describing it whole. Never copy their claims: they show the approach only.
  Do NOT write: "Three live Tillandsia air plants rise from preserved reindeer moss in a black glazed terracotta dish. The different shapes give the garden plenty to look at, while the low dish keeps the whole arrangement compact. It arrives assembled, so there is nothing for them to plant or arrange." That is a product description that takes the gift apart.
  Write instead: "The Air Plant Dish Garden has a playful, sculptural look that brings personality to a desk without feeling overly decorative. Its Tillandsia grow without soil, but they still need bright light and regular misting or rinsing."
  Do NOT write: "The purple and orange succulents contrast with the white planter and matching dish." That describes separate physical components.
  Write instead: "The Purple and Orange Succulent Arrangement has a warm, colorful look that can brighten a workspace. Like other succulent arrangements, it needs a bright spot and should dry between waterings."
  Do NOT write: "The box includes a succulent, candle, and notecard. The candle adds warmth, the card makes it personal, and the succulent lasts after the occasion." That dismantles the gift and gives each piece its own marketing benefit.
  Write instead: "This birthday box brings the celebration together in one cheerful presentation, with a live succulent and room for a handwritten message from you."

BANNED FILLER. Do not write vague AI filler, and do not pass judgement the facts cannot support:
- No sentences that would be equally true of any gift on any site. If a sentence would survive swapping in a different item name, rewrite it or cut it.
- No "in today's world", "at the end of the day", "when it comes to", "look no further", "whether you are ... or ...", "there is something for everyone", "speaks for itself", "sure to delight", "adds a touch of".
- Do not repeat the same observation in different words across sections.
- Accuracy beats symmetry. Recommendations do not need to be the same length, and an item with less supplied data gets a shorter entry rather than an invented one.

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

GUIDE CHARACTERISTICS ARE A REQUESTED ANGLE, NEVER A VERIFIED FACT. This rule is absolute and overrides every other instruction in this prompt.
- The characteristics in the brief (low maintenance, beginner friendly, pet friendly, low light, desk friendly, small space friendly, easy to ship, eco conscious, or any custom requirement) describe the angle the content team asked for. They are NOT facts about the confirmed items, and confirming an item for the guide does not verify any of them.
- Never state, imply, summarise or restate a requested characteristic as a property of an individual gift unless that specific item's supplied data states it.
- Never state it about the collection as a whole either. Do not write "every gift here is low light" or "all of these are pet friendly".
- The characteristic may shape what the article is about and what the reader is looking for. It may never become a claim.
- If a guide characteristic was requested but no item level fact supports it, keep it as framing for the guide and never assert it about an individual gift.

OFFICE, LIGHT AND CARE CLAIMS:
- Never write that an item is suited to an office, a desk, a cubicle, a windowless room, a dorm, a bathroom or any specific setting unless the supplied data says so.
- Never claim a plant tolerates low light, fluorescent light, artificial light or no direct sun unless the supplied data states that for that item.
- Low light, bright indirect light, no direct sun, fluorescent office light and "a room with a window" are different conditions. Never treat any of them as equivalent, and never substitute one for another.
- Never write that an item needs little water, little attention, little care or "almost no care" unless the supplied data states its care level.
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

// Only these keys ever reach a prompt, and each one arrives from validate.js,
// which rebuilds it field by field: nothing the browser sent is passed through.
//
// The storefront description is included because without it a gift box is just a
// name and a price, and the article can only describe it in vague language. It is
// labelled for what it is, so the model treats it as a source of concrete item
// details (what is inside, what form it takes) and not as evidence for the
// adjectives the shop page uses to sell it. Confirmed factual notes stay a
// separate, higher trust field: those were typed and vouched for by a person.
function formatProductsForPrompt(products) {
  return (products || []).map((p, i) => {
    const parts = [`${i + 1}. Title: ${p.title}`, `   URL: ${p.url}`];
    if (p.price) parts.push(`   Price: ${p.price}`);
    if (p.productType) parts.push(`   Product type: ${p.productType}`);
    if (p.description) parts.push(`   Official storefront description, use only for concrete item details: ${p.description}`);
    if (p.tags && p.tags.length) parts.push(`   Storefront tags, categorisation only, not product facts: ${p.tags.join(', ')}`);
    if (p.notes) parts.push(`   Confirmed factual notes: ${p.notes}`);
    else parts.push(`   No factual notes supplied. Do not state pet safety, packaging, contents, shipping, materials or care level for this product beyond what the storefront description states outright.`);
    return parts.join('\n');
  }).join('\n');
}

// How the model is allowed to use the storefront description. Kept next to the
// formatter above so the two are read together.
function buildStorefrontDescriptionRules() {
  return `USING THE OFFICIAL STOREFRONT DESCRIPTION:
- The storefront description is our own product page copy. It is source material for understanding what the item is: what kind of gift it is, what plant is in it, what form and size it takes, what it is made of.
- It is NOT a paragraph outline and NOT a checklist. Do not work through it detail by detail, and do not treat a detail as something that must appear in the article just because the product page mentions it. Understand the item from it, then write about the gift as a whole.
- Paraphrase it in your own words. Never copy a sentence or a distinctive phrase from it into the article.
- Promotional adjectives in that copy are marketing language, not evidence. Words like "perfect", "beautiful", "premium", "luxurious", "stunning", "hand selected", "carefully chosen" or "ideal for anyone" prove nothing and must not be restated or used to support a claim.
- A concrete detail stated in the description counts as supplied fact for that item. An implication, a suggestion or a marketing adjective does not.
- The storefront tags are categorisation. They may tell you what kind of item this is. They are never evidence of pet safety, care level, light needs, packaging or contents.
- Where the description and the confirmed factual notes disagree, the confirmed factual notes win.`;
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
  buildStorefrontDescriptionRules,
  comparisonTableSkeleton,
  formatReferences,
  formatProductsForPrompt,
  updatedTag,
  ctaButton,
  additional,
  keywordLine
};
