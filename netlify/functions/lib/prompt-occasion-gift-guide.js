// Occasion Gift Guide prompt. Built around a specific holiday, observance or
// milestone. There is no tone selector: the occasion, recipient, relationship and
// the sensitive-occasion flag set the emotional register.
const {
  HEADING_COLOR, buildSharedStyleRules, buildPlantAccuracyRules, buildGiftVoiceRules,
  buildEvidenceRules, buildStorefrontDescriptionRules, comparisonTableSkeleton, formatReferences, formatProductsForPrompt,
  updatedTag, ctaButton, additional, keywordLine
} = require('./shared-rules');

function buildOccasionGiftGuidePrompt(fields) {
  const products = fields.selectedProducts || [];
  const count = Math.min(fields.numberOfRecommendations || products.length, products.length);
  const shown = products.slice(0, count);
  const chars = (fields.giftCharacteristics || []).slice();
  if (fields.customCharacteristic) chars.push(fields.customCharacteristic);
  const sensitive = !!fields.sensitiveOccasion;
  const cta = sensitive ? '' : ctaButton(fields.collectionUrl, 'Shop the collection');

  const dateRule = fields.occasionDate
    ? `VERIFIED DATE, supplied and checked by the content team: ${fields.occasionDate}. You may state this date. Write it exactly as given. Do not restate it in any other form and do not calculate any other date from it.`
    : `NO DATE WAS SUPPLIED. Do not state, guess, calculate or imply the calendar date of this occasion, and do not name a weekday, a month or a "falls on" rule. Write about the occasion without a date.`;

  const brief = [
    `Occasion: ${fields.occasion}`,
    fields.occasionYear ? `Year, for use inside the article only where it is relevant: ${fields.occasionYear}` : '',
    fields.recipient ? `Recipient: ${fields.recipient}` : '',
    fields.relationship ? `Relationship: ${fields.relationship}` : '',
    `Number of recommendations: exactly ${count}`,
    fields.budgetRange ? `Budget range: ${fields.budgetRange}` : '',
    chars.length ? `Gift characteristics: ${chars.join(', ')}` : ''
  ].filter(Boolean).join('\n');

  const sensitiveBlock = sensitive ? `
SENSITIVE OCCASION MODE IS ON. This observance touches grief, loss, illness or another emotionally difficult experience. These rules override anything above that conflicts with them:
- Use restrained, supportive language throughout. No celebration, no excitement, no exclamation marks.
- No urgency of any kind. No countdowns, no "order by", no "while supplies last", no shipping deadlines.
- No discounts, no promotions, no aggressive selling.
- Never write "perfect gift", "must have", "top pick" or similar retail superlatives.
- Never suggest that a plant can heal grief, speed recovery, or replace emotional support, therapy or human presence.
- Acknowledge plainly that a plant is not the right gesture for everyone, and that the recipient's own wishes come first.
- Advise the giver to consider what the recipient would actually want, including whether they want a living thing to look after right now.
- Close with a gentle, low pressure line. Use a soft link to the collection at most, and no button style call to action. If a commercial close would feel wrong, simply end with a supportive sentence and no call to action at all.
- If this is Pregnancy and Infant Loss Remembrance Day, treat it as a day of remembrance, never as a retail holiday. No festive framing whatsoever.
` : '';

  return `Write a gift guide for the Succulents Box blog, about our own gifts, for this occasion. Return ONLY raw HTML for the article body.

BRIEF:
${brief}

DATE HANDLING, this rule is absolute:
${dateRule}
Never guess or compute the date of any holiday or observance under any circumstance.

OUR FEATURED GIFTS, the only items that may appear in this article, in this order:
${formatProductsForPrompt(shown)}

Write one section for each of the ${count} featured gifts. Never add, invent or substitute an item.
${sensitiveBlock}
STRUCTURE. Write natural headings that suit this occasion and these gifts. Do not reuse a fixed SEO template, and do not use the headings below as literal titles unless they genuinely fit.

1. Updated tag, then ONE short introductory paragraph:
${updatedTag()}
<p>[Establish the occasion in one natural paragraph and lead straight into the gifts.]</p>
The introduction makes no claim about the items as a group. Do not write that every item is low maintenance, that every item works on a desk, that every item suits modest light, that every item is appropriate for beginners, that none of the gifts demand attention, or that all the designs work in shared spaces. Do not add a second introductory section that says the same thing again.
The introduction must NOT be followed by a section explaining why plants make good gifts. Do not write a section titled "Why plant gifts suit this occasion", "Why plants make great gifts", "Why choose a plant gift", "The meaning of giving plants" or anything equivalent, and do not argue in the abstract that plants can be gifts.
Do not open with lines like "Plants symbolize growth and love", "A plant is a gift that keeps on giving", "Plants bring life into any space", "Christmas is the season of giving", "The holidays are all about warmth and togetherness", "Finding the perfect gift can be difficult", or "Whether you are shopping for friends or family, we have something for everyone". Respond to this actual occasion, this audience and these actual gifts.

2. The featured gifts. For each one, in the order above:
<h3 style="color:${HEADING_COLOR}">[a natural heading built on the exact item name, hyperlinked to its exact URL]</h3>
<p>[Identify the gift, give one or two details that genuinely set it apart, and add concise care information where it affects the choice. Write about the gift as one complete thing: do not work through its plant, container, dish, moss, candle, card or packaging one by one. Do not append the price.]</p>
These sections must NOT all follow the same formula. The failure to avoid is: emotional opening, then an inventory of contents, then a care sentence, then a price sentence, repeated five times. Let one focus on the look, another on the plant, a DIY kit on what the person actually does, a gift box on its occasion. Vary because the gifts differ, never through flowery language.
Most recommendations need no sentence explaining why the gift suits the named recipient. Do not manufacture one. Do not force a "why it works" line into every entry.
Some can be two short paragraphs, some a single one. Do not force the same bullets onto every gift, do not add a "Good to know" caution just to fill space, and do not raise a drawback unless it is verified and useful.

3. A quick comparison table:
${comparisonTableSkeleton(shown.some(p => p.price))}

4. CONDITIONAL, not required: guidance that helps someone choose between these gifts. Write it only when the confirmed facts support a useful comparison, and give it a natural heading. Build the selection guidance ONLY from differences explicitly supported by the confirmed product data: the verified gift format, the plant type, a DIY activity, care requirements, an occasion named in the official item, and the supplied prices. Omit this section entirely if the confirmed facts do not support a useful comparison. Never infer size, placement, personality, relationship suitability, design intent, or visual impact. Do not restate every recommendation, and never write in the transactional register the style rules forbid.

That is the whole required article: introduction, one section per gift, and the comparison table. Add selection guidance only when confirmed facts support a useful comparison. Everything below is optional and is left out unless it genuinely earns its place.

5. OPTIONAL, only when there are real questions a gift buyer would ask about THESE gifts: a short question and answer section. Good questions compare the featured items, for example how the gift box differs from the arrangement, or which one is the DIY option. Answer only from confirmed information. Never answer questions about shipping speed, delivery dates, packaging, guarantees, gift messages, pet safety, drainage, included care materials, weather protection or local pickup. There is no required number: write only the questions the confirmed facts can answer, or leave the section out.

6. OPTIONAL, and only when confirmed gift message or personalization information applies to these items AND has not already been covered: a short note about it. Never suggest rewrapping, repotting, adding a spray bottle, a care card, an accessory or anything else we did not confirm. Leave this section out rather than write filler.

THE ARTICLE ENDS THERE. It may end after the comparison table when the confirmed facts support no useful comparison, after the selection guidance when they do, or after a useful FAQ. It does NOT need a ceremonial conclusion, and you must not write one.
${cta || (fields.collectionUrl && sensitive ? `<p>If it feels right, you can see the <a href="${fields.collectionUrl}" style="color:#3a6b35;">plants we grow</a> whenever you are ready.</p>` : '')}

SECTIONS THAT MUST NOT EXIST IN THIS ARTICLE:
- Why plants suit the occasion, why plants make good gifts, or plant symbolism.
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

module.exports = { buildOccasionGiftGuidePrompt };
