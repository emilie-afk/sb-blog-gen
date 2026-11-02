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
  // A metadata reply cut off by the token budget in the middle of the products
  // list, the way a long catalog reply runs out on care guides and single-plant
  // gifts.
  if (mode === 'metacut' && !isArticle) return { stop_reason: 'max_tokens', content: [{ text: '{"title":"Christmas Cactus as a Gift","alternative_titles":["A Holiday Plant That Lasts","Giving a Christmas Cactus"],"excerpt":"A plant that flowers every winter.","meta_description":"What to know before giving a Christmas Cactus.","products":[{"t":"Succulent Potting Soil","h":"succulent-potting-soil","p":"$9.00","i":"https://cdn.shopify.com/x.jpg"},{"t":"Echeveria Amn' }] };
  // Pack v2 asks only for identifiers: product handles and article URLs.
  if (mode === 'v2full' && !isArticle) return { stop_reason: 'end_turn', content: [{ text: '{"title":"Christmas Cactus as a Gift","alternative_titles":["A Holiday Plant That Lasts","Giving a Christmas Cactus"],"excerpt":"It flowers every winter.","meta_description":"What to know before giving a Christmas Cactus.","products":[{"h":"succulent-potting-soil"},{"h":"echeveria-amnesty"},{"h":"not-a-real-handle"}],"articles":[{"u":"https://succulentsbox.com/blogs/blog/watering-tips"},{"u":"https://succulentsbox.com/blogs/blog/overwatered-vs-underwatered"},{"u":"https://evil.example.com/x"}]}' }] };
  if (mode === 'v2cut' && !isArticle) return { stop_reason: 'max_tokens', content: [{ text: '{"title":"Christmas Cactus as a Gift","alternative_titles":["A Holiday Plant That Lasts","Giving a Christmas Cactus"],"excerpt":"It flowers every winter.","meta_description":"What to know before giving a Christmas Cactus.","products":[{"h":"succulent-potting-soil"},{"h":"echeveria-amnesty"}],"articles":[{"u":"https://succulentsbox.com/blogs/blog/watering-tips"},{"u":"https://succulentsbox.com/blogs/blog/overwatered-vs-underw' }] };
  if (mode === 'metacut-title' && !isArticle) return { stop_reason: 'max_tokens', content: [{ text: '{"title":"Christmas Cac' }] };
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

  mode = 'metacut';
  const errs = []; const realErr = console.error; console.error = (...a) => errs.push(a.join(' '));
  r = await call({ articleType: 'single_plant_gift', fields: { plantName: 'Christmas Cactus', giftAngle: 'Long-lasting alternative to flowers', productUrl: 'https://succulentsbox.com/products/christmas-cactus' } });
  console.error = realErr;
  d = body(r);
  ok('a metadata reply cut off by the token budget keeps the AI title', r.statusCode === 200 && d.title === 'Christmas Cactus as a Gift', d.title);
  ok('and its alternative titles, excerpt and meta description',
    d.alternative_titles.length === 2 && d.excerpt === 'A plant that flowers every winter.' && /^What to know/.test(d.meta_description), JSON.stringify([d.alternative_titles, d.excerpt, d.meta_description]));
  ok('and the products it finished, matched against the catalog; the cut-off one is dropped',
    d.products.length === 1 && d.products[0].handle === 'succulent-potting-soil', JSON.stringify(d.products));
  ok('no "could not be read" or fallback-title warning for a salvaged reply',
    !d.warnings.some(w => /could not be read|built from your brief/.test(w)), JSON.stringify(d.warnings));
  ok('the cut-off is logged without any content', errs.some(e => /Metadata response incomplete: \{"stopReason":"max_tokens","salvaged":true\}/.test(e)) && !errs.some(e => /Christmas/.test(e)), JSON.stringify(errs));

  mode = 'metacut-title';
  r = await call({ articleType: 'single_plant_gift', fields: { plantName: 'Christmas Cactus', giftAngle: 'Long-lasting alternative to flowers', productUrl: 'https://succulentsbox.com/products/christmas-cactus' } });
  d = body(r);
  ok('a reply cut off before the title finished still falls back to the brief, with the warning',
    r.statusCode === 200 && !!d.html && d.warnings.some(w => /built from your brief/.test(w)), JSON.stringify(d.warnings));

  // ── Pack v2 replies: identifiers only ──
  mode = 'v2full';
  r = await call({ articleType: 'single_plant_gift', fields: { plantName: 'Christmas Cactus', giftAngle: 'Long-lasting alternative to flowers', productUrl: 'https://succulentsbox.com/products/christmas-cactus' } });
  d = body(r);
  ok('v2 reply (handles and URLs only): title, excerpt and meta description are used',
    r.statusCode === 200 && d.title === 'Christmas Cactus as a Gift' && d.excerpt === 'It flowers every winter.' && /^What to know/.test(d.meta_description) && !d.warnings.some(w => /could not be read|built from your brief/.test(w)), JSON.stringify(d.warnings));
  ok('v2 reply: products resolved from handles to full catalog entries, the unknown handle dropped',
    d.products.length === 2 && d.products[0].handle === 'succulent-potting-soil' && !!d.products[0].title && !!d.products[0].image && /\/products\/succulent-potting-soil$/.test(d.products[0].url) && d.products[1].handle === 'echeveria-amnesty', JSON.stringify(d.products));
  ok('v2 reply: articles resolved from URLs to titled entries, the foreign URL dropped',
    d.related_articles.length === 2 && d.related_articles.every(a => a.t && /^https:\/\/succulentsbox\.com\/blogs\//.test(a.u)), JSON.stringify(d.related_articles));

  mode = 'v2cut';
  r = await call({ articleType: 'single_plant_gift', fields: { plantName: 'Christmas Cactus', giftAngle: 'Long-lasting alternative to flowers', productUrl: 'https://succulentsbox.com/products/christmas-cactus' } });
  d = body(r);
  ok('truncated v2 reply: completed fields and completed identifiers are kept',
    r.statusCode === 200 && d.title === 'Christmas Cactus as a Gift' && d.excerpt === 'It flowers every winter.' && d.products.length === 2 && d.related_articles.length === 1 && d.related_articles[0].u === 'https://succulentsbox.com/blogs/blog/watering-tips', JSON.stringify([d.title, d.products.map(p => p.handle), d.related_articles]));

  // ── Cut-offs inside escapes, straight through the parser ──
  const { parseMetadata } = require(H.ROOT + '/netlify/functions/lib/run-generation.js')._internals;
  const tryParse = t => { try { return parseMetadata(t); } catch (e) { return { error: e.message }; } };
  let m = tryParse('{"title":"Say \\"hello\\" to it","excerpt":"Ends on an escape \\');
  ok('cut-off right after a backslash: the finished title (with escaped quotes) is kept, the cut excerpt dropped',
    m.title === 'Say "hello" to it' && m.excerpt === null, JSON.stringify(m));
  m = tryParse('{"title":"Done","excerpt":"Cut inside an escaped quote \\"');
  ok('cut-off just after an escaped quote: the open excerpt is not closed early',
    m.title === 'Done' && m.excerpt === null, JSON.stringify(m));
  m = tryParse('{"title":"Caf\\u00e9 plants","excerpt":"Half a unicode escape \\u00');
  ok('a complete \\u escape is decoded; a half-written one is dropped', m.title === 'Café plants' && m.excerpt === null, JSON.stringify(m));
  m = tryParse('{"title":"Bad \\u12","excerpt":"Fine."');
  ok('a closed string with a malformed \\u escape is dropped, not thrown', m.title === null && m.excerpt === 'Fine.', JSON.stringify(m));
  m = tryParse('{"title":"Emoji \\ud83c\\udf35 ok","meta_description":"Half a pair \\ud83c');
  ok('a complete surrogate pair is kept; an unfinished one is dropped', m.title === 'Emoji 🌵 ok' && m.meta_description === null, JSON.stringify(m));
  m = tryParse('{"title":"Raw é and 🌵 kept","excerpt":"cut mid-word caf');
  ok('raw non-ASCII text in a finished string is kept', m.title === 'Raw é and 🌵 kept' && m.excerpt === null, JSON.stringify(m));
  m = tryParse('{"title":"T","excerpt":"Quotes \\"h\\":\\"fake-handle\\" inside text","products":[{"h":"succulent-potting-soil"},{"h":"echev');
  ok('a key-like sequence inside an escaped string is never read as a product handle',
    m.products.length === 1 && m.products[0].h === 'succulent-potting-soil' && /fake-handle/.test(m.excerpt), JSON.stringify(m));
  m = tryParse('{"title":"T","articles":[{"u":"https://succulentsbox.com/blogs/blog/watering-tips"},{"u":"https://succulentsbox.com/blo');
  ok('a URL cut mid-value is dropped; the finished one is kept', m.articles.length === 1 && m.articles[0].u.endsWith('watering-tips'), JSON.stringify(m.articles));

  mode = 'articlefail';
  r = await call({ articleType: 'care_guide', fields: { plantName: 'Haworthia' } });
  d = body(r);
  ok('an article failure → 502 with a classified code', r.statusCode === 502 && d.code === 'ai_unavailable', r.body);
  ok('the provider error text never reaches the browser', !/internal detail|overloaded_error|529 \{/.test(r.body), r.body);

  console.log(`\n${failures} failures`);
  if (failures) process.exitCode = 1;
})();
