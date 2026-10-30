// LIVE CHECK, not part of tests/run.sh because it needs the network.
// Confirms every collection handle the app uses still exists on the storefront
// under that exact handle and has products. A collection renamed in Shopify
// answers its old handle with a 301 and its old products feed with an empty
// list, which the app would show as "no products" without any error.
//
// Run: node tests/collections-live.check.js
const { GIFT_COLLECTIONS, LIVE_PLANT_COLLECTIONS, OCCASION_COLLECTION_MAP, DEFAULT_GIFT_COLLECTION } = require('../data/gift-collections');

const STORE = 'https://succulentsbox.com';
const handles = [...new Set([
  DEFAULT_GIFT_COLLECTION,
  ...GIFT_COLLECTIONS.map(c => c.handle),
  ...LIVE_PLANT_COLLECTIONS.map(c => c.handle),
  ...Object.values(OCCASION_COLLECTION_MAP)
])];

(async () => {
  let failures = 0;
  for (const h of handles) {
    const page = await fetch(`${STORE}/collections/${h}`, { redirect: 'manual' });
    const feed = await fetch(`${STORE}/collections/${h}/products.json?limit=1`);
    const count = feed.ok ? ((await feed.json()).products || []).length : 0;
    const moved = page.status >= 300 && page.status < 400 ? page.headers.get('location') : '';
    const ok = page.status === 200 && count > 0;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${h} :: page ${page.status}${moved ? ' -> ' + moved : ''}, products ${count > 0 ? 'yes' : 'none'}`);
  }
  console.log(`\n${failures} failures of ${handles.length}`);
  if (failures) process.exitCode = 1;
})();
