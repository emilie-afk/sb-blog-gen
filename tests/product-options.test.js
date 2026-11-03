// Product options (variant names with prices) travel from the live catalog to
// the gift-guide prompt, so an item with a "No Plant" and a "With Succulent"
// choice is not described as available only one way.
// Run: node tests/product-options.test.js
const { _internals: gc } = require('../netlify/functions/gift-catalog');
const { validateRequest } = require('../netlify/functions/lib/validate');
const { formatProductsForPrompt } = require('../netlify/functions/lib/shared-rules');
const promptPack = require('../netlify/functions/lib/prompt-pack');
const { loadPackJson } = require('./support/test-pack');

let failures = 0;
const ok = (name, cond, extra) => { if (cond) console.log('PASS ' + name); else { failures++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + extra : '')); } };

// Catalog side.
const two = [{ title: 'No Plant', price: '13.48', available: true }, { title: 'With Succulent', price: '17.98', available: false }];
ok('options list each variant with its price, and mark sold-out ones',
  JSON.stringify(gc.variantOptions(two)) === JSON.stringify(['No Plant ($13.48)', 'With Succulent ($17.98) (sold out)']), JSON.stringify(gc.variantOptions(two)));
ok('a single Default Title variant gives no options', gc.variantOptions([{ title: 'Default Title', price: '5.00', available: true }]).length === 0);
ok('a single named variant is kept, because it is still a fact about the item', JSON.stringify(gc.variantOptions([{ title: '6 inch', price: '5.00', available: true }])) === JSON.stringify(['6 inch ($5.00)']));
ok('duplicate titles are listed once', gc.variantOptions([{ title: 'A', price: '1' }, { title: 'a', price: '2' }, { title: 'B', price: '3' }]).length === 2);
const many = gc.variantOptions(Array.from({ length: 20 }, (_, i) => ({ title: 'V' + i, price: '1' })));
ok('a long list keeps 12 options and says how many were left out', many.length === 13 && many[11] === 'V11 ($1.00)' && many[12] === '(8 more options not listed)', JSON.stringify(many));
const one = gc.variantOptions(Array.from({ length: 13 }, (_, i) => ({ title: 'V' + i, price: '1' })));
ok('one hidden option is reported in the singular', one[12] === '(1 more option not listed)', one[12]);
ok('exactly 12 options carry no note', gc.variantOptions(Array.from({ length: 12 }, (_, i) => ({ title: 'V' + i, price: '1' }))).length === 12);
// The case that started this: the "With Succulent" choices sit after the first 12.
const sizes = ['2 inch', '3 inch', '4 inch', '5 inch', '6 inch', '8 inch'];
const potLike = [].concat(...sizes.map(sz => [{ title: sz + ' / No Plant', price: '10' }, { title: sz + ' / White', price: '10' }])).concat(sizes.map(sz => ({ title: sz + ' / With Succulent', price: '15' })));
const potOpts = gc.variantOptions(potLike);
ok('when the cut hides the "With Succulent" options, the list says it is incomplete', !potOpts.some(o => /With Succulent/.test(o)) && /^\(6 more options not listed\)$/.test(potOpts[potOpts.length - 1]), JSON.stringify(potOpts));
ok('missing variants are handled', gc.variantOptions(undefined).length === 0 && gc.variantOptions('x').length === 0);
const norm = gc.normalizeProducts({ products: [{ id: 1, handle: 'pot', title: 'Pot', variants: two, images: [], tags: [] }] }, 'c', 'live-gift-catalog');
ok('normalized catalog products carry their options', norm[0] && norm[0].options.length === 2 && norm[0].price === '$13.48');

// Validation side.
const base = { title: 'Pot', url: 'https://succulentsbox.com/products/pot', price: '$13.48', source: 'live-gift-catalog' };
const v = o => validateRequest('general_gift_guide', { numberOfRecommendations: 1, selectedProducts: [Object.assign({}, base, o)] }).fields.selectedProducts[0];
ok('valid options are kept', JSON.stringify(v({ options: ['No Plant ($13.48)', 'With Succulent ($17.98)'] }).options) === JSON.stringify(['No Plant ($13.48)', 'With Succulent ($17.98)']));
ok('no options is an empty list', Array.isArray(v({}).options) && v({}).options.length === 0);
ok('markup and non-strings are dropped', JSON.stringify(v({ options: ['<b>Big</b>', 3, null, ' Small  '] }).options) === JSON.stringify(['bBig/b', 'Small']));
const capped = v({ options: Array.from({ length: 30 }, (_, i) => 'o' + i) }).options;
ok('a long list from the browser is cut to 12 and the cut is stated', capped.length === 13 && capped[12] === '(18 more options not listed)', JSON.stringify(capped));
ok('the catalog note survives validation and is not counted as an option', JSON.stringify(v({ options: many }).options) === JSON.stringify(many));
ok('a note plus extra options adds up the hidden count', v({ options: many.slice(0, 12).concat(['V12 ($1.00)', '(8 more options not listed)']) }).options[12] === '(9 more options not listed)');
ok('long options are cut to 80 characters', v({ options: ['x'.repeat(200), 'y'] }).options[0].length === 80);
ok('a single named option passes through', JSON.stringify(v({ options: ['6 inch ($5.00)'] }).options) === JSON.stringify(['6 inch ($5.00)']));
let threw = false; try { v({ options: 'No Plant' }); } catch (e) { threw = /options must be a list/.test(e.message); }
ok('options that are not a list are refused', threw);

// Prompt side.
const json = loadPackJson();
const without = promptPack.packHandle(json, 'no-options', promptPack.hashPack(json));
const withJson = JSON.parse(JSON.stringify(json));
withJson.shared.productEntry.options = 'OPTIONS: {{options}}';
const withOpts = promptPack.packHandle(withJson, 'with-options', promptPack.hashPack(withJson));
const prod = v({ options: ['No Plant ($13.48)', 'With Succulent ($17.98)'] });
ok('a pack with the options template lists them', /OPTIONS: No Plant \(\$13\.48\); With Succulent \(\$17\.98\)/.test(formatProductsForPrompt(withOpts, [prod])));
ok('the "more not listed" note reaches the prompt', /\(8 more options not listed\)/.test(formatProductsForPrompt(withOpts, [v({ options: many })])));
ok('an older pack without the template leaves options out and does not fail', !/No Plant/.test(formatProductsForPrompt(without, [prod])));
ok('a product without options adds no options line', !/OPTIONS:/.test(formatProductsForPrompt(withOpts, [v({})])));

console.log(`\n${failures} failures`);
if (failures) process.exitCode = 1;
