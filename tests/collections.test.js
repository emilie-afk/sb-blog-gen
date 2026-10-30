// Occasion to collection mapping and the collection allowlist (offline).
// The live storefront check is tests/collections-live.check.js.
// Run: node tests/collections.test.js
const g = require('../data/gift-collections');
let failures = 0;
const ok = (name, cond, extra) => { if (cond) console.log('PASS ' + name); else { failures++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + extra : '')); } };

ok('every mapped collection is allowlisted', Object.values(g.OCCASION_COLLECTION_MAP).every(g.isAllowedCollection));
ok('the default collection is allowlisted', g.isAllowedCollection(g.DEFAULT_GIFT_COLLECTION));
ok('no renamed handle remains', !['succulents-gift-boxes', 'mothers-day', 'thank-you', 'congratulations', 'under-50-gifts'].some(g.isAllowedCollection)
  && !g.isAllowedLivePlantCollection('airplants'));
const cases = {
  'Birthday': 'birthday-plant-gifts', 'Happy Birthday Mom': 'birthday-plant-gifts',
  'Christmas': 'christmas-gift-boxes', 'Christmas holiday': 'christmas-gift-boxes', 'Holiday party': 'holiday-succulent-gifts',
  "Valentine's Day": 'valentines-day-gift-boxes', 'Wedding anniversary': 'anniversary-plant-gifts', 'Wedding': 'wedding-plant-gifts',
  'Baby shower': 'new-baby-plant-gifts', 'Moving into a new home': 'housewarming-plant-gifts', 'Graduation': 'graduation-plant-gifts',
  'Pregnancy and Infant Loss Remembrance Day': 'sympathy-memorial-plant-gifts', 'Sympathy': 'sympathy-memorial-plant-gifts',
  "I'm sorry": 'im-sorry-plant-gifts', 'Thinking of you': 'just-because-plant-gifts', "Mother's Day": 'plant-gifts-for-mom',
  'Thank you': 'thank-you-plant-gifts', 'Congratulations': 'congratulations-plant-gifts', 'Get well soon': 'get-well',
  "National Boss's Day": g.DEFAULT_GIFT_COLLECTION, '': g.DEFAULT_GIFT_COLLECTION,
  // Sensitive wording wins over any celebration it is combined with.
  'Holiday remembrance': 'sympathy-memorial-plant-gifts', 'Christmas memorial': 'sympathy-memorial-plant-gifts',
  'Anniversary of a loss': 'sympathy-memorial-plant-gifts', 'Birthday in memory of Dad': 'sympathy-memorial-plant-gifts',
  'Valentine condolence': 'sympathy-memorial-plant-gifts', 'Wedding day bereavement': 'sympathy-memorial-plant-gifts',
  'Funeral': 'sympathy-memorial-plant-gifts',
  // Keys match at the start of a word only.
  'Glossy leaf gifts': g.DEFAULT_GIFT_COLLECTION, 'Holidays': 'holiday-succulent-gifts', 'Birthdays': 'birthday-plant-gifts'
};
const keys = Object.keys(g.OCCASION_COLLECTION_MAP);
const lastSensitive = Math.max(...keys.map((k, i) => g.OCCASION_COLLECTION_MAP[k] === 'sympathy-memorial-plant-gifts' ? i : -1));
const firstOther = keys.findIndex(k => g.OCCASION_COLLECTION_MAP[k] !== 'sympathy-memorial-plant-gifts');
ok('every sympathy key is checked before any celebratory key', lastSensitive < firstOther, `${lastSensitive} vs ${firstOther}`);
for (const [occasion, want] of Object.entries(cases)) {
  const got = g.collectionForOccasion(occasion);
  ok(`"${occasion}" -> ${want}`, got === want, got);
}
console.log(`\n${failures} failures`);
if (failures) process.exitCode = 1;
