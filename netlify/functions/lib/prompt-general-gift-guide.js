// General Gift Guide prompt. Recipient, lifestyle or feature based list article.
const {
  HEADING_COLOR, buildSharedStyleRules, buildPlantAccuracyRules, buildGiftVoiceRules,
  buildEvidenceRules, buildStorefrontDescriptionRules, comparisonTableSkeleton, formatReferences, formatProductsForPrompt,
  updatedTag, ctaButton, additional, keywordLine
} = require('./shared-rules');

function buildGeneralGiftGuidePrompt(fields) {
  const products = fields.selectedProducts || [];
  const count = Math.min(fields.numberOfRecommendations || products.length, products.length);
  const shown = products.slice(0, count);
  const chars = (fields.giftCharacteristics || []).slice();
  if (fields.customCharacteristic) chars.push(fields.customCharacteristic);
  const cta = ctaButton(fields.collectionUrl, 'Shop plant gifts');

  const brief = [
    fields.recipient ? `Intended recipient: ${fields.recipient}` : 'No recipient specified.',
    `Number of recommendations: exactly ${count}`,
    fields.budgetRange ? `Budget range: ${fields.budgetRange}` : '',
    chars.length ? `Gift characteristics the guide is built around: ${chars.join(', ')}` : ''
  ].filter(Boolean).join('\n');

  return `Write a gift guide for the Succulents Box blog, introducing gifts from our own collection. Return ONLY raw HTML for the article body.

BRIEF:
${brief}

OUR FEATURED GIFTS, the only items that may appear in this article, in this order:
${formatProductsForPrompt(shown)}

Write one section for each of the ${count} featured gifts. Never add, invent or substitute an item.

STRUCTURE. Write natural headings that suit this guide and these gifts. Do not reuse a fixed SEO template, and do not use the headings below as literal titles unless they genuinely fit.

1. Updated tag, then a short introduction of two or three paragraphs:
${updatedTag()}
<p>[Open on the gifting need and the person it is for, then introduce the featured gifts and lead straight into them.]</p>
The introduction must NOT be followed by a section explaining why plants make good gifts. Do not write a section titled "Why plants make great gifts", "Why choose a plant gift", "Benefits of plant gifts", "The meaning of giving plants" or anything equivalent, and do not argue in the abstract that plants can be gifts.
Do not open with lines like "Plants symbolize growth and love", "A plant is a gift that keeps on giving", "Plants bring life into any space", "Finding the perfect gift can be difficult", or "Whether you are shopping for friends or family, we have something for everyone". Respond to this actual audience and these actual gifts.

2. The featured gifts. For each one, in the order above:
<h3 style="color:${HEADING_COLOR}">[a natural heading built on the exact item name, hyperlinked to its exact URL]</h3>
<p>[What this gift feels like as a whole, who might appreciate it, and the kind of space or moment it suits, then one or two natural sentences of care guidance for its plant. Write about the gift as one complete thing: do not work through its plant, container, moss, dish, candle, card or packaging one by one. Include the verified price when one was supplied.]</p>
Vary the shape of these sections. Some can be two short paragraphs, some can carry a short list where that genuinely helps. Do not force the same bullets onto every gift, do not add a "Good to know" caution just to fill space, and do not raise a drawback unless it is verified and useful. A short, item specific care note is welcome where it matters, but these sections are about the gift, not about care.

3. A quick comparison table:
${comparisonTableSkeleton(shown.some(p => p.price))}

4. Guidance that helps someone choose between these gifts. Give it a natural heading. Build it on real differences between the featured items: compact against centerpiece, single plant against arrangement, gift box against planted container, desk sized against statement piece, the kind of person it is for, and the supplied prices. Do not restate every recommendation, and never write in the transactional register the style rules forbid.

5. OPTIONAL, only when it adds something specific: a short section on making the gift personal, with a natural heading. Keep it to the message and the moment: a handwritten note, saying why this gift reminded you of them, choosing when to give it. Never suggest rewrapping, repotting, adding a spray bottle, a care card, an accessory or anything else we did not confirm. Leave this section out rather than write filler.

6. OPTIONAL, only when there are real questions a gift buyer would ask about THESE gifts: a short question and answer section comparing the featured items. Answer only from confirmed information. Never answer questions about shipping speed, delivery dates, packaging, guarantees, gift messages, pet safety, drainage, included care materials, weather protection or local pickup. There is no required number: write only the questions the confirmed facts can answer, or leave the section out.

7. A short closing from us. Return to the gifting need, invite the reader to choose among the featured gifts, and sound welcoming and confident. Do not repeat the introduction, do not end with care advice, and do not claim anything about ordering, delivery or packaging.
${cta}

SECTIONS THAT MUST NOT EXIST IN THIS ARTICLE:
- Why plants make good gifts, or plant symbolism.
- How we chose these gifts, or any selection methodology section.
- Ordering and timing, shipping advice, or delivery deadlines.
- Care after the gift, a care primer, or any general succulent care section.
- A light and space requirements section, a "where to put it" section, or any section built on light levels, room placement or care needs. There is no required section of this kind. Do not restore one under a different heading.
Removing those sections is not a reason to write less. Spend the room on stronger, more specific writing about each gift.
${formatReferences(fields.references)}${keywordLine(fields)}${additional(fields)}
${buildGiftVoiceRules(fields)}

${buildSharedStyleRules({ gift: true })}

${buildPlantAccuracyRules({ withEvidence: true })}

${buildEvidenceRules()}

${buildStorefrontDescriptionRules()}

Start directly with the Updated tag.`;
}

module.exports = { buildGeneralGiftGuidePrompt };
