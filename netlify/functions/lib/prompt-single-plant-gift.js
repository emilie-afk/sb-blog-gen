// Single-Plant Gift Guide prompt. One plant, framed as a gift.
const {
  HEADING_COLOR, buildSharedStyleRules, buildPlantAccuracyRules, buildGiftVoiceRules,
  buildEvidenceRules, formatReferences, updatedTag, ctaButton, additional, keywordLine
} = require('./shared-rules');

function buildSinglePlantGiftPrompt(fields) {
  const plant = fields.plantName;
  const sci = fields.sciName ? ` (${fields.sciName})` : '';
  const angle = fields.giftAngle === 'Custom angle' ? (fields.customGiftAngle || '') : fields.giftAngle;
  const cta = ctaButton(fields.productUrl, `Shop ${plant}`);

  const brief = [
    `Plant: ${plant}${sci}`,
    fields.recipient ? `Intended recipient: ${fields.recipient}` : '',
    fields.occasion ? `Occasion: ${fields.occasion}` : '',
    `Gift angle, this is the spine of the article: ${angle}`,
    fields.careConsiderations ? `Care considerations supplied by the content team: ${fields.careConsiderations}` : '',
    fields.productNotes ? `Confirmed product facts: ${fields.productNotes}` : '',
    fields.productUrl ? `Primary product URL: ${fields.productUrl}` : ''
  ].filter(Boolean).join('\n');

  return `You are writing a gift focused blog post for Succulents Box (succulentsbox.com) about one plant: ${plant}${sci}. Return ONLY raw HTML for the article body.

BRIEF:
${brief}

The gift angle controls the whole article. Every section should support the reader's decision to give this plant as a gift. This is NOT a standard care guide. Care information appears only where it helps someone decide to give the plant or helps the recipient keep it alive in the first weeks.

EXACT STRUCTURE:

1. Updated tag and a gift oriented introduction, 2 to 3 sentences:
${updatedTag()}
<p>[intro that opens on the gift angle, not on botany${fields.productUrl ? `. Hyperlink ${plant} to ${fields.productUrl} once` : ''}]</p>

2. <h2 style="color:${HEADING_COLOR}" id="why-a-good-gift">Why ${plant} makes a gift worth giving</h2>
<p>[2 short paragraphs built on the gift angle]</p>

3. <h2 style="color:${HEADING_COLOR}" id="who-its-for">Who it is best for</h2>
<p>[intro line]</p><ul><li>[4 to 6 specific recipient types, each with a short reason]</li></ul>

4. <h2 style="color:${HEADING_COLOR}" id="best-occasions">Best occasions for gifting it</h2>
<ul><li><strong>[Occasion]:</strong> [one line]</li>[4 to 6 items]</ul>

5. <h2 style="color:${HEADING_COLOR}" id="before-you-gift">What to consider before gifting it</h2>
<p>[honest considerations: light in the recipient's home, pets and small children, time and attention needed, climate or shipping season. Be candid, not salesy]</p>

6. <h2 style="color:${HEADING_COLOR}" id="presentation">Presentation and styling ideas</h2>
<ul><li>[4 to 5 ideas: pot pairing, wrapping, a handwritten care note, grouping]</li></ul>
Only describe packaging or personalization that Succulents Box actually offers if that was supplied as a confirmed fact. Otherwise describe things the giver can do themselves.

7. <h2 style="color:${HEADING_COLOR}" id="care-for-recipient">Care the recipient will need to know</h2>
<p>[a compact, practical summary: light, watering rhythm, soil and potting, temperature. Keep it to about 200 words. Do not expand this into a full care guide]</p>

8. <h2 style="color:${HEADING_COLOR}" id="pets-and-household">Pets and household considerations</h2>
<p>[state toxicity honestly when it is known. If toxicity for this plant is not clearly established, say the giver should check before gifting into a home with pets or small children, and link "toxic and non-toxic succulents for pets" → https://succulentsbox.com/blogs/blog/toxic-and-non-toxic-succulents-for-pets]</p>

9. <h2 style="color:${HEADING_COLOR}" id="qa">Questions gift givers ask</h2>
<ul style="list-style:none;padding:0;"><li style="border:1px solid #e0e8e0;border-radius:8px;margin-bottom:10px;overflow:hidden;"><div style="background:#f9fbf9;padding:12px 16px;font-weight:700;color:#2d5428;">[Q?]</div><div style="padding:10px 16px;font-size:14px;line-height:1.6;">[A]</div></li>[exactly 5, all about gifting this plant]</ul>

10. <h2 style="color:${HEADING_COLOR}" id="where-to-buy">Where to buy ${plant} as a gift</h2>
<p>[2 to 3 sentences. Succulents Box grows its plants in its own California greenhouses and ships with a live plant guarantee. Do not promise delivery dates or shipping times]</p>
${cta}
${formatReferences(fields.references)}${keywordLine(fields)}${additional(fields)}
${buildGiftVoiceRules(fields)}

${buildSharedStyleRules()}

${buildPlantAccuracyRules()}

${buildEvidenceRules()}

Start directly with the Updated tag.`;
}

module.exports = { buildSinglePlantGiftPrompt };
