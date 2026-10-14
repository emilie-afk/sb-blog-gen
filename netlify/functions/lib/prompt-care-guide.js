// Plant Care Guide prompt. This preserves the original ten section care guide
// structure that the tool shipped with. Change it carefully.
const {
  HEADING_COLOR, BRAND_GREEN, buildSharedStyleRules, buildPlantAccuracyRules,
  formatReferences, updatedTag, additional, keywordLine
} = require('./shared-rules');

// Internal links worth using, by the section they belong to. They are listed
// here rather than hard coded into the structure so a section that does not
// apply to this plant does not drag a succulent link into a guide about
// something else.
const LINKS = {
  overwatering: 'https://succulentsbox.com/blogs/blog/overwatered-vs-underwatered',
  succulentSoil: 'https://succulentsbox.com/collections/succulent-tools/products/succulent-potting-soil',
  terracotta: 'https://succulentsbox.com/collections/succulents-pot/products/2-or-4-3-terracotta-pot',
  pruning: 'https://succulentsbox.com/blogs/blog/how-and-when-to-prune-your-succulents',
  winter: 'https://succulentsbox.com/blogs/blog/indoor-outdoor-winter-care-guide-for-succulents',
  toxicity: 'https://succulentsbox.com/blogs/blog/toxic-and-non-toxic-succulents-for-pets'
};

const AIR_PLANT = 'Air plant (Tillandsia)';
const UNSURE = 'Not sure';
const SOIL_GROWN = ['Succulent', 'Cactus', 'Houseplant'];

// Every section that used to assume the plant was a succulent. Three of them
// assumed it grows in soil, so prescribing potting mix, a terracotta pot and
// succulent pruning for a Tillandsia was not a style problem, it was wrong care
// advice. The other three carried succulent-only internal links into guides
// about plants those pages do not cover. All six are routed by plant type.
//
// The three linked pages are succulent specific by their own titles, so they are
// offered only where the linked page genuinely covers the plant and the topic.
// When no suitable link exists the section is still written in full: a missing
// link is never a reason to shorten or drop care advice.
function careSections(plantType, plantName, headingColor) {
  const h3 = `<h3 style="color:${headingColor}">`;
  const soilGrown = SOIL_GROWN.includes(plantType);
  const airPlant = plantType === AIR_PLANT;

  // Watering, Toxicity and Seasonal Care, written without the succulent links
  // for the plant types those pages do not describe. Shared by air plants,
  // houseplants and the unconfirmed case so the three stay consistent.
  const unlinked = {
    watering: `${h3}2. Watering</h3><p>[2-3 sentences, fully written. Describe how ${plantName} is actually watered: how much, how often, and how to tell it has had too much or too little. The succulent overwatering guide does not describe this plant, so do NOT link it. Write the watering advice out in full rather than leaning on a link.]</p>`,
    toxicity: `${h3}5. Toxicity</h3><p>[1-2 sentences, fully written. State what is actually known about ${plantName} and pets or children, and say plainly to check with a vet or the ASPCA where toxicity is not established. The "Toxic and Non-Toxic Succulents for Pets" page covers succulents, not this plant, so do NOT link it. The absence of a link is not a reason to leave the toxicity question unanswered.]</p>`,
    seasonal: `${h3}5. Seasonal Care Tips</h3><ul><li><strong>Fall and Winter:</strong> [1-2 sentences, fully written, on what changes for ${plantName} in the cold months. The succulent winter care guide does not cover this plant, so do NOT link it.]</li><li><strong>Spring &amp; Summer:</strong> [1-2 sentences]</li></ul>`
  };

  if (airPlant) {
    return {
      ...unlinked,
      soil: `${h3}3. Water Uptake &amp; Fertilizer</h3><p>[2-3 sentences. ${plantName} is an air plant: it takes water and nutrients through its leaves, not through roots in soil, and its roots anchor it rather than feed it. Say plainly that no potting mix is involved, then cover how it is watered (soaking or thorough misting, and how long to soak), how completely it must dry afterwards and why, and a diluted bromeliad or air plant fertilizer used sparingly. Do NOT mention potting soil, soil pH as a growing requirement, or a soil link.]</p>`,
      potting: `${h3}1. Drying &amp; Mounting</h3><p>[2-3 sentences. Potting and repotting do not apply to ${plantName}, so say so in one natural clause rather than inventing a substitute requirement. Then cover what does matter: turning it upside down or shaking it out after watering so no water sits in the leaf base, the airflow it needs while drying, and the ways it can be displayed or mounted, such as resting in a dish, set on wood or stone, or wired to a mount. Never suggest burying the base in soil or potting it up.]</p>`,
      pruning: `${h3}2. Trimming &amp; Offsets</h3><p>[2-3 sentences. Cover trimming dried leaf tips and spent flower spikes, then offsets: ${plantName} produces pups around the base after blooming, and they can be separated once they reach roughly a third to half the size of the parent, or left to form a clump. Do not link the succulent pruning guide here, and do not describe succulent stem cutting or beheading.]</p>`
    };
  }

  if (soilGrown) {
    const soilLink = plantType === 'Houseplant'
      ? `Name the potting mix this plant actually wants. Link "Succulent Potting Soil" → ${LINKS.succulentSoil} ONLY if a fast draining gritty mix genuinely suits ${plantName}; if it wants a standard houseplant mix instead, say that and leave the link out.`
      : `Link "Succulent Potting Soil" → ${LINKS.succulentSoil}`;
    // The three succulent pages describe succulents and cacti. A houseplant
    // guide gets the same sections written out, without those links.
    const linked = plantType === 'Houseplant' ? unlinked : {
      watering: `${h3}2. Watering</h3><p>[2-3 sentences. Link "overwatered succulents" → ${LINKS.overwatering}]</p>`,
      toxicity: `${h3}5. Toxicity</h3><p>[1-2 sentences. Link "Toxic and Non-Toxic Succulents for Pets" → ${LINKS.toxicity}]</p>`,
      seasonal: `${h3}5. Seasonal Care Tips</h3><ul><li><strong>Fall and Winter:</strong> [1-2 sentences. Link "Winter Care Guide" → ${LINKS.winter}]</li><li><strong>Spring &amp; Summer:</strong> [1-2 sentences]</li></ul>`
    };
    return {
      ...linked,
      soil: `${h3}3. Soil &amp; Fertilizer</h3><p>[2-3 sentences on the mix and the drainage this plant needs, plus feeding. ${soilLink}]</p>`,
      potting: `${h3}1. Potting &amp; Repotting</h3><p>[2-3 sentences on pot choice, drainage holes and when to repot. Link "Terracotta pot" → ${LINKS.terracotta}]</p>`,
      pruning: `${h3}2. Pruning</h3><p>[2-3 sentences. Link "How and When to Prune" → ${LINKS.pruning} only if this plant is pruned the way succulents are; otherwise describe how ${plantName} is actually trimmed and leave that link out.]</p>`
    };
  }

  // "Not sure". No type was confirmed, so nothing about the growing medium is
  // asserted. The guide stays general rather than guessing a requirement.
  return {
    ...unlinked,
    soil: `${h3}3. Growing Medium &amp; Fertilizer</h3><p>[2-3 sentences. The plant type was NOT confirmed, so do not assert a growing medium you cannot verify. If ${plantName} is grown in a pot of mix, describe the drainage it needs in general terms; if it is an epiphyte or air plant that takes water through its leaves, describe that instead. Where you are not certain, say what the plant needs in terms of drainage and feeding without naming a specific product, and do not use the succulent potting soil link.]</p>`,
    potting: `${h3}1. Potting or Mounting</h3><p>[2-3 sentences. Cover this only in terms the plant type supports. If it grows in a container, cover pot choice, drainage and repotting. If it does not, say that potting does not apply and cover how it is displayed or mounted instead. Do not use the terracotta pot link unless a pot genuinely applies.]</p>`,
    pruning: `${h3}2. Pruning or Trimming</h3><p>[2-3 sentences on how ${plantName} is actually tidied: spent leaves, flower spikes, or stems. Use the succulent pruning link only if succulent pruning genuinely applies.]</p>`
  };
}

function buildCareGuidePrompt(fields) {
  const plantName = fields.plantName;
  const sciName = fields.sciName || '';
  const productUrl = fields.productUrl || '';
  const plantType = fields.plantType || UNSURE;
  const sections = careSections(plantType, plantName, HEADING_COLOR);
  const refsNote = formatReferences(fields.references);
  const buyBtn = productUrl
    ? `<p style="text-align:center;margin:16px 0;"><a href="${productUrl}" style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-weight:700;font-size:15px;">Shop ${plantName}</a></p>`
    : '';

  return `You are a plant care expert writing a blog post for Succulents Box (succulentsbox.com). Generate a complete plant care guide for: ${plantName}${sciName ? ` (${sciName})` : ''}. Return ONLY raw HTML, no markdown, no fences, no explanation.

PLANT TYPE: ${plantType}.
${plantType === UNSURE
  ? `The content team did NOT confirm the plant type. Do not guess one. Where a care instruction depends on the type, either describe what ${plantName} needs in terms general enough to be true, or say plainly that it depends on how the plant is grown. Never assert a growing medium, a pot or a pruning method you cannot support.`
  : `Every care instruction must suit a ${plantType.toLowerCase()}. Do not carry over advice that belongs to a different kind of plant.`}

CARE ACCURACY, these override the section hints below:
- Never prescribe potting soil, a potting mix, a pot, drainage holes or repotting for a plant that does not grow in soil.
- Never describe watering a pot of mix for a plant watered by soaking or misting, and never the reverse.
- Where a section does not apply to this plant, say so in a natural clause and write about what does apply instead. Do not invent a care requirement so that a section has something in it, and do not leave a section out.
- The Basic Information table still needs every row. For a plant with no growing medium, "Soil Type" and "Soil pH" say so plainly, for example "None, grown without soil", rather than naming a mix that is never used.
- Use an internal link only where the linked page genuinely applies. A succulent soil, pot, pruning, overwatering, toxicity or winter care link in a guide about a plant that is none of those things is worse than no link at all.
- Where a section carries no link, write it out in full anyway. A missing link is never a reason to shorten a section, skip the advice or send the reader elsewhere for it.

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
${sections.watering}
${sections.soil}
<h3 style="color:${HEADING_COLOR}">4. Temperature &amp; Humidity</h3><p>[2 sentences with °F ranges]</p>
${sections.toxicity}

6. Extra Care (id="extra-care") — 5 H3 subsections:
<h2 style="color:${HEADING_COLOR}" id="extra-care">Extra Care</h2>
${sections.potting}
${sections.pruning}
<h3 style="color:${HEADING_COLOR}">3. Propagation</h3><p>[2-3 sentences]</p>
<h3 style="color:${HEADING_COLOR}">4. Blooming</h3><p>[2 sentences]</p>
${sections.seasonal}

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
