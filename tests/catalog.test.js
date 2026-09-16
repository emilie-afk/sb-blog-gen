// Live storefront catalog contract: allowlists, source labels and safe fallback.
process.env.SITE_PASSWORD = 'pw';
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
const invoke = body => handler({ httpMethod: 'POST', body: JSON.stringify(Object.assign({ token: 'pw' }, body)) });

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
  console.log('PASS live gift and plant catalogs are allowlisted and source-labelled');
})().catch(err => { console.error('FAIL', err.message); process.exit(1); });
