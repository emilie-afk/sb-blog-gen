// Occasion Gift Guide prompt. Built around a specific holiday, observance or milestone.
const {
  HEADING_COLOR, buildSharedStyleRules, buildPlantAccuracyRules, buildProductAccuracyRules,
  formatReferences, formatProductsForPrompt, updatedTag, ctaButton, additional, keywordLine
} = require('./shared-rules');

const TONE_GUIDANCE = {
  'Celebratory': 'Upbeat and warm. Celebrate the occasion without hype.',
  'Romantic': 'Affectionate and personal. Never corporate, never clinical. Keep it tasteful.',
  'Appreciative': 'Grateful and sincere. Focus on saying thank you.',
  'Professional': 'Respectful and workplace appropriate. Absolutely no romantic or affectionate language, no terms of endearment.',
  'Supportive': 'Calm and encouraging. No pressure, no hype.',
  'Sympathy or remembrance': 'Quiet, gentle and restrained. No celebration language.'
};

function buildOccasionGiftGuidePrompt(fields) {
  const products = fields.selectedProducts || [];
  const count = Math.min(fields.numberOfRecommendations || products.length, products.length);
  const chars = (fields.giftCharacteristics || []).slice();
  if (fields.customCharacteristic) chars.push(fields.customCharacteristic);
  const sensitive = !!fields.sensitiveOccasion;
  const cta = sensitive ? '' : ctaButton(fields.collectionUrl, 'Shop the collection');

  const dateRule = fields.occasionDate
    ? `VERIFIED DATE, supplied and checked by the content team: ${fields.occasionDate}. You may state this date. Write it exactly as given. Do not restate it in any other form and do not calculate any other date from it.`
    : `NO DATE WAS SUPPLIED. Do not state, guess, calculate or imply the calendar date of this occasion, and do not name a weekday, a month or a "falls on" rule. Write about the occasion without a date.`;

  const brief = [
    `Working title: ${fields.title}`,
    `Occasion: ${fields.occasion}`,
    fields.occasionYear ? `Year: ${fields.occasionYear}` : '',
    fields.recipient ? `Recipient: ${fields.recipient}` : '',
    fields.relationship ? `Relationship: ${fields.relationship}` : '',
    `Tone: ${fields.tone}. ${TONE_GUIDANCE[fields.tone] || ''}`,
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

  return `You are writing an occasion based plant gift guide for Succulents Box (succulentsbox.com). Return ONLY raw HTML for the article body.

BRIEF:
${brief}

DATE HANDLING, this rule is absolute:
${dateRule}
Never guess or compute the date of any holiday or observance under any circumstance.

CONFIRMED PRODUCTS, the only products that may appear in this article, in this order:
${formatProductsForPrompt(products.slice(0, count))}

Write exactly ${count} recommendations, one per confirmed product. Do not add, invent or substitute any product.
${sensitiveBlock}
EXACT STRUCTURE:

1. Updated tag and an introduction anchored on the occasion, 2 to 3 sentences:
${updatedTag()}
<p>[intro in the requested tone]</p>

2. <h2 style="color:${HEADING_COLOR}" id="why-plants">Why plants suit ${fields.occasion}</h2>
<p>[2 short paragraphs connecting the occasion to a living gift, in the requested tone]</p>

3. <h2 style="color:${HEADING_COLOR}" id="the-gifts">Gift ideas for ${fields.occasion}</h2>
For each confirmed product in order:
<h3 style="color:${HEADING_COLOR}">[number]. [exact product title, hyperlinked to the exact product URL]</h3>
<p>[2 to 3 sentences on why it fits this occasion and this recipient]</p>
<ul>
<li><strong>Best for:</strong> [recipient or situation]</li>
<li><strong>Light and care:</strong> [only what is genuinely known]</li>
<li><strong>Good to know:</strong> [one honest caution, omit the line if there is nothing real to say]</li>
<li><strong>Price:</strong> [only if supplied, otherwise omit the line]</li>
</ul>
<p><a href="[exact product URL]" style="color:#3a6b35;font-weight:700;">See [product title]</a></p>

4. <h2 style="color:${HEADING_COLOR}" id="comparison">Quick comparison</h2>
<table style="border-collapse:collapse;width:100%;margin:12px 0;"><tr><th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Gift</th><th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Best for</th><th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Light</th><th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Care level</th>${products.some(p => p.price) ? '<th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Price</th>' : ''}</tr>[one row per recommendation, td style="border:1px solid #dde;padding:8px 12px;". Cells must match the sections above and the supplied data. Write "Varies" rather than inventing a value]</table>

5. <h2 style="color:${HEADING_COLOR}" id="how-to-choose">How to choose by recipient</h2>
<p>[guidance keyed to the relationship and recipient in the brief]</p>

6. <h2 style="color:${HEADING_COLOR}" id="meaning">What these plants are said to represent</h2>
<p>[Include this section ONLY if there is a well established, widely documented meaning for one of these plants. If you are not confident, omit this entire section including its heading. Never invent symbolism]</p>

7. <h2 style="color:${HEADING_COLOR}" id="presentation">Presentation and personalization ideas</h2>
<ul><li>[4 to 5 ideas the giver can do themselves]</li></ul>

8. <h2 style="color:${HEADING_COLOR}" id="ordering">Ordering and timing</h2>
<p>[general, non promissory guidance: order with room to spare, think about cold or hot weather shipping, have it sent to an address where someone can bring it inside. Do not state shipping times, cutoffs or delivery dates${sensitive ? '. Keep this brief and free of urgency' : ''}]</p>

9. <h2 style="color:${HEADING_COLOR}" id="care-basics">Care after the gift</h2>
<p>[short shared care primer, about 150 words: light, watering, drainage]</p>

10. <h2 style="color:${HEADING_COLOR}" id="qa">Questions people ask</h2>
<ul style="list-style:none;padding:0;"><li style="border:1px solid #e0e8e0;border-radius:8px;margin-bottom:10px;overflow:hidden;"><div style="background:#f9fbf9;padding:12px 16px;font-weight:700;color:#2d5428;">[Q?]</div><div style="padding:10px 16px;font-size:14px;line-height:1.6;">[A]</div></li>[exactly 5]</ul>

11. <h2 style="color:${HEADING_COLOR}" id="shop">${sensitive ? 'If you would like to send a plant' : 'Shop the ' + fields.occasion + ' collection'}</h2>
<p>[${sensitive ? '1 to 2 gentle sentences, no pressure, no urgency' : '2 sentences. Own California greenhouses, live plant guarantee, no delivery promises'}]</p>
${cta || (fields.collectionUrl && sensitive ? `<p>If it feels right, you can see the <a href="${fields.collectionUrl}" style="color:#3a6b35;">plants we grow</a> whenever you are ready.</p>` : '')}
${formatReferences(fields.references)}${keywordLine(fields)}${additional(fields)}
${buildSharedStyleRules()}

${buildPlantAccuracyRules()}

${buildProductAccuracyRules()}

Start directly with the Updated tag.`;
}

module.exports = { buildOccasionGiftGuidePrompt, TONE_GUIDANCE };
