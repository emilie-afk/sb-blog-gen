process.env.SITE_PASSWORD = 'pw';
const requested = [];
function product(id, handle) {
  return { id, title: 'Product ' + id, handle: handle || 'product-' + id,
    product_type: 'Gift', tags: [], images: [], variants: [{ available: true, price: '8.00' }] };
}
global.fetch = async url => {
  const match = String(url).match(/limit=(\d+)&page=(\d+)/);
  if (!match) throw new Error('unexpected URL ' + url);
  const page = Number(match[2]);
  requested.push(page);
  let products = [];
  if (page === 1) products = Array.from({ length: 250 }, (_, i) => product(i + 1));
  if (page === 2) products = [product(250), product(251)];
  return { ok: true, status: 200, json: async () => ({ products }) };
};
const { handler } = require('../netlify/functions/gift-catalog');
(async () => {
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ token: 'pw', catalogType: 'gift', collection: 'all' }) });
  const body = JSON.parse(response.body);
  if (response.statusCode !== 200) throw new Error('all-products request failed');
  if (!requested.includes(2)) throw new Error('pagination did not continue after a full page');
  if (requested.some(page => page > 5)) throw new Error('pagination did not stop after the short-page batch');
  if (body.count !== 251) throw new Error('cross-page duplicate was not removed: ' + body.count);
  if (!body.products.some(p => p.handle === 'product-251')) throw new Error('later-page product missing');
  if (!body.products.every(p => p.source === 'live-gift-catalog')) throw new Error('gift source label changed');
  console.log('PASS all-products pagination, stopping, deduplication and source labels');
})().catch(err => { console.error('FAIL', err.message); process.exit(1); });
