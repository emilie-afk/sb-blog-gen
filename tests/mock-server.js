// Local test server: serves the static site and mocks the three Netlify functions.
// MOCK_MODE: '' | 'giftfail' | 'timeout504' | 'text502' | 'warn'
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = require('path').join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function mode() { return fs.existsSync('/tmp/mock-mode') ? fs.readFileSync('/tmp/mock-mode', 'utf8').trim() : ''; }

const GIFT_PRODUCTS = [
  { id: 1, title: 'Thinking of You Gift Box', handle: 'thinking-of-you-gift-box', url: 'https://succulentsbox.com/products/thinking-of-you-gift-box', price: '$47.99', image: '', productType: 'Gift', tags: ['standard-8.85'], description: 'A box.', sourceCollection: 'succulents-gift-boxes', source: 'live-gift-catalog' },
  { id: 2, title: 'Christmas Succulent Gift Box', handle: 'christmas-succulent-gift-box', url: 'https://succulentsbox.com/products/christmas-succulent-gift-box', price: '$54.00', image: '', productType: 'Gift', tags: ['holiday'], description: '', sourceCollection: 'christmas-gift-boxes', source: 'live-gift-catalog' },
  { id: 3, title: 'Monthly Succulent Subscription', handle: 'monthly-succulent-subscription', url: 'https://succulentsbox.com/products/monthly-succulent-subscription', price: '$12.99', image: '', productType: 'Subscription', tags: ['subscription'], description: '', sourceCollection: 'subscription-boxes', source: 'live-gift-catalog' }
];
const LIVE_PLANTS = [
  { id: 11, title: 'Echeveria Amnesty', handle: 'echeveria-amnesty', url: 'https://succulentsbox.com/products/echeveria-amnesty', price: '$8.00', image: '', productType: 'Echeveria', tags: ['succulent'], description: '', sourceCollection: 'all', source: 'live-plant-catalog' },
  { id: 12, title: 'Snake Plant', handle: 'snake-plant', url: 'https://succulentsbox.com/products/snake-plant', price: '$18.00', image: '', productType: 'Houseplant', tags: ['low light'], description: '', sourceCollection: 'all', source: 'live-plant-catalog' }
];

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/.netlify/functions/')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const payload = JSON.parse(body || '{}');
      const m = mode();

      if (req.url.endsWith('/auth')) {
        res.setHeader('Content-Type', 'application/json');
        if (payload.password === 'pw') return res.end(JSON.stringify({ ok: true, token: 'pw' }));
        res.statusCode = 401; return res.end(JSON.stringify({ error: 'Incorrect password. Please try again.' }));
      }

      if (req.url.endsWith('/gift-catalog')) {
        fs.writeFileSync('/tmp/last-gift-request.json', JSON.stringify(payload, null, 2));
        res.setHeader('Content-Type', 'application/json');
        if (m === 'giftfail') {
          res.statusCode = 502;
          return res.end(JSON.stringify({ error: 'The Succulents Box storefront could not be reached.', code: 'storefront_failure' }));
        }
        if (payload.catalogType === 'plants') {
          fs.writeFileSync('/tmp/last-plant-request.json', JSON.stringify(payload, null, 2));
          return res.end(JSON.stringify({ catalogType: 'plants', collection: payload.collection || 'all', products: LIVE_PLANTS, count: LIVE_PLANTS.length, cached: false }));
        }
        const occasion = String(payload.occasion || '').toLowerCase();
        const collection = payload.collection || (occasion.includes('christmas') ? 'christmas-gift-boxes' : 'succulents-gift-boxes');
        const products = collection === 'christmas-gift-boxes'
          ? GIFT_PRODUCTS.filter(p => p.sourceCollection === 'christmas-gift-boxes')
          : GIFT_PRODUCTS;
        return res.end(JSON.stringify({ collection, products, count: products.length, cached: false }));
      }

      // generate
      fs.writeFileSync('/tmp/last-request.json', JSON.stringify(payload, null, 2));
      if (m === 'timeout504') {
        res.statusCode = 504;
        res.setHeader('Content-Type', 'text/html');
        return res.end('<html><body><h1>504 Gateway Time-out</h1><p>Task timed out after 26.01 seconds</p></body></html>');
      }
      if (m === 'text502') {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'text/plain');
        return res.end('Bad gateway');
      }
      res.setHeader('Content-Type', 'application/json');
      const n = (payload.fields.selectedProducts || []).length;
      res.end(JSON.stringify({
        title: 'Plant Gifts Worth Sending',
        alternative_titles: ['Desk Plants Worth Giving', 'Low Light Plant Gifts for the Office'],
        html: '<p style="font-size:12px;color:#888;">Updated September 2026</p><h2 style="color:#34bfa2" id="a">A section</h2><p>Body text with a <a href="https://succulentsbox.com">link</a>.</p><script>window.__XSS__=1;</scr' + 'ipt><img src=x onerror="window.__XSS2__=1">',
        excerpt: 'An excerpt sentence. And another one.',
        meta_description: 'A meta description that is quite short.',
        products: n ? payload.fields.selectedProducts : [{ title: 'Echeveria', handle: 'echeveria', price: '$8.00', image: '', url: 'https://succulentsbox.com/products/echeveria', source: 'live-plant-catalog' }],
        related_articles: [{ t: 'Watering Tips', u: 'https://succulentsbox.com/blogs/blog/watering-tips' }],
        warnings: m === 'warn' ? ['The excerpt could not be generated.'] : []
      }));
    });
    return;
  }
  const file = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
server.listen(8899, () => console.log('listening on 8899'));
