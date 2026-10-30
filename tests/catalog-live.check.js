// LIVE CHECK, not part of tests/run.sh because it needs the network.
// Every product in data/catalog.js must still exist on the storefront under the
// same handle, with the same name, the same price and an image that belongs to
// that product. A product the store removed, renamed or repriced would
// otherwise be recommended with a dead link or a wrong price.
//
// The price is chosen with the app's own rule (gift-catalog pickPrice: the
// lowest available variant, else the lowest variant), so this check and the
// live gift catalog can never disagree about what a product costs.
//
// Run: node tests/catalog-live.check.js
const { CATALOG } = require('../data/catalog');
const { pickPrice } = require('../netlify/functions/gift-catalog')._internals;
const STORE = 'https://succulentsbox.com';
const pause = ms => new Promise(r => setTimeout(r, ms));   // the storefront rate-limits bursts

// Image URLs are compared without protocol and query string: the storefront
// serves "//cdn.shopify.com/...?v=123" for the same file we store as https.
const imageKey = u => String(u || '').replace(/^https?:/, '').replace(/^\/\//, '').split('?')[0];

// The .js endpoint gives variant prices in cents; pickPrice expects the
// products.json shape, in dollars.
function livePrice(product) {
  const variants = (product.variants || []).map(v => Object.assign({}, v, {
    price: v.price == null ? v.price : v.price / 100,
    compare_at_price: v.compare_at_price == null ? v.compare_at_price : v.compare_at_price / 100
  }));
  return pickPrice(variants).price;
}

async function getProduct(handle) {
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    await pause(attempt ? 5000 * attempt : 600);
    res = await fetch(`${STORE}/products/${handle}.js`);
    if (res.status !== 429) break;
  }
  return res;
}

if (require.main === module) {
  (async () => {
    let failures = 0;
    const seen = new Set();
    for (const p of CATALOG) {
      if (seen.has(p.h)) { failures++; console.log(`FAIL ${p.h} :: listed twice`); continue; }
      seen.add(p.h);
      const res = await getProduct(p.h);
      if (res.status !== 200) { failures++; console.log(`FAIL ${p.h} :: product page ${res.status}`); continue; }
      const live = await res.json();
      const problems = [];
      if (live.title !== p.t) problems.push(`name is "${live.title}" on the store, "${p.t}" here`);
      const price = livePrice(live);
      if (price !== p.p) problems.push(`price is ${price} on the store, ${p.p} here`);
      const images = (live.images || []).map(imageKey);
      if (!images.includes(imageKey(p.i))) problems.push('image is not one of this product\'s images');
      else {
        const img = await fetch(p.i, { method: 'HEAD' });
        if (img.status !== 200) problems.push(`image ${img.status}`);
      }
      if (!live.available) problems.push('sold out (warning only)');
      const hard = problems.filter(x => !/warning only/.test(x));
      if (hard.length) failures++;
      console.log(`${hard.length ? 'FAIL' : 'PASS'} ${p.h}${problems.length ? ' :: ' + problems.join('; ') : ''}`);
    }
    console.log(`\n${failures} failures of ${CATALOG.length}`);
    if (failures) process.exitCode = 1;
  })();
}

module.exports = { livePrice, imageKey, getProduct };
