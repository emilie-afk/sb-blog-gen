// Allowlisted SucculentsBox.com gift collections and the occasion mapping.
// Shared by the browser (collection picker) and the gift-catalog function.
// Only handles in this list may ever be fetched. Nothing here is user supplied.

const DEFAULT_GIFT_COLLECTION = 'succulents-gift-boxes';

const GIFT_COLLECTIONS = [
  { handle: 'succulents-gift-boxes', label: 'Succulent gift boxes' },
  { handle: 'gift', label: 'All gifts' },
  { handle: 'christmas-gift-boxes', label: 'Christmas gift boxes' },
  { handle: 'subscription-boxes', label: 'Subscription boxes' },
  { handle: 'mothers-day', label: "Mother's Day" },
  { handle: 'get-well', label: 'Get well' },
  { handle: 'thank-you', label: 'Thank you' },
  { handle: 'congratulations', label: 'Congratulations' },
  { handle: 'under-50-gifts', label: 'Gifts under $50' }
];

// Public storefront collections used by the Live Plants tab. The broad `all`
// collection is also the source for the Succulents view because the storefront
// does not expose a stable, separate all-succulents handle.
const LIVE_PLANT_COLLECTIONS = [
  { handle: 'all', label: 'All live plants' },
  { handle: 'houseplants', label: 'Houseplants' },
  { handle: 'airplants', label: 'Air plants' },
  { handle: 'cactus-succulents', label: 'Cacti and succulents' }
];

// Conservative occasion to collection mapping. Anything unmatched falls back to
// the default collection. Never guess a handle that is not in GIFT_COLLECTIONS.
const OCCASION_COLLECTION_MAP = {
  'christmas': 'christmas-gift-boxes',
  "mother's day": 'mothers-day',
  'mothers day': 'mothers-day',
  'get well': 'get-well',
  'thank you': 'thank-you',
  'congratulations': 'congratulations',
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
  for (const key of Object.keys(OCCASION_COLLECTION_MAP)) {
    if (text.includes(key)) return OCCASION_COLLECTION_MAP[key];
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
