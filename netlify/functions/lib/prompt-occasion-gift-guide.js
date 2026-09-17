// Occasion Gift Guide prompt. Built around a specific holiday, observance or
// milestone. There is no tone selector: the occasion, recipient, relationship and
// the sensitive-occasion flag set the emotional register.
const {
  HEADING_COLOR, buildSharedStyleRules, buildPlantAccuracyRules, buildGiftVoiceRules,
  buildEvidenceRules, comparisonTableSkeleton, formatReferences, formatProductsForPrompt,
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

1. Updated tag, then a short introduction of two or three paragraphs:
${updatedTag()}
<p>[Open on the occasion and the person being celebrated, then introduce the featured gifts and lead straight into them.]</p>
The introduction must NOT be followed by a section explaining why plants make good gifts. Do not write a section titled "Why plant gifts suit this occasion", "Why plants make great gifts", "Why choose a plant gift", "The meaning of giving plants" or anything equivalent, and do not argue in the abstract that plants can be gifts.
Do not open with lines like "Plants symbolize growth and love", "A plant is a gift that keeps on giving", "Plants bring life into any space", "Christmas is the season of giving", "The holidays are all about warmth and togetherness", "Finding the perfect gift can be difficult", or "Whether you are shopping for friends or family, we have something for everyone". Respond to this actual occasion, this audience and these actual gifts.

2. The featured gifts. For each one, in the order above:
<h3 style="color:${HEADING_COLOR}">[a natural heading built on the exact item name, hyperlinked to its exact URL]</h3>
<p>[What makes this one distinctive as a gift, who might appreciate it, and the kind of space or moment it suits. Bring in its design, plant, container, arrangement or theme where that is what makes it special. Include the verified price when one was supplied.]</p>
Vary the shape of these sections. Some can be two short paragraphs, some can carry a short list where that genuinely helps. Do not force the same bullets onto every gift, do not add a "Good to know" caution just to fill space, and do not raise a drawback unless it is verified and useful. A short, item specific care note is welcome where it matters, but these sections are about the gift, not about care.

3. A quick comparison table:
${comparisonTableSkeleton(shown.some(p => p.price))}

4. Guidance that helps someone choose between these gifts. Give it a natural heading. Build it on real differences between the featured items: compact against centerpiece, single plant against arrangement, gift box against planted container, festive design against year round style, desk sized against statement piece, the relationship, the tone of the occasion, and the supplied prices. Do not restate every recommendation, and never write in the transactional register the style rules forbid.

5. OPTIONAL, only when it adds something specific: a short section on making the gift personal, with a natural heading. Keep it to the message and the moment: a handwritten note, saying why this gift reminded you of them, wording that suits the occasion, choosing when to give it. Never suggest rewrapping, repotting, adding a spray bottle, a care card, an accessory or anything else we did not confirm. Leave this section out rather than write filler.

6. OPTIONAL, only when there are real questions a gift buyer would ask about THESE gifts: a short question and answer section. Good questions compare the featured items, for example which one suits a desk, which works as a centerpiece, how the gift box differs from the arrangement, which suits someone new to plants. Answer only from confirmed information. Never answer questions about shipping speed, delivery dates, packaging, guarantees, gift messages, pet safety, drainage, included care materials, weather protection or local pickup. There is no required number: write only the questions the confirmed facts can answer, or leave the section out.

7. A short closing from us. Return to the occasion, invite the reader to choose among the featured gifts, and sound welcoming and confident. Do not repeat the introduction, do not end with care advice, and do not claim anything about ordering, delivery or packaging.
${cta || (fields.collectionUrl && sensitive ? `<p>If it feels right, you can see the <a href="${fields.collectionUrl}" style="color:#3a6b35;">plants we grow</a> whenever you are ready.</p>` : '')}

SECTIONS THAT MUST NOT EXIST IN THIS ARTICLE:
- Why plants suit the occasion, why plants make good gifts, or plant symbolism.
- Ordering and timing, shipping advice, or delivery deadlines.
- Care after the gift, a care primer, or any general succulent care section.
Removing those sections is not a reason to write less. Spend the room on stronger, more specific writing about each gift.
${formatReferences(fields.references)}${keywordLine(fields)}${additional(fields)}
${buildGiftVoiceRules(fields)}

${buildSharedStyleRules({ gift: true })}

${buildPlantAccuracyRules({ withEvidence: true })}

${buildEvidenceRules()}

Start directly with the Updated tag.`;
}

module.exports = { buildOccasionGiftGuidePrompt };
