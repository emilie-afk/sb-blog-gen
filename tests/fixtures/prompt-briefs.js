// Synthetic briefs covering every branch the prompt builders take: each plant
// type, each gift angle, priced and unpriced products, one to eight
// recommendations, dated and undated occasions, sensitive mode, every optional
// field on and off.
//
// Nothing here is real. The plant names are common ones, the products are
// invented, every URL is on example.com, and no brief was copied from a real
// article or a real content request. These briefs are inputs; they contain no
// prompt content, so they are safe in a public repository.
//
// Used by tools/pack-parity.js, which proves a prompt pack renders exactly what
// the pre-migration code did, and by tests/prompt-pack.test.js.

const PLANT_TYPES = ['Succulent', 'Cactus', 'Air plant (Tillandsia)', 'Houseplant', 'Not sure'];
const PLANT_FOR_TYPE = {
  'Succulent': 'Echeveria Lola',
  'Cactus': 'Golden Barrel Cactus',
  'Air plant (Tillandsia)': 'Tillandsia Ionantha',
  'Houseplant': 'Pothos',
  'Not sure': 'Mixed Plant Assortment'
};

// Taken from the validator so the fixtures can never drift from the options
// the form actually offers.
const { GIFT_ANGLES } = require('../../netlify/functions/lib/validate');

function product(n, priced) {
  return {
    title: `Example Gift ${n}`,
    url: `https://example.com/products/example-gift-${n}`,
    price: priced ? `$${(20 + n * 3).toFixed(2)}` : '',
    productType: n % 2 ? 'Arrangement' : 'Gift box',
    description: n % 3 ? `A synthetic description for example gift ${n}, written only for tests.` : '',
    tags: n % 2 ? ['synthetic', `tag-${n}`] : [],
    notes: n % 4 === 0 ? `Synthetic confirmed note ${n}.` : '',
    source: 'manual'
  };
}

const REFS = [
  { url: 'https://example.com/reference-one', text: 'Example Reference One' },
  { url: 'https://example.com/reference-two', text: 'Example Reference Two' }
];

function careGuideBriefs() {
  const out = [];
  for (const type of PLANT_TYPES) {
    for (const sci of [false, true]) {
      for (const productUrl of [false, true]) {
        for (const extras of [0, 1, 2]) {
          out.push({
            articleType: 'care_guide',
            fields: {
              plantName: PLANT_FOR_TYPE[type],
              plantType: type,
              sciName: sci ? 'Exempla botanica' : '',
              productUrl: productUrl ? 'https://example.com/products/example-plant' : '',
              references: extras === 2 ? REFS : extras === 1 ? REFS.slice(0, 1) : [],
              primaryKeyword: extras >= 1 ? 'example plant care' : '',
              additionalInstructions: extras === 2 ? 'Synthetic extra instruction for the test.' : '',
              titleDirection: extras === 2 ? 'Synthetic title direction.' : ''
            }
          });
        }
      }
    }
  }
  // An older page that sends no plant type at all.
  out.push({ articleType: 'care_guide', fields: { plantName: 'Haworthia' } });
  return out;
}

function singlePlantBriefs() {
  const out = [];
  GIFT_ANGLES.forEach((angle, i) => {
    for (const full of [false, true]) {
      out.push({
        articleType: 'single_plant_gift',
        fields: {
          plantName: Object.values(PLANT_FOR_TYPE)[i % 5],
          giftAngle: angle,
          customGiftAngle: angle === 'Custom angle' ? 'A synthetic custom angle.' : '',
          sciName: full ? 'Exempla botanica' : '',
          productUrl: full ? 'https://example.com/products/example-plant' : '',
          recipient: full ? 'Coworker' : '',
          occasion: full ? 'Birthday' : '',
          careConsiderations: full ? 'Synthetic care consideration.' : '',
          productNotes: full ? 'Synthetic product note.' : '',
          references: full ? REFS : [],
          primaryKeyword: full ? 'example gift' : '',
          additionalInstructions: full ? 'Synthetic extra instruction.' : '',
          titleDirection: full ? 'Synthetic direction.' : ''
        }
      });
    }
  });
  return out;
}

function listBriefs(articleType) {
  const out = [];
  for (let count = 1; count <= 8; count++) {
    for (const variant of [0, 1, 2, 3]) {
      const priced = variant !== 1;
      const products = Array.from({ length: Math.max(count, 2) }, (_, i) => product(i + 1, priced));
      const fields = {
        selectedProducts: products,
        numberOfRecommendations: count,
        recipient: variant >= 2 ? 'Teacher' : '',
        budgetRange: variant === 3 ? 'Under $50' : '',
        giftCharacteristics: variant >= 2 ? ['Low maintenance', 'Pet friendly'] : [],
        customCharacteristic: variant === 3 ? 'A synthetic custom requirement' : '',
        collectionUrl: variant % 2 ? 'https://example.com/collections/example' : '',
        references: variant === 3 ? REFS : [],
        primaryKeyword: variant >= 2 ? 'example gifts' : '',
        additionalInstructions: variant === 3 ? 'Synthetic extra instruction.' : '',
        titleDirection: variant === 2 ? 'Synthetic direction.' : ''
      };
      if (variant === 3) fields.giftCharacteristics.push('Custom requirement');
      if (articleType === 'occasion_gift_guide') {
        fields.occasion = ['Christmas', "Mother's Day", 'Graduation', 'Sympathy'][variant];
        fields.occasionYear = variant % 2 ? '2026' : '';
        fields.occasionDate = variant === 2 ? 'December 25, 2026' : '';
        fields.relationship = variant >= 1 ? 'Friend' : '';
        fields.includeYearInTitle = variant === 1;
        fields.sensitiveOccasion = variant === 3 || (variant === 1 && count % 2 === 0);
      }
      out.push({ articleType, fields });
    }
  }
  return out;
}

function allBriefs() {
  return [
    ...careGuideBriefs(),
    ...singlePlantBriefs(),
    ...listBriefs('general_gift_guide'),
    ...listBriefs('occasion_gift_guide')
  ];
}

module.exports = { allBriefs, careGuideBriefs, singlePlantBriefs, listBriefs, PLANT_TYPES, PLANT_FOR_TYPE, product };
