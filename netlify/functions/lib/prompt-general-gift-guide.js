// General Gift Guide prompt. Recipient, lifestyle or feature based list article.
const {
  HEADING_COLOR, buildSharedStyleRules, buildPlantAccuracyRules, buildGiftVoiceRules,
  buildEvidenceRules, comparisonTableSkeleton, formatReferences, formatProductsForPrompt,
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

  return `You are writing a plant gift guide for Succulents Box (succulentsbox.com). Return ONLY raw HTML for the article body.

BRIEF:
${brief}

CONFIRMED PRODUCTS, the only products that may appear in this article, in this order:
${formatProductsForPrompt(shown)}

Write exactly ${count} recommendations, one per confirmed product. Do not add any other product. Do not merge or drop any of them.

EXACT STRUCTURE:

1. Updated tag and introduction, 2 to 3 sentences that say who this guide is for and what the picks have in common:
${updatedTag()}
<p>[intro]</p>

2. <h2 style="color:${HEADING_COLOR}" id="how-we-chose">How we chose these gifts</h2>
<p>[short paragraph on the selection criteria, grounded in the brief. Be honest: these are picks from the Succulents Box range that fit it]</p>

3. <h2 style="color:${HEADING_COLOR}" id="the-gifts">The gift picks</h2>
Then, for each confirmed product in order:
<h3 style="color:${HEADING_COLOR}">[number]. [exact product title, hyperlinked to the exact product URL]</h3>
<p>[2 to 3 sentences. Lead with what makes this one different from the others in the list, then who it suits. Use "Choose this if..." or "Skip this if..." where it helps the reader decide]</p>
<ul>
<li><strong>Best for:</strong> [recipient or situation]</li>
<li><strong>Light and care:</strong> [only what is genuinely known. Omit this line entirely when nothing was supplied and no safe general statement applies]</li>
<li><strong>Good to know:</strong> [one honest, specific caution. Omit the line if there is nothing real to say]</li>
<li><strong>Price:</strong> [only if a price was supplied, otherwise omit this line entirely]</li>
</ul>
<p><a href="[exact product URL]" style="color:#3a6b35;font-weight:700;">See [product title]</a></p>
Each pick must earn its place for a different reason. Do not reuse the same justification twice.

4. <h2 style="color:${HEADING_COLOR}" id="comparison">Quick comparison</h2>
${comparisonTableSkeleton(shown.some(p => p.price))}

5. <h2 style="color:${HEADING_COLOR}" id="how-to-choose">How to choose the right gift</h2>
<p>[practical guidance that helps the reader pick between the options above: match the plant to the recipient's light, time and space rather than to a price tag]</p>

6. <h2 style="color:${HEADING_COLOR}" id="presentation">Presentation and personalization ideas</h2>
<ul><li>[4 to 5 ideas the giver can do themselves. Do not describe packaging Succulents Box offers unless it was supplied as a fact]</li></ul>

7. <h2 style="color:${HEADING_COLOR}" id="care-basics">Care basics to pass along</h2>
<p>[a short shared care primer covering light, watering and drainage, about 150 words, written as general succulent and houseplant guidance rather than as product facts]</p>

8. <h2 style="color:${HEADING_COLOR}" id="qa">Questions people ask</h2>
<ul style="list-style:none;padding:0;"><li style="border:1px solid #e0e8e0;border-radius:8px;margin-bottom:10px;overflow:hidden;"><div style="background:#f9fbf9;padding:12px 16px;font-weight:700;color:#2d5428;">[Q?]</div><div style="padding:10px 16px;font-size:14px;line-height:1.6;">[A]</div></li>[exactly 5]</ul>

9. <h2 style="color:${HEADING_COLOR}" id="shop">Shop the gift collection</h2>
<p>[2 sentences. Succulents Box grows its plants in its own California greenhouses. No delivery date, shipping time or packaging promises]</p>
${cta}
${formatReferences(fields.references)}${keywordLine(fields)}${additional(fields)}
${buildGiftVoiceRules(fields)}

${buildSharedStyleRules({ gift: true })}

${buildPlantAccuracyRules({ withEvidence: true })}

${buildEvidenceRules()}

Start directly with the Updated tag.`;
}

module.exports = { buildGeneralGiftGuidePrompt };
