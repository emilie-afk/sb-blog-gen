// Allowlisted SucculentsBox.com gift collections and the occasion mapping.
// Handles must match the storefront exactly: a renamed Shopify collection
// answers its old handle with a redirect, and the products feed behind a
// redirect is empty. tests/collections-live.check.js checks them against the
// live storefront.
// Shared by the browser (collection picker) and the gift-catalog function.
// Only handles in this list may ever be fetched. Nothing here is user supplied.

const DEFAULT_GIFT_COLLECTION = 'plant-gift-boxes';

const GIFT_COLLECTIONS = [
  { handle: 'all', label: 'All products' },
  { handle: 'plant-gift-boxes', label: 'Plant gift boxes' },
  { handle: 'gift', label: 'All gifts' },
  { handle: 'christmas-gift-boxes', label: 'Christmas gift boxes' },
  { handle: 'subscription-boxes', label: 'Subscription boxes' },
  { handle: 'plant-gifts-for-mom', label: "Mother's Day and gifts for Mom" },
  { handle: 'get-well', label: 'Get well' },
  { handle: 'thank-you-plant-gifts', label: 'Thank you' },
  { handle: 'congratulations-plant-gifts', label: 'Congratulations' },
  { handle: 'plant-gifts-under-30', label: 'Gifts under $30' },
  { handle: 'plant-gifts-30-60', label: 'Gifts $30 to $60' },
  { handle: 'birthday-plant-gifts', label: 'Birthday' },
  { handle: 'anniversary-plant-gifts', label: 'Anniversary' },
  { handle: 'wedding-plant-gifts', label: 'Wedding' },
  { handle: 'new-baby-plant-gifts', label: 'New baby' },
  { handle: 'housewarming-plant-gifts', label: 'Housewarming' },
  { handle: 'graduation-plant-gifts', label: 'Graduation' },
  { handle: 'valentines-day-gift-boxes', label: "Valentine's Day" },
  { handle: 'holiday-succulent-gifts', label: 'Holiday' },
  { handle: 'sympathy-memorial-plant-gifts', label: 'Sympathy and memorial' },
  { handle: 'im-sorry-plant-gifts', label: "I'm sorry" },
  { handle: 'just-because-plant-gifts', label: 'Just because and thinking of you' }
];

// Public storefront collections used by the Live Plants tab. The broad `all`
// collection is also the source for the Succulents view because the storefront
// does not expose a stable, separate all-succulents handle.
const LIVE_PLANT_COLLECTIONS = [
  { handle: 'all', label: 'All live plants' },
  { handle: 'houseplants', label: 'Houseplants' },
  { handle: 'air-plants-tillandsias', label: 'Air plants' },
  { handle: 'cactus-succulents', label: 'Cacti and succulents' }
];

// Conservative occasion to collection mapping. Anything unmatched falls back to
// the default collection. Never guess a handle that is not in GIFT_COLLECTIONS.
// Keys are matched at the start of a word in the occasion text, IN THIS ORDER, so:
//   1. Sensitive occasions come first. A brief that mentions sympathy,
//      remembrance, a memorial, condolence or bereavement always gets the
//      sympathy collection, even when it also names a celebration
//      ("holiday remembrance", "Christmas memorial", "anniversary of a loss").
//   2. Then a more specific key before a broader one ("christmas" before
//      "holiday", "anniversary" before "wedding").
const OCCASION_COLLECTION_MAP = {
  'sympathy': 'sympathy-memorial-plant-gifts',
  'condolence': 'sympathy-memorial-plant-gifts',
  'remembrance': 'sympathy-memorial-plant-gifts',
  'memorial': 'sympathy-memorial-plant-gifts',
  'bereavement': 'sympathy-memorial-plant-gifts',
  'in memory': 'sympathy-memorial-plant-gifts',
  'loss': 'sympathy-memorial-plant-gifts',
  'funeral': 'sympathy-memorial-plant-gifts',
  'christmas': 'christmas-gift-boxes',
  'valentine': 'valentines-day-gift-boxes',
  'holiday': 'holiday-succulent-gifts',
  'birthday': 'birthday-plant-gifts',
  'anniversary': 'anniversary-plant-gifts',
  'wedding': 'wedding-plant-gifts',
  'bridal': 'wedding-plant-gifts',
  'new baby': 'new-baby-plant-gifts',
  'baby shower': 'new-baby-plant-gifts',
  'housewarming': 'housewarming-plant-gifts',
  'new home': 'housewarming-plant-gifts',
  'graduation': 'graduation-plant-gifts',
  "i'm sorry": 'im-sorry-plant-gifts',
  'im sorry': 'im-sorry-plant-gifts',
  'apology': 'im-sorry-plant-gifts',
  'thinking of you': 'just-because-plant-gifts',
  'just because': 'just-because-plant-gifts',
  "mother's day": 'plant-gifts-for-mom',
  'mothers day': 'plant-gifts-for-mom',
  'get well': 'get-well',
  'thank you': 'thank-you-plant-gifts',
  'congratulations': 'congratulations-plant-gifts',
  'subscription': 'subscription-boxes'
};

function isAllowedCollection(handle) {
  return GIFT_COLLECTIONS.some(c => c.handle === handle);
}

function isAllowedLivePlantCollection(handle) {
  return LIVE_PLANT_COLLECTIONS.some(c => c.handle === handle);
}

// Returns an allowlisted handle for a free-text occasion, or the default.
function collectionForOccasion(occasion) {
  const text = String(occasion || '').toLowerCase().trim();
  if (!text) return DEFAULT_GIFT_COLLECTION;
  // A key matches only at the start of a word, so "loss" does not match
  // "glossy" while "holiday" still matches "holidays".
  for (const key of Object.keys(OCCASION_COLLECTION_MAP)) {
    const at = text.indexOf(key);
    for (let i = at; i !== -1; i = text.indexOf(key, i + 1)) {
      if (i === 0 || !/[a-z0-9]/.test(text[i - 1])) return OCCASION_COLLECTION_MAP[key];
    }
  }
  return DEFAULT_GIFT_COLLECTION;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GIFT_COLLECTIONS, LIVE_PLANT_COLLECTIONS, OCCASION_COLLECTION_MAP,
    DEFAULT_GIFT_COLLECTION, isAllowedCollection, isAllowedLivePlantCollection,
    collectionForOccasion
  };
}
