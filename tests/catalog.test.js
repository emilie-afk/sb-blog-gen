// Live storefront catalog contract: allowlists, source labels and safe fallback.
const H = require('./support/harness');
const WHO = H.newSession();
// Sessions are checked against the revocation store on every request.
H.useMemoryStores();
const calls = [];
global.fetch = async url => {
  calls.push(url);
  return {
    ok: true,
    json: async () => ({ products: [{
      id: calls.length, title: 'Test Product', handle: 'test-product',
      product_type: 'Plant', tags: ['test'], images: [],
      variants: [{ available: true, price: '8.00' }]
    }] })
  };
};
const { handler } = require('../netlify/functions/gift-catalog');
const invoke = body => handler(H.event(body, { as: WHO }));

(async () => {
  let response = await invoke({ catalogType: 'plants', collection: 'houseplants' });
  let body = JSON.parse(response.body);
  if (response.statusCode !== 200 || body.products[0].source !== 'live-plant-catalog') throw new Error('plant source was not preserved');
  if (!calls[0].includes('/collections/houseplants/products.json')) throw new Error('allowlisted plant collection was not fetched');

  response = await invoke({ catalogType: 'plants', collection: 'https://evil.example/products' });
  body = JSON.parse(response.body);
  if (body.collection !== 'all' || body.collectionSource !== 'rejected_request') throw new Error('unsafe plant handle was not rejected');
  if (!calls[1].includes('/collections/all/products.json')) throw new Error('unsafe plant handle did not fall back safely');

  response = await invoke({ catalogType: 'gift', collection: 'gift' });
  body = JSON.parse(response.body);
  if (body.products[0].source !== 'live-gift-catalog') throw new Error('gift source was not preserved');
  // The products are public storefront data, but the endpoint still makes
  // outbound requests, so it is not an open proxy.
  const before = calls.length;
  response = await handler(H.event({ catalogType: 'gift' }));
  if (response.statusCode !== 401 || calls.length !== before) throw new Error('an unauthenticated catalog call was served or fetched');
  response = await handler(H.event({ catalogType: 'gift' }, { as: WHO, csrf: false }));
  if (response.statusCode !== 403 || calls.length !== before) throw new Error('a catalog call without the CSRF header was served or fetched');
  console.log('PASS live gift and plant catalogs are allowlisted and source-labelled');
  console.log('PASS the catalog refuses callers without a session or CSRF value, before fetching anything');
})().catch(err => { console.error('FAIL', err.message); process.exit(1); });
