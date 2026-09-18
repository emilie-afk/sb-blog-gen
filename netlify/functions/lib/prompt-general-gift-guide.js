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

1. Updated tag, then ONE short introductory paragraph:
${updatedTag()}
<p>[One natural paragraph. Name the recipient, establish the reason for giving, introduce the ACTUAL range of confirmed gifts, and lead straight into the recommendations.]</p>
Nothing abstract about why plants make good gifts. Do not open with a tribute to the recipient's profession or role: "Teachers shape how their students see the world, and a thoughtful gift acknowledges that work" is exactly the opening to avoid. No abstract claims about gratitude, love, growth or appreciation.
Do not open with, or anywhere use, these generic phrases: "the holiday season calls for", "gifts that keep on giving", "options at every price point", "something for everyone".
The introduction makes no claim about the items as a group. Do not write that every item is low maintenance, that every item works on a desk, that every item suits modest light, that every item is appropriate for beginners, that none of the gifts demand attention, or that all the designs work in shared spaces. Do not add a second introductory section that says the same thing again.
The introduction must NOT be followed by a section explaining why plants make good gifts. Do not write a section titled "Why plants make great gifts", "Why choose a plant gift", "Benefits of plant gifts", "The meaning of giving plants" or anything equivalent, and do not argue in the abstract that plants can be gifts.
Do not open with lines like "Plants symbolize growth and love", "A plant is a gift that keeps on giving", "Plants bring life into any space", "Finding the perfect gift can be difficult", or "Whether you are shopping for friends or family, we have something for everyone". Respond to this actual audience and these actual gifts.

2. The featured gifts. For each one, in the order above:
<h3 style="color:${HEADING_COLOR}">[a natural heading built on the exact item name, hyperlinked to its exact URL]</h3>
<p>[Identify the gift, give one or two details that genuinely set it apart, and add concise care information where it affects the choice. Write about the gift as one complete thing: do not work through its plant, container, dish, moss, candle, card or packaging one by one. Do not append the price.]</p>
These sections must NOT all follow the same formula. The failure to avoid is: emotional opening, then an inventory of contents, then a care sentence, then a price sentence, repeated five times. Let one focus on the look, another on the plant, a DIY kit on what the person actually does, a gift box on its occasion. Vary because the gifts differ, never through flowery language.
Most recommendations need no sentence explaining why the gift suits the named recipient. Do not manufacture one. Do not force a "why it works" line into every entry.
Some can be two short paragraphs, some a single one. Do not force the same bullets onto every gift, do not add a "Good to know" caution just to fill space, and do not raise a drawback unless it is verified and useful.

3. A quick comparison table:
${comparisonTableSkeleton(shown.some(p => p.price))}

4. CONDITIONAL, not required: guidance that helps someone choose between these gifts. Write it only when the confirmed facts support a useful comparison, and give it a natural heading. Build the selection guidance ONLY from differences explicitly supported by the confirmed product data: the verified gift format, the plant type, a DIY activity, care requirements, an occasion named in the official item, and the supplied prices. Omit this section entirely if the confirmed facts do not support a useful comparison. Never infer size, placement, personality, relationship suitability, design intent, or visual impact. Its job is to help the reader tell the GIFTING CHOICES apart, never to classify the recipients. It may compare verified occasion wording, personalization, DIY against finished format, plant type, arrangement size, plant count, care differences, price, and whether a gift carries a printed message. It may never compare invented personalities, rooms, tastes or reactions. Do not restate every recommendation in shorter form, and never write in the transactional register the style rules forbid.

That is the whole required article: introduction, one section per gift, and the comparison table. Add selection guidance only when confirmed facts support a useful comparison. Everything below is optional and is left out unless it genuinely earns its place.

5. OPTIONAL, only when there are real questions a gift buyer would ask about THESE gifts: a short question and answer section comparing the featured items. Answer only from confirmed information. Never answer questions about shipping speed, delivery dates, packaging, guarantees, gift messages, pet safety, drainage, included care materials, weather protection or local pickup. There is no required number: write only the questions the confirmed facts can answer, or leave the section out.

6. OPTIONAL, and only when confirmed gift message or personalization information applies to these items AND has not already been covered: a short note about it. Never suggest rewrapping, repotting, adding a spray bottle, a care card, an accessory or anything else we did not confirm. Leave this section out rather than write filler.

THE ARTICLE ENDS THERE. It may end after the comparison table when the confirmed facts support no useful comparison, after the selection guidance when they do, or after a useful FAQ. It does NOT need a ceremonial conclusion, and you must not write one.
${cta}

SECTIONS THAT MUST NOT EXIST IN THIS ARTICLE:
- Why plants make good gifts, or plant symbolism.
- How we chose these gifts, or any selection methodology section.
- Ordering and timing, shipping advice, or delivery deadlines.
- Care after the gift, a care primer, or any general succulent care section.
- A light and space requirements section, a "where to put it" section, or any section built on light levels, room placement or care needs. There is no required section of this kind. Do not restore one under a different heading.
- Any generic section before the recommendations, however it is titled.
- "Why these gifts work", "Gifts for every workspace", "A Personal Message", "In Closing", "Choose and Send", or any equivalent under another name.
- A paragraph that summarises the prices already shown in the table.
- A final sales paragraph, a second selection summary, or any closing that repeats the selection section.
- A standalone care section.
Do not split the featured gifts into invented categories. Group them only when the groups genuinely help someone navigate, and never to fill the page.
Removing those sections is not a reason to write less, and it is not a reason to pad what remains either. Spend the room on stronger, more specific writing about each gift, and stop when the useful content runs out.
${formatReferences(fields.references)}${keywordLine(fields)}${additional(fields)}
${buildGiftVoiceRules(fields)}

${buildSharedStyleRules({ gift: true })}

${buildPlantAccuracyRules({ withEvidence: true })}

${buildEvidenceRules()}

${buildStorefrontDescriptionRules()}

Start directly with the Updated tag.`;
}

module.exports = { buildGeneralGiftGuidePrompt };
