// General Gift Guide prompt. Recipient, lifestyle or feature based list article.
const {
  HEADING_COLOR, buildSharedStyleRules, buildPlantAccuracyRules, buildProductAccuracyRules,
  formatReferences, formatProductsForPrompt, updatedTag, ctaButton, additional, keywordLine
} = require('./shared-rules');

function buildGeneralGiftGuidePrompt(fields) {
  const products = fields.selectedProducts || [];
  const count = Math.min(fields.numberOfRecommendations || products.length, products.length);
  const chars = (fields.giftCharacteristics || []).slice();
  if (fields.customCharacteristic) chars.push(fields.customCharacteristic);
  const cta = ctaButton(fields.collectionUrl, 'Shop plant gifts');

  const brief = [
    `Working title: ${fields.title}`,
    fields.recipient ? `Intended recipient: ${fields.recipient}` : '',
    `Number of recommendations: exactly ${count}`,
    fields.budgetRange ? `Budget range: ${fields.budgetRange}` : '',
    chars.length ? `Gift characteristics the guide is built around: ${chars.join(', ')}` : ''
  ].filter(Boolean).join('\n');

  return `You are writing a plant gift guide for Succulents Box (succulentsbox.com). Return ONLY raw HTML for the article body.

BRIEF:
${brief}

CONFIRMED PRODUCTS, these are the only products that may appear in this article, in this order:
${formatProductsForPrompt(products.slice(0, count))}

Write exactly ${count} recommendations, one per confirmed product. Do not add any other product. Do not merge or drop any of them.

EXACT STRUCTURE:

1. Updated tag and introduction, 2 to 3 sentences that set up who this guide is for:
${updatedTag()}
<p>[intro]</p>

2. <h2 style="color:${HEADING_COLOR}" id="how-we-chose">How we chose these gifts</h2>
<p>[short paragraph on the selection criteria, grounded in the gift characteristics above. Be honest: these are picks from the Succulents Box range that fit the brief]</p>

3. <h2 style="color:${HEADING_COLOR}" id="the-gifts">The gift picks</h2>
Then, for each confirmed product in order:
<h3 style="color:${HEADING_COLOR}">[number]. [exact product title, hyperlinked to the exact product URL]</h3>
<p>[2 to 3 sentences: why it suits this guide, and who or what situation it is best for]</p>
<ul>
<li><strong>Best for:</strong> [recipient or situation]</li>
<li><strong>Light and care:</strong> [only what is genuinely known about this plant type. If the product is not a single plant, describe care generally or omit this line]</li>
<li><strong>Good to know:</strong> [one honest caution, for example toxicity if known, light needs, or that it grows slowly. Omit the line if there is nothing real to say]</li>
<li><strong>Price:</strong> [only if a price was supplied. Otherwise omit this line entirely]</li>
</ul>
<p><a href="[exact product URL]" style="color:#3a6b35;font-weight:700;">See [product title]</a></p>
Do not output a label with an empty value. Vary the reasoning across picks, do not repeat one selling point.

4. <h2 style="color:${HEADING_COLOR}" id="comparison">Quick comparison</h2>
<table style="border-collapse:collapse;width:100%;margin:12px 0;"><tr><th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Gift</th><th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Best for</th><th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Light</th><th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Care level</th>${products.some(p => p.price) ? '<th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Price</th>' : ''}</tr>[one row per recommendation, td style="border:1px solid #dde;padding:8px 12px;". Every cell must match what you wrote above and what was supplied. Write "Varies" rather than inventing a value]</table>

5. <h2 style="color:${HEADING_COLOR}" id="how-to-choose">How to choose the right gift</h2>
<p>[practical guidance: match the plant to the recipient's light, time and space rather than to a price tag]</p>

6. <h2 style="color:${HEADING_COLOR}" id="presentation">Presentation and personalization ideas</h2>
<ul><li>[4 to 5 ideas the giver can do themselves]</li></ul>

7. <h2 style="color:${HEADING_COLOR}" id="care-basics">Care basics to pass along</h2>
<p>[a short shared care primer covering light, watering and drainage, about 150 words]</p>

8. <h2 style="color:${HEADING_COLOR}" id="qa">Questions people ask</h2>
<ul style="list-style:none;padding:0;"><li style="border:1px solid #e0e8e0;border-radius:8px;margin-bottom:10px;overflow:hidden;"><div style="background:#f9fbf9;padding:12px 16px;font-weight:700;color:#2d5428;">[Q?]</div><div style="padding:10px 16px;font-size:14px;line-height:1.6;">[A]</div></li>[exactly 5]</ul>

9. <h2 style="color:${HEADING_COLOR}" id="shop">Shop the gift collection</h2>
<p>[2 sentences. Succulents Box grows its plants in its own California greenhouses and ships with a live plant guarantee. No delivery date or shipping time promises]</p>
${cta}
${formatReferences(fields.references)}${keywordLine(fields)}${additional(fields)}
${buildSharedStyleRules()}

${buildPlantAccuracyRules()}

${buildProductAccuracyRules()}

Start directly with the Updated tag.`;
}

module.exports = { buildGeneralGiftGuidePrompt };
