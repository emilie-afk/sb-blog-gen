// Plant Care Guide prompt.
//
// The ten-section care guide template and every section's wording live in the
// private prompt pack. This file keeps the part that is application logic: which
// section variant a plant type selects, which internal links a variant may
// carry, and the values filled into the template.
//
// PLANT-TYPE ROUTING. Six sections used to assume every plant was a succulent.
// Soil, Potting and Pruning assumed it grows in soil, which is wrong care advice
// for an air plant. Watering, Toxicity and Seasonal Care carried succulent-only
// links into guides about plants those pages do not cover. All six are routed
// here:
//
//   Succulent, Cactus  soil-grown sections, with the succulent links
//   Houseplant         soil-grown soil/potting/pruning, unlinked watering,
//                      toxicity and seasonal care
//   Air plant          air-plant sections throughout, no succulent links
//   Not sure           general sections that assert no growing medium,
//                      no succulent links
//
// When no suitable link exists the section is still written in full: a missing
// link is never a reason to shorten or drop care advice.

const {
  HEADING_COLOR, BRAND_GREEN, buildSharedStyleRules, buildPlantAccuracyRules,
  formatReferences, updatedTag, additional, keywordLine
} = require('./shared-rules');

// Public pages on succulentsbox.com. They are not confidential, and keeping them
// in source means a broken or renamed page is fixed with a code review rather
// than a prompt-pack release.
const LINKS = {
  overwatering: 'https://succulentsbox.com/blogs/blog/overwatered-vs-underwatered',
  succulentSoil: 'https://succulentsbox.com/collections/succulent-tools/products/succulent-potting-soil',
  // The single terracotta pot product was removed from the store; link the pots collection.
  terracotta: 'https://succulentsbox.com/collections/succulents-pot',
  pruning: 'https://succulentsbox.com/blogs/blog/how-and-when-to-prune-your-succulents',
  winter: 'https://succulentsbox.com/blogs/blog/indoor-outdoor-winter-care-guide-for-succulents',
  toxicity: 'https://succulentsbox.com/blogs/blog/toxic-and-non-toxic-succulents-for-pets'
};

const AIR_PLANT = 'Air plant (Tillandsia)';
const UNSURE = 'Not sure';
const SOIL_GROWN = ['Succulent', 'Cactus', 'Houseplant'];
const SUCCULENT_LINKED = ['Succulent', 'Cactus'];

// Which section variants a plant type selects. Exported so the structural tests
// can check the routing without needing any real prompt content.
function sectionRoute(plantType) {
  if (plantType === AIR_PLANT) {
    return { linkedCare: false, growing: 'airPlant' };
  }
  if (SOIL_GROWN.includes(plantType)) {
    return { linkedCare: SUCCULENT_LINKED.includes(plantType), growing: 'soilGrown' };
  }
  return { linkedCare: false, growing: 'unconfirmed' };
}

// Each section template is given only the values it is allowed to use. A link
// is passed to a section only when that section may carry it, so the routing is
// enforced here and not left to the pack: a pack that wrote the succulent
// overwatering link into the air-plant watering section would fail to render
// ("unknown value"), rather than send a succulent link into an air-plant guide.
function careSections(pack, plantType, plantName) {
  const h3 = `<h3 style="color:${HEADING_COLOR}">`;
  const route = sectionRoute(plantType);
  const plain = { h3, plantName };

  const sections = route.linkedCare
    ? {
        watering: pack.render('careGuide.sections.linked.watering', { h3, plantName, overwateringLink: LINKS.overwatering }),
        toxicity: pack.render('careGuide.sections.linked.toxicity', { h3, plantName, toxicityLink: LINKS.toxicity }),
        seasonal: pack.render('careGuide.sections.linked.seasonal', { h3, plantName, winterLink: LINKS.winter })
      }
    : {
        watering: pack.render('careGuide.sections.unlinked.watering', plain),
        toxicity: pack.render('careGuide.sections.unlinked.toxicity', plain),
        seasonal: pack.render('careGuide.sections.unlinked.seasonal', plain)
      };

  if (route.growing === 'soilGrown') {
    const soilLink = plantType === 'Houseplant'
      ? pack.render('careGuide.sections.soilGrown.soilLinkHouseplant', { plantName, succulentSoilLink: LINKS.succulentSoil })
      : pack.render('careGuide.sections.soilGrown.soilLinkStandard', { succulentSoilLink: LINKS.succulentSoil });
    sections.soil = pack.render('careGuide.sections.soilGrown.soil', { h3, plantName, soilLink });
    sections.potting = pack.render('careGuide.sections.soilGrown.potting', { h3, plantName, terracottaLink: LINKS.terracotta });
    sections.pruning = pack.render('careGuide.sections.soilGrown.pruning', { h3, plantName, pruningLink: LINKS.pruning });
    return sections;
  }

  // Air plants and unconfirmed types get no internal links at all in these
  // three sections.
  const set = `careGuide.sections.${route.growing}`;
  sections.soil = pack.render(`${set}.soil`, plain);
  sections.potting = pack.render(`${set}.potting`, plain);
  sections.pruning = pack.render(`${set}.pruning`, plain);
  return sections;
}

function buildCareGuidePrompt(fields, pack) {
  const plantName = fields.plantName;
  const sciName = fields.sciName || '';
  const productUrl = fields.productUrl || '';
  const plantType = fields.plantType || UNSURE;
  const sections = careSections(pack, plantType, plantName);
  const buyBtn = productUrl
    ? `<p style="text-align:center;margin:16px 0;"><a href="${productUrl}" style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-weight:700;font-size:15px;">Shop ${plantName}</a></p>`
    : '';

  const plantTypeRule = plantType === UNSURE
    ? pack.render('careGuide.plantTypeUnconfirmed', { plantName })
    : pack.render('careGuide.plantTypeConfirmed', { plantTypeLower: plantType.toLowerCase() });

  return pack.render('careGuide.document', {
    plantName,
    sciSuffix: sciName ? ` (${sciName})` : '',
    plantType,
    plantTypeRule,
    updatedTag: updatedTag(),
    productUrlOrNone: productUrl || 'none',
    headingColor: HEADING_COLOR,
    brandGreen: BRAND_GREEN,
    watering: sections.watering,
    soil: sections.soil,
    toxicity: sections.toxicity,
    potting: sections.potting,
    pruning: sections.pruning,
    seasonal: sections.seasonal,
    buyBtn,
    refsNote: formatReferences(pack, fields.references),
    keywordLine: keywordLine(pack, fields),
    additional: additional(pack, fields),
    styleRules: buildSharedStyleRules(pack),
    plantAccuracy: buildPlantAccuracyRules(pack)
  });
}

module.exports = { buildCareGuidePrompt, sectionRoute, LINKS, AIR_PLANT, UNSURE };
