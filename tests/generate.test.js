// Synchronous generate handler, with a stubbed Anthropic SDK.
// Run: node tests/generate.test.js
const H = require('./support/harness');
H.applyTestEnv();

let mode = 'ok';
const calls = H.stubAnthropic(req => {
  const isArticle = req.max_tokens > 1000;
  if (mode === 'articlefail' && isArticle) {
    const e = new Error('529 {"type":"error","error":{"type":"overloaded_error","message":"internal detail that must not reach the browser"}}');
    e.status = 529; throw e;
  }
  if (mode === 'metafail' && !isArticle) throw new Error('rate limited');
  if (mode === 'metajunk' && !isArticle) return { content: [{ text: 'sorry, I cannot do that' }] };
  if (isArticle) return { content: [{ text: '```html\n<p>Updated September 2026</p><h2 style="color:#34bfa2" id="x">Care — really</h2>' + '<p>Water every 10–14 days. Nice.</p>'.repeat(10) + '\n```' }] };
  return { content: [{ text: '{"title":"Plant Gifts for Coworkers 2026","alternative_titles":["Desk Plants Worth Giving","Low Light Plant Gifts for the Office"],"excerpt":"A — test excerpt.","meta_description":"Meta desc","products":[{"t":"Succulent Potting Soil","h":"succulent-potting-soil"},{"t":"NOT REAL","h":"fake-handle"}],"articles":[{"t":"Watering Tips","u":"https://succulentsbox.com/blogs/blog/watering-tips"},{"t":"Made Up","u":"https://evil.example.com/x"}]}' }] };
});

const { handler } = require(H.ROOT + '/netlify/functions/generate.js');
H.useMemoryStores();
const who = H.newSession();

let failures = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('PASS ' + name); return; }
  failures += 1;
  console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + extra : ''));
}

const prods = [1, 2].map(i => ({ title: 'Gift Box ' + i, url: 'https://succulentsbox.com/products/g' + i, price: '$4' + i + '.00', source: 'manual' }));
const call = (body, opts) => handler(H.event(body, Object.assign({ as: who }, opts || {})));
const body = r => JSON.parse(r.body);

(async () => {
  let r = await call({ articleType: 'care_guide', fields: { plantName: 'Haworthia' } }, { as: null });
  ok('no session → 401 before any model call', r.statusCode === 401 && body(r).code === 'unauthorized' && calls.length === 0);

  r = await call({ articleType: 'care_guide', fields: {} });
  ok('validation failure → 400, no model call', r.statusCode === 400 && body(r).code === 'missing_required' && calls.length === 0);

  r = await call({ articleType: 'care_guide', fields: { plantName: 'Haworthia' } });
  let d = body(r);
  ok('care guide → 200', r.statusCode === 200, r.body.slice(0, 200));
  ok('dashes stripped from the article and excerpt', !/[—–]/.test(d.html) && !/[—–]/.test(d.excerpt));
  ok('a catalog product the model invented is dropped', d.products.length === 1 && d.products[0].handle === 'succulent-potting-soil', JSON.stringify(d.products));
  ok('a related article the model invented is dropped', d.related_articles.length === 1, JSON.stringify(d.related_articles));
  ok('code fences stripped', !d.html.includes('```'));
  ok('the payload carries no prompt and no pack details',
    !('prompt' in d) && !('promptVersion' in d) && !/⟨|\{\{/.test(JSON.stringify(d)));
  ok('the model was sent the prompt built from the active pack', calls.some(c => /⟨careGuide\.document⟩/.test(c.messages[0].content)));

  r = await call({ articleType: 'general_gift_guide', fields: { numberOfRecommendations: 2, selectedProducts: prods } });
  d = body(r);
  ok('general guide → 200 with the confirmed products', r.statusCode === 200 && d.products.length === 2 && d.products[0].title === 'Gift Box 1');
  ok('year stripped from the AI title', d.title && !/2026/.test(d.title), d.title);
  ok('two alternative titles', d.alternative_titles.length === 2);

  r = await call({ articleType: 'general_gift_guide', fields: { numberOfRecommendations: 9, selectedProducts: prods } });
  ok('nine recommendations rejected', r.statusCode === 400 && /between 1 and 8/.test(body(r).error));

  mode = 'metafail';
  r = await call({ articleType: 'care_guide', fields: { plantName: 'Haworthia' } });
  d = body(r);
  ok('a metadata failure still returns the article, with a warning', r.statusCode === 200 && !!d.html && d.warnings.some(w => /could not be generated/.test(w)));

  mode = 'metajunk';
  r = await call({ articleType: 'care_guide', fields: { plantName: 'Haworthia' } });
  d = body(r);
  ok('unreadable metadata still returns the article, with a warning', r.statusCode === 200 && !!d.html && d.warnings.length > 0);

  mode = 'articlefail';
  r = await call({ articleType: 'care_guide', fields: { plantName: 'Haworthia' } });
  d = body(r);
  ok('an article failure → 502 with a classified code', r.statusCode === 502 && d.code === 'ai_unavailable', r.body);
  ok('the provider error text never reaches the browser', !/internal detail|overloaded_error|529 \{/.test(r.body), r.body);

  console.log(`\n${failures} failures`);
  if (failures) process.exitCode = 1;
})();
