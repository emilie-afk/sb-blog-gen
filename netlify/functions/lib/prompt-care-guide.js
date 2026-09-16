// Plant Care Guide prompt. This preserves the original ten section care guide
// structure that the tool shipped with. Change it carefully.
const {
  HEADING_COLOR, BRAND_GREEN, buildSharedStyleRules, buildPlantAccuracyRules,
  formatReferences, updatedTag, additional, keywordLine
} = require('./shared-rules');

function buildCareGuidePrompt(fields) {
  const plantName = fields.plantName;
  const sciName = fields.sciName || '';
  const productUrl = fields.productUrl || '';
  const refsNote = formatReferences(fields.references);
  const buyBtn = productUrl
    ? `<p style="text-align:center;margin:16px 0;"><a href="${productUrl}" style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-weight:700;font-size:15px;">Shop ${plantName}</a></p>`
    : '';

  return `You are a plant care expert writing a blog post for Succulents Box (succulentsbox.com). Generate a complete plant care guide for: ${plantName}${sciName ? ` (${sciName})` : ''}. Return ONLY raw HTML, no markdown, no fences, no explanation.

EXACT STRUCTURE:

1. Updated tag + 2-sentence intro:
${updatedTag()}
<p>[2-sentence intro. If a product URL is provided (${productUrl || 'none'}), hyperlink the plant name to it]</p>

3. Basic Information (id="basic-information") — 12-row table: Botanical Name, Family, Plant Type, Mature Size, Sun Exposure, Soil Type, Soil pH, Bloom Time, Flower, Hardiness Zones, Native Area, Toxicity:
<h2 style="color:${HEADING_COLOR}" id="basic-information">Basic Information</h2>
<table style="border-collapse:collapse;width:100%;margin:12px 0;"><tr><th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Feature</th><th style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;">Details</th></tr>[12 rows — td style="border:1px solid #dde;padding:8px 12px;"]</table>

4. Indoors vs Outdoors (id="indoors-vs-outdoors"):
<h2 style="color:${HEADING_COLOR}" id="indoors-vs-outdoors">Should we grow ${plantName} indoors or outdoors?</h2>
<p><strong>Indoors</strong>, [2 sentences]</p><p><strong>Outdoors</strong>, [2 sentences]</p>

5. General Care (id="general-care") — 5 H3 subsections:
<h2 style="color:${HEADING_COLOR}" id="general-care">General Care</h2>
<h3 style="color:${HEADING_COLOR}">1. Lighting</h3><p>[2-3 sentences]</p>
<h3 style="color:${HEADING_COLOR}">2. Watering</h3><p>[2-3 sentences. Link "overwatered succulents" → https://succulentsbox.com/blogs/blog/overwatered-vs-underwatered]</p>
<h3 style="color:${HEADING_COLOR}">3. Soil &amp; Fertilizer</h3><p>[2 sentences. Link "Succulent Potting Soil" → https://succulentsbox.com/collections/succulent-tools/products/succulent-potting-soil]</p>
<h3 style="color:${HEADING_COLOR}">4. Temperature &amp; Humidity</h3><p>[2 sentences with °F ranges]</p>
<h3 style="color:${HEADING_COLOR}">5. Toxicity</h3><p>[1-2 sentences. Link "Toxic and Non-Toxic Succulents for Pets" → https://succulentsbox.com/blogs/blog/toxic-and-non-toxic-succulents-for-pets]</p>

6. Extra Care (id="extra-care") — 5 H3 subsections:
<h2 style="color:${HEADING_COLOR}" id="extra-care">Extra Care</h2>
<h3 style="color:${HEADING_COLOR}">1. Potting &amp; Repotting</h3><p>[2 sentences. Link "Terracotta pot" → https://succulentsbox.com/collections/succulents-pot/products/2-or-4-3-terracotta-pot]</p>
<h3 style="color:${HEADING_COLOR}">2. Pruning</h3><p>[2 sentences. Link "How and When to Prune" → https://succulentsbox.com/blogs/blog/how-and-when-to-prune-your-succulents]</p>
<h3 style="color:${HEADING_COLOR}">3. Propagation</h3><p>[2-3 sentences]</p>
<h3 style="color:${HEADING_COLOR}">4. Blooming</h3><p>[2 sentences]</p>
<h3 style="color:${HEADING_COLOR}">5. Seasonal Care Tips</h3><ul><li><strong>Fall and Winter:</strong> [1-2 sentences. Link "Winter Care Guide" → https://succulentsbox.com/blogs/blog/indoor-outdoor-winter-care-guide-for-succulents]</li><li><strong>Spring &amp; Summer:</strong> [1-2 sentences]</li></ul>

7. Common Problems (id="common-problems"):
<h2 style="color:${HEADING_COLOR}" id="common-problems">Common Problems</h2><p>[2-3 sentences]</p>${buyBtn}

8. Tips (id="tips") — exactly 5 bullet points:
<h2 style="color:${HEADING_COLOR}" id="tips">Succulents Box's Tips</h2><ul><li>[tip]</li>[5 total]</ul>

9. Q&A (id="qa") — exactly 5 styled Q&As:
<h2 style="color:${HEADING_COLOR}" id="qa">Q&amp;A for ${plantName}</h2>
<ul style="list-style:none;padding:0;"><li style="border:1px solid #e0e8e0;border-radius:8px;margin-bottom:10px;overflow:hidden;"><div style="background:#f9fbf9;padding:12px 16px;font-weight:700;color:#2d5428;">[Q?]</div><div style="padding:10px 16px;font-size:14px;line-height:1.6;">[A]</div></li>[5 total]</ul>

10. Where to Buy (id="where-to-buy"):
<h2 style="color:${HEADING_COLOR}" id="where-to-buy">Where to buy ${plantName} online?</h2>
<p>If you're looking to buy ${plantName} online, <strong>Succulents Box</strong> is one of the top sources for succulents and houseplants in the U.S., with our own greenhouses in California. We ship directly to your door with a live plant guarantee.</p>
${buyBtn}
<p>We also offer a wide variety of <a href="https://succulentsbox.com/collections/succulents" style="color:${BRAND_GREEN};">succulents and houseplants</a> to pair with ${plantName}. Visit <a href="https://succulentsbox.com" style="color:${BRAND_GREEN};">Succulents Box</a> to explore our full collection.</p>
${refsNote}${keywordLine(fields)}${additional(fields)}
${buildSharedStyleRules()}

${buildPlantAccuracyRules()}

RULES: Only raw HTML. No placeholders. Every section fully written. Start directly with the Updated tag.`;
}

module.exports = { buildCareGuidePrompt };
