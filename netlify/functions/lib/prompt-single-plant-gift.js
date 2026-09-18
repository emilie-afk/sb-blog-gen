// Single-Plant Gift Guide prompt. One plant, framed as a gift.
const {
  HEADING_COLOR, buildSharedStyleRules, buildPlantAccuracyRules, buildGiftVoiceRules,
  buildEvidenceRules, buildStorefrontDescriptionRules, formatReferences, updatedTag, ctaButton, additional, keywordLine
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

  return `Write a gift focused post for the Succulents Box blog about one of our plants: ${plant}${sci}. Return ONLY raw HTML for the article body.

BRIEF:
${brief}

The gift angle is the spine of the article. Every section supports someone deciding whether to give this plant. This is NOT a care guide with a gift title on it: care appears only where it helps that decision or helps the person receiving it through the first weeks.

STRUCTURE. Write natural headings that suit this plant and this angle rather than reusing a fixed template.

1. Updated tag, then a short introduction of two or three paragraphs:
${updatedTag()}
<p>[Open on the gift angle and the person it is for${fields.productUrl ? `, hyperlinking ${plant} to ${fields.productUrl} once` : ''}. Do not argue in the abstract that plants make good gifts, and do not open with plant symbolism.]</p>

2. What makes ${plant} distinctive. Its verified appearance, growth habit, form, size, or whatever its defining trait actually is. Stay on the plant itself: do not follow this with a sentence about what that gives the person who receives it.
   If ${plant} is an arrangement, a dish garden, a gift box or a gift set rather than a single plant, treat it as ONE complete gift throughout the article. Describe what it feels like as a whole. Do not take it apart into its plant, container, moss, dish, candle, card, packaging or accessories and discuss each in turn, and do not give each element its own benefit.

3. The setting it needs, built ONLY from confirmed light, size and care facts for this plant. State what those facts require and let a reader judge whether their setting matches. Do not invent a recipient personality, a relationship justification, or a reason this plant suits a particular kind of person. If the confirmed facts do not establish a setting requirement, leave this section out rather than guess at one.

4. What to think about before giving it. Honest and useful: the light it needs, pets and small children, how much attention it wants. Candid, never salesy.

5. OPTIONAL, only when it adds something specific: presenting it, focused on the message and the moment rather than on altering the plant. Never suggest repotting, rewrapping, adding a spray bottle, a care card or an accessory we did not confirm.

6. The essential care the person receiving it will need, kept to about 150 words. Light, watering rhythm, and anything genuinely particular to this plant. This is the one place a care note belongs, and it stays short: a full care guide belongs in a care guide.

7. Pets and the household. State toxicity honestly where it is known. If toxicity for this plant is not clearly established, say the giver should check before gifting into a home with pets or small children, and link "toxic and non-toxic succulents for pets" to https://succulentsbox.com/blogs/blog/toxic-and-non-toxic-succulents-for-pets

8. OPTIONAL: a few real questions someone choosing this as a gift would ask, answered from what is actually known. No fixed number, and nothing about shipping, delivery, packaging, guarantees or gift messages unless it was supplied.

9. OPTIONAL: a short closing from us, only when there is something left to say that no earlier section has said. It states a fact or a plain next step. It is never a ceremonial wrap-up, never an emotional summary, and never a restatement of the article. Leave it out rather than write one, and end after the questions or the care note instead.
${cta}

Do not write a section arguing why plants make good gifts, a plant symbolism section, an ordering and timing section, or a general succulent care section beyond the short note in step 6.
${formatReferences(fields.references)}${keywordLine(fields)}${additional(fields)}
${buildGiftVoiceRules(fields)}

${buildSharedStyleRules({ gift: true })}

${buildPlantAccuracyRules({ withEvidence: true })}

${buildEvidenceRules()}

${buildStorefrontDescriptionRules()}

Start directly with the Updated tag.`;
}

module.exports = { buildSinglePlantGiftPrompt };
