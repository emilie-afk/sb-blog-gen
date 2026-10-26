// The prompt pack: loading, completeness, versioning, pinning, safe failure, and
// the template routing the repository is responsible for.
//
// Every check here runs on the synthetic pack, whose templates are marker names
// and placeholders. Nothing in this file depends on, or contains, editorial
// content.
//
// Run: node tests/prompt-pack.test.js

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const promptPack = require('../netlify/functions/lib/prompt-pack');
const { validateRequest } = require('../netlify/functions/lib/validate');
const { buildCareGuidePrompt, sectionRoute, LINKS } = require('../netlify/functions/lib/prompt-care-guide');
const { buildSinglePlantGiftPrompt } = require('../netlify/functions/lib/prompt-single-plant-gift');
const { buildGeneralGiftGuidePrompt } = require('../netlify/functions/lib/prompt-general-gift-guide');
const { buildOccasionGiftGuidePrompt } = require('../netlify/functions/lib/prompt-occasion-gift-guide');
const { buildMetadataAndRelatedPrompt } = require('../netlify/functions/lib/prompt-metadata-related');
const { runGeneration } = require('../netlify/functions/lib/run-generation');
const { allBriefs, PLANT_FOR_TYPE } = require('./fixtures/prompt-briefs');
const { loadPackJson, testPack, signForTests, TEST_KEYS } = require('./support/test-pack');
const { setDeployContextForTests } = require('../netlify/functions/lib/deploy-context');
const signature = require('../netlify/functions/lib/pack-signature');
// A pointer as tools/pack.js writes it: signed with the (test) operator key.
const signedPointer = (version, hash, channel) => JSON.stringify(signForTests({
  channel: channel || 'production', version, hash: hash || 'sha256:' + '0'.repeat(64), activatedAt: new Date().toISOString() }));
const KEY = TEST_KEYS.privateKeyPem;
const tool = require('../tools/pack');

let failures = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('PASS ' + name); return; }
  failures += 1;
  console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + extra : ''));
}
async function rejects(name, code, fn) {
  try { await fn(); ok(name, false, 'expected a rejection'); }
  catch (e) { ok(name, e.code === code, 'got ' + e.code + ': ' + e.message); }
}

const clone = o => JSON.parse(JSON.stringify(o));
const synthetic = loadPackJson();
const PACK = testPack();

(async () => {
  console.log('\n── 1. The committed pack is synthetic ──');
  ok('the test pack is marked synthetic', synthetic.meta && synthetic.meta.synthetic === true);
  const flat = promptPack.flatten(synthetic);
  ok('every synthetic template is a marker plus placeholders only',
    Object.entries(flat).filter(([k]) => !k.startsWith('meta.'))
      .every(([k, v]) => v.replace(/\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/g, '').trim() === `⟨${k}⟩`));

  console.log('\n── 2. Completeness is checked before anything uses a pack ──');
  ok('the synthetic pack is complete', promptPack.validatePack(synthetic).ok);
  const holed = clone(synthetic); delete holed.careGuide.sections.airPlant.soil; holed.metadata.document = '  ';
  const check = promptPack.validatePack(holed);
  ok('missing and blank templates are all reported, not just the first',
    !check.ok && check.missing.includes('careGuide.sections.airPlant.soil') && check.missing.includes('metadata.document'), check.missing.join(','));
  ok('a non-object pack is rejected', !promptPack.validatePack(null).ok && !promptPack.validatePack('x').ok);
  ok('the manifest names every template a builder can ask for',
    (() => {
      // A pack with exactly the manifest, and nothing else, renders every brief.
      const minimal = {};
      for (const key of promptPack.REQUIRED_TEMPLATES) {
        const value = key.split('.').reduce((n, p) => n && n[p], synthetic);
        key.split('.').reduce((n, p, i, a) => (n[p] = i === a.length - 1 ? value : (n[p] || {})), minimal);
      }
      try { tool.dryRun(minimal); return true; } catch (e) { return e.message; }
    })() === true);

  console.log('\n── 3. Rendering is strict ──');
  ok('placeholders are filled', promptPack.render('a {{x}} b', { x: 1 }) === 'a 1 b');
  ok('an unknown placeholder throws instead of reaching the model',
    (() => { try { promptPack.render('a {{nope}}', {}); return false; } catch (e) { return /unknown value: nope/.test(e.message); } })());
  ok('a value containing braces is not re-expanded',
    promptPack.render('{{x}}', { x: '{{y}}' }) === '{{y}}');
  ok('a missing template throws a coded error',
    (() => { try { PACK.get('no.such.template'); return false; } catch (e) { return e.code === 'prompt_pack_incomplete'; } })());

  console.log('\n── 4. Hashes identify content ──');
  const h1 = promptPack.hashPack(synthetic);
  const reverseKeys = o => (o && typeof o === 'object' && !Array.isArray(o))
    ? Object.keys(o).reverse().reduce((acc, k) => (acc[k] = reverseKeys(o[k]), acc), {})
    : o;
  const reordered = reverseKeys(synthetic);
  ok('the hash ignores key order', promptPack.hashPack(reordered) === h1);
  const edited = clone(synthetic); edited.shared.evidenceRules += ' ';
  ok('the hash changes when any template changes', promptPack.hashPack(edited) !== h1);
  ok('hashes are labelled sha256', /^sha256:[0-9a-f]{64}$/.test(h1));

  console.log('\n── 5. Loading from the store ──');
  promptPack.resetPackStoreForTests();
  const empty = new Map();
  promptPack.setPackStoreForTests({ async get(k) { return empty.get(k) || null; }, async set(k, v) { empty.set(k, v); } });
  await rejects('no active pack fails with a coded error', 'prompt_pack_unavailable', () => promptPack.loadActivePack());
  empty.set('active', signedPointer('gone'));
  promptPack.setPackStoreForTests({ async get(k) { return empty.get(k) || null; }, async set(k, v) { empty.set(k, v); } });
  await rejects('an active pointer to a missing version fails', 'prompt_pack_unavailable', () => promptPack.loadActivePack());
  empty.set('active', signedPointer('holed', promptPack.hashPack(holed)));
  empty.set('pack/holed', JSON.stringify(holed));
  promptPack.setPackStoreForTests({ async get(k) { return empty.get(k) || null; }, async set(k, v) { empty.set(k, v); } });
  const errors = [];
  const realError = console.error; console.error = (...a) => errors.push(a.join(' '));
  await rejects('an incomplete stored pack is refused at load time', 'prompt_pack_incomplete', () => promptPack.loadActivePack());
  console.error = realError;
  ok('the load failure logs template names, never template content',
    errors.length === 1 && /careGuide\.sections\.airPlant\.soil/.test(errors[0]) && !/⟨/.test(errors[0]), errors.join(' | '));
  ok('the browser-facing failure names no template and no content',
    !/careGuide|shared\.|⟨|\{\{/.test(promptPack.PACK_FAILURE.error) && promptPack.PACK_FAILURE.code === 'prompt_config');

  promptPack.usePackForTests(synthetic, { version: 'v-one', sign: signForTests });
  const active = await promptPack.loadActivePack();
  ok('the active pack loads and carries its version', active.version === 'v-one');
  ok('the loaded handle carries the content hash', active.hash === h1);

  console.log('\n── 6. A running job keeps its version ──');
  // Load v-one, then activate v-two while "the job" still holds v-one.
  const store = promptPack.getStore();
  const v2 = clone(synthetic); v2.careGuide.document = v2.careGuide.document.replace('⟨careGuide.document⟩', '⟨careGuide.document v2⟩');
  await store.set('pack/v-two', JSON.stringify(v2));
  await store.set('active', signedPointer('v-two', promptPack.hashPack(v2)));
  promptPack.usePackForTests(synthetic, { version: 'v-one', sign: signForTests }); // fresh caches, v-one active
  const pinned = await promptPack.loadActivePack();
  const s2 = promptPack.getStore();
  await s2.set('pack/v-two', JSON.stringify(v2));
  await s2.set('active', signedPointer('v-two', promptPack.hashPack(v2)));
  const fields = validateRequest('care_guide', { plantName: 'Echeveria Lola', plantType: 'Succulent' }).fields;
  const fakeClient = { messages: { create: async () => ({ content: [{ text: '<p>' + 'x'.repeat(300) + '</p>' }], stop_reason: 'end_turn' }) } };
  let sent = [];
  const recording = { messages: { create: async req => { sent.push(req.messages[0].content); return fakeClient.messages.create(); } } };
  await runGeneration({ articleType: 'care_guide', fields, client: recording, pack: pinned });
  ok('a pinned job renders with the version it started with', sent.some(p => p.includes('⟨careGuide.document⟩')) && !sent.some(p => p.includes('v2')));
  const v2Handle = await promptPack.loadPackVersion('v-two');
  sent = [];
  await runGeneration({ articleType: 'care_guide', fields, client: recording, pack: v2Handle });
  ok('a new job after activation uses the new version', sent.some(p => p.includes('⟨careGuide.document v2⟩')));
  ok('runGeneration refuses to run without a pack',
    (await runGeneration({ articleType: 'care_guide', fields, client: recording })).code === 'prompt_config');

  console.log('\n── 7. Plant-type routing selects the right sections and links ──');
  const route = t => sectionRoute(t);
  ok('succulent and cactus get linked care and soil-grown sections',
    route('Succulent').linkedCare && route('Cactus').linkedCare && route('Succulent').growing === 'soilGrown');
  ok('houseplant gets soil-grown sections without succulent care links',
    !route('Houseplant').linkedCare && route('Houseplant').growing === 'soilGrown');
  ok('air plant gets air-plant sections and no care links',
    !route('Air plant (Tillandsia)').linkedCare && route('Air plant (Tillandsia)').growing === 'airPlant');
  ok('an unconfirmed type gets the general sections', route('Not sure').growing === 'unconfirmed' && !route('Not sure').linkedCare);

  const care = type => buildCareGuidePrompt(
    validateRequest('care_guide', { plantName: PLANT_FOR_TYPE[type], plantType: type }).fields, PACK);
  const SUCCULENT_PAGES = [LINKS.overwatering, LINKS.toxicity, LINKS.winter];
  const SOIL_PAGES = [LINKS.succulentSoil, LINKS.terracotta, LINKS.pruning];
  for (const type of ['Air plant (Tillandsia)', 'Houseplant', 'Not sure']) {
    const p = care(type);
    ok(`${type}: no succulent watering, toxicity or winter link reaches the prompt`, SUCCULENT_PAGES.every(u => !p.includes(u)));
    ok(`${type}: watering, toxicity and seasonal sections are still present`,
      /⟨careGuide\.sections\.unlinked\.watering⟩/.test(p) && /⟨careGuide\.sections\.unlinked\.toxicity⟩/.test(p) && /⟨careGuide\.sections\.unlinked\.seasonal⟩/.test(p));
    ok(`${type}: the plant's own name fills those sections`, p.includes(PLANT_FOR_TYPE[type]));
  }
  for (const type of ['Air plant (Tillandsia)', 'Not sure']) {
    const p = care(type);
    ok(`${type}: no soil, pot or pruning link reaches the prompt`, SOIL_PAGES.every(u => !p.includes(u)));
  }
  ok('air plant: air-plant growing sections are used', /⟨careGuide\.sections\.airPlant\.soil⟩/.test(care('Air plant (Tillandsia)')));
  ok('not sure: the unconfirmed-type rule is used', /⟨careGuide\.plantTypeUnconfirmed⟩/.test(care('Not sure')));
  for (const type of ['Succulent', 'Cactus']) {
    const p = care(type);
    ok(`${type}: all six succulent pages are offered`, [...SUCCULENT_PAGES, ...SOIL_PAGES].every(u => p.includes(u)));
  }
  const house = care('Houseplant');
  ok('houseplant: the conditional potting-soil instruction is used', /⟨careGuide\.sections\.soilGrown\.soilLinkHouseplant⟩/.test(house));
  ok('houseplant: pot and pruning links are offered with their soil-grown sections', house.includes(LINKS.terracotta) && house.includes(LINKS.pruning));

  // The routing is enforced by the code, not left to the pack: a pack that put a
  // succulent link into an unlinked section cannot render it.
  const sneaky = clone(synthetic);
  sneaky.careGuide.sections.unlinked.watering += ' {{overwateringLink}}';
  const sneakyHandle = promptPack.packHandle(sneaky, 'sneaky', 'x');
  ok('a pack cannot route a succulent link into an air-plant section',
    (() => { try { buildCareGuidePrompt(validateRequest('care_guide', { plantName: 'Tillandsia', plantType: 'Air plant (Tillandsia)' }).fields, sneakyHandle); return false; }
             catch (e) { return /unknown value: overwateringLink/.test(e.message); } })());

  console.log('\n── 8. Format composition ──');
  const gen = validateRequest('general_gift_guide', { numberOfRecommendations: 2, selectedProducts: [
    { title: 'Example Gift 1', url: 'https://example.com/products/1', price: '$20.00' },
    { title: 'Example Gift 2', url: 'https://example.com/products/2', price: '$30.00' },
    { title: 'Example Gift 3', url: 'https://example.com/products/3', price: '$40.00' }] }).fields;
  const g = buildGeneralGiftGuidePrompt(gen, PACK);
  ok('only the requested number of products reach a gift guide', g.includes('Example Gift 2') && !g.includes('Example Gift 3'));
  ok('a gift guide carries the voice, evidence and storefront rules',
    ['shared.giftVoice.body', 'shared.evidenceRules', 'shared.storefrontDescriptionRules', 'shared.comparisonTable.body'].every(k => g.includes(`⟨${k}⟩`)));
  ok('priced products get the price column', g.includes('⟨shared.comparisonTable.priceHeader⟩'));
  const occ = f => buildOccasionGiftGuidePrompt(validateRequest('occasion_gift_guide', Object.assign({ occasion: 'Sympathy', numberOfRecommendations: 1,
    selectedProducts: [{ title: 'Example Gift 1', url: 'https://example.com/products/1' }], collectionUrl: 'https://example.com/collections/x' }, f)).fields, PACK);
  const sensitive = occ({ sensitiveOccasion: true });
  ok('sensitive mode adds its rules and never a button', sensitive.includes('⟨occasionGiftGuide.sensitiveBlock⟩')
    && sensitive.includes('⟨occasionGiftGuide.sensitiveSoftLink⟩') && !/border-radius:6px;font-weight:700/.test(sensitive));
  const ordinary = occ({});
  ok('an ordinary occasion gets the shop button and no sensitive rules',
    !ordinary.includes('⟨occasionGiftGuide.sensitiveBlock⟩') && /border-radius:6px;font-weight:700/.test(ordinary));
  ok('a supplied date selects the supplied-date rule', occ({ occasionDate: 'June 1, 2026' }).includes('⟨occasionGiftGuide.dateSupplied⟩'));
  ok('no date selects the no-date rule', ordinary.includes('⟨occasionGiftGuide.dateMissing⟩'));
  const meta = buildMetadataAndRelatedPrompt('care_guide', validateRequest('care_guide', { plantName: 'Haworthia' }).fields, PACK);
  ok('care metadata offers catalog products', meta.includes('⟨metadata.catalogBlock⟩') && meta.includes('⟨metadata.productRule.careGuide⟩'));
  ok('gift-guide metadata does not', !buildMetadataAndRelatedPrompt('general_gift_guide', gen, PACK).includes('⟨metadata.catalogBlock⟩'));

  console.log('\n── 9. Every brief renders with nothing left unfilled ──');
  let rendered = 0, unfilled = 0;
  for (const b of allBriefs()) {
    const { articleType, fields: f } = validateRequest(b.articleType, b.fields);
    const builder = { care_guide: buildCareGuidePrompt, single_plant_gift: buildSinglePlantGiftPrompt,
      general_gift_guide: buildGeneralGiftGuidePrompt, occasion_gift_guide: buildOccasionGiftGuidePrompt }[articleType];
    for (const text of [builder(f, PACK), buildMetadataAndRelatedPrompt(articleType, f, PACK)]) {
      rendered += 1;
      if (/\{\{/.test(text)) unfilled += 1;
    }
  }
  ok(`all ${rendered} prompts render with every placeholder filled`, rendered > 200 && unfilled === 0, `${unfilled} unfilled`);

  console.log('\n── 10. Private tooling ──');
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pack-tool-'));
  const file = path.join(tmp, 'p.json');
  fs.writeFileSync(file, JSON.stringify(synthetic));
  const holedFile = path.join(tmp, 'holed.json');
  fs.writeFileSync(holedFile, JSON.stringify(holed));
  ok('validate accepts a complete pack and dry-runs every brief', tool.validate(file).rendered > 200);
  ok('validate refuses an incomplete pack', (() => { try { tool.validate(holedFile); return false; } catch (e) { return /incomplete/.test(e.message); } })());
  const badPlaceholder = clone(synthetic); badPlaceholder.shared.keywordLine += ' {{nonsense}}';
  const badFile = path.join(tmp, 'bad.json'); fs.writeFileSync(badFile, JSON.stringify(badPlaceholder));
  ok('validate refuses a placeholder the application does not fill', (() => { try { tool.validate(badFile); return false; } catch (e) { return /Dry run failed/.test(e.message); } })());

  const map = new Map();
  const mem = {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async set(k, v) { map.set(k, v); },
    async delete(k) { map.delete(k); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
  await tool.importPack(mem, file, 'one', Date.UTC(2026, 0, 1));
  ok('import stores the pack and its hash', map.has('pack/one') && JSON.parse(map.get('meta/one')).hash === h1);
  ok('import does not activate by itself', !map.has('active'));
  await rejects('import refuses to overwrite an existing version', undefined, async () => {
    try { await tool.importPack(mem, file, 'one'); } catch (e) { if (/immutable/.test(e.message)) { e.code = undefined; throw e; } throw e; }
  });
  await rejects('import refuses an incomplete pack', undefined, async () => {
    try { await tool.importPack(mem, holedFile, 'two'); } catch (e) { if (/incomplete/.test(e.message)) { e.code = undefined; throw e; } throw e; }
  });
  ok('a refused import writes nothing', !map.has('pack/two'));
  await rejects('activate refuses to run without a named channel', undefined, async () => {
    try { await tool.activate(mem, 'one', Date.UTC(2026, 0, 2), undefined, KEY); } catch (e) { if (/Name the channel/.test(e.message)) { e.code = undefined; throw e; } throw e; }
  });
  ok('a refused activation changes no pointer', !map.has('active') && ![...map.keys()].some(k => k.startsWith('active.')));
  await tool.activate(mem, 'one', Date.UTC(2026, 0, 2), 'production', KEY);
  ok('activate points at the version', JSON.parse(map.get('active')).version === 'one');
  const v2File = path.join(tmp, 'v2.json'); fs.writeFileSync(v2File, JSON.stringify(v2));
  await tool.importPack(mem, v2File, 'two', Date.UTC(2026, 0, 3));
  await tool.activate(mem, 'two', Date.UTC(2026, 0, 4), 'preview', KEY);
  ok('activating on the preview channel leaves production untouched',
    JSON.parse(map.get('active')).version === 'one' && JSON.parse(map.get('active.preview')).version === 'two');
  await tool.activate(mem, 'two', Date.UTC(2026, 0, 4, 1), 'production', KEY);
  ok('activation records what came before', (await tool.history(mem, 'production')).pop().previous === 'one');
  await tool.rollback(mem, Date.UTC(2026, 0, 5), 'production', KEY);
  ok('rollback returns to the previous version', JSON.parse(map.get('active')).version === 'one');
  ok('rollback keeps both versions stored', map.has('pack/one') && map.has('pack/two'));
  map.set('pack/two', JSON.stringify(Object.assign(clone(v2), { shared: Object.assign(clone(v2.shared), { evidenceRules: 'tampered' }) })));
  await rejects('activation refuses a pack altered after import', undefined, async () => {
    try { await tool.activate(mem, 'two', undefined, 'production', KEY); } catch (e) { if (/no longer matches/.test(e.message)) { e.code = undefined; throw e; } throw e; }
  });
  ok('the version id format is enforced', !tool.VERSION_PATTERN.test('../etc') && !tool.VERSION_PATTERN.test('') && tool.VERSION_PATTERN.test('2026-10-23.1'));
  const listing = await tool.list(mem);
  ok('list reports versions and every channel', listing.active === 'one' && listing.channels.preview === 'two' && listing.versions.length === 2,
    JSON.stringify(listing.channels));
  ok('the preview pointer survives a production rollback', JSON.parse(map.get('active.preview')).version === 'two');
  ok('every pointer the tool writes is signed and verifies for its own channel',
    signature.verifyPointer(JSON.parse(map.get('active')), 'production', TEST_KEYS.publicKeyBase64).ok
    && signature.verifyPointer(JSON.parse(map.get('active.preview')), 'preview', TEST_KEYS.publicKeyBase64).ok);
  await rejects('activate refuses to run without a signing key', undefined, async () => {
    try { await tool.activate(mem, 'one', undefined, 'production'); } catch (e) { if (/signing key/.test(e.message)) { e.code = undefined; throw e; } throw e; }
  });
  const keyDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pack-key-'));
  const made = tool.keygen(path.join(keyDir, 'k.pem'));
  ok('keygen writes a private key readable only by its owner and prints the public key',
    (fs.statSync(made.out).mode & 0o777) === 0o600 && /^[A-Za-z0-9+/=]{40,80}$/.test(made.publicKeyBase64));
  ok('keygen refuses to overwrite an existing key', (() => { try { tool.keygen(made.out); return false; } catch (e) { return /refusing to overwrite/.test(e.message); } })());
  fs.rmSync(keyDir, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log('\n── 10b. Deploy-context routing fails closed ──');
  const ctxStore = new Map();
  const ctxBacking = { async get(k) { return ctxStore.has(k) ? ctxStore.get(k) : null; }, async set(k, v) { ctxStore.set(k, v); } };
  const v2pack = clone(synthetic); v2pack.careGuide.document = v2pack.careGuide.document.replace('⟨careGuide.document⟩', '⟨careGuide.document preview⟩');
  ctxStore.set('pack/prod', JSON.stringify(synthetic));
  ctxStore.set('pack/prev', JSON.stringify(v2pack));
  ctxStore.set('active', signedPointer('prod', promptPack.hashPack(synthetic), 'production'));
  ctxStore.set('active.preview', signedPointer('prev', promptPack.hashPack(v2pack), 'preview'));
  // Loads the pack as a function in `context` would, with PROMPT_PACK_CHANNEL
  // set to `channel` (undefined = not set).
  const load = async (context, channel) => {
    setDeployContextForTests(context);
    if (channel === undefined) delete process.env.PROMPT_PACK_CHANNEL; else process.env.PROMPT_PACK_CHANNEL = channel;
    promptPack.setPackStoreForTests(ctxBacking);
    try { return (await promptPack.loadActivePack()).version; } catch (e) { return 'refused:' + (e.reason || e.code); }
  };
  const matrix = [
    // context,          channel,        expected
    ['production',       undefined,      'prod'],
    ['production',       'production',   'prod'],
    ['production',       'preview',      'refused:production must not select another channel'],
    ['deploy-preview',   undefined,      'refused:deploy-preview has no PROMPT_PACK_CHANNEL'],
    ['deploy-preview',   '',             'refused:deploy-preview has no PROMPT_PACK_CHANNEL'],
    ['deploy-preview',   'production',   'refused:deploy-preview may not use the production channel'],
    ['deploy-preview',   'PRODUCTION ',  'refused:deploy-preview may not use the production channel'],
    ['deploy-preview',   '../active',    'refused:deploy-preview has an invalid PROMPT_PACK_CHANNEL'],
    ['deploy-preview',   'preview',      'prev'],
    ['branch-deploy',    undefined,      'refused:branch-deploy has no PROMPT_PACK_CHANNEL'],
    ['branch-deploy',    'production',   'refused:branch-deploy may not use the production channel'],
    ['branch-deploy',    'not valid!',   'refused:branch-deploy has an invalid PROMPT_PACK_CHANNEL'],
    ['branch-deploy',    'preview',      'prev'],
    ['branch-deploy',    'staging',      'refused:prompt_pack_unavailable'],
    ['dev',              undefined,      'refused:dev has no PROMPT_PACK_CHANNEL'],
    [null,               undefined,      'refused:deploy context unknown'],
    [null,               'production',   'refused:deploy context unknown'],
    ['made-up-context',  'preview',      'refused:deploy context unknown']
  ];
  for (const [context, channel, expected] of matrix) {
    const got = await load(context, channel);
    ok(`context ${context || '(no stamp)'} with channel ${channel === undefined ? '(unset)' : JSON.stringify(channel)} -> ${expected}`, got === expected, got);
  }
  // A preview's pointer cannot be promoted by copying it into production's key:
  // the channel is inside the signature.
  ctxStore.set('active', ctxStore.get('active.preview'));
  ok('a preview pointer copied into production\'s key is refused', (await load('production')) === 'refused:channel_mismatch');
  ctxStore.set('active', JSON.stringify({ channel: 'production', version: 'prev', hash: promptPack.hashPack(v2pack), activatedAt: new Date().toISOString() }));
  ok('an unsigned pointer, as a deploy\'s own Blobs credentials could write, is refused', (await load('production')) === 'refused:unsigned');
  const attacker = signature.generateKeyPair();
  ctxStore.set('active', JSON.stringify(signature.signPointer(attacker.privateKeyPem, { channel: 'production', version: 'prev', hash: promptPack.hashPack(v2pack), activatedAt: new Date().toISOString() })));
  ok('a pointer signed with any other key is refused', (await load('production')) === 'refused:bad_signature');
  ctxStore.set('active', signedPointer('prod', promptPack.hashPack(synthetic), 'production'));
  const savedKey = process.env.PROMPT_PACK_PUBLIC_KEY;
  delete process.env.PROMPT_PACK_PUBLIC_KEY;
  ok('without PROMPT_PACK_PUBLIC_KEY no pointer is accepted', (await load('production')) === 'refused:no_public_key');
  process.env.PROMPT_PACK_PUBLIC_KEY = savedKey;
  ctxStore.set('active', signedPointer('prod', 'sha256:' + '0'.repeat(64), 'production'));
  ok('a pointer whose signed hash does not match the stored pack is refused', (await load('production')) === 'refused:prompt_pack_incomplete');
  delete process.env.PROMPT_PACK_CHANNEL;
  setDeployContextForTests('production');
  const stamp = require('../tools/build-site');
  const stampDir = path.join(ROOT, 'netlify/functions/lib/deploy-context.json');
  const before = fs.existsSync(stampDir) ? fs.readFileSync(stampDir) : null;
  const stamps = ['production', 'deploy-preview', 'branch-deploy', 'dev', '', 'staging'].map(c => stamp.stampDeployContext({ CONTEXT: c }));
  ok('the build stamps Netlify\'s CONTEXT, and anything unrecognised as unknown',
    JSON.stringify(stamps) === JSON.stringify(['production', 'deploy-preview', 'branch-deploy', 'dev', 'unknown', 'unknown']), JSON.stringify(stamps));
  if (before) fs.writeFileSync(stampDir, before); else fs.rmSync(stampDir, { force: true });
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  ok('the stamp is bundled with the functions', /included_files = \[[^\]]*netlify\/functions\/lib\/deploy-context\.json/.test(toml));
  // The deployed code has no way to write the pack store: the only writes in
  // prompt-pack.js are inside the test seams, and no function touches the store
  // except through loadActivePack/loadPackVersion.
  const ppSource = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/prompt-pack.js'), 'utf8');
  // Everything from the first test seam to the last is cut, and the two
  // per-instance caches (plain Maps, not the store) are excluded by name.
  const seamStart = ppSource.indexOf('function usePackForTests');
  const seamEnd = ppSource.indexOf('\n', ppSource.indexOf('function resetPackStoreForTests'));
  const outsideSeams = (ppSource.slice(0, seamStart) + ppSource.slice(seamEnd))
    .replace(/\b(packCache|activeCache)\.(set|clear)\(/g, '');
  ok('the prompt-pack module has no write path outside its test seams', seamStart > 0 && seamEnd > seamStart && !/\.(set|delete|setJSON)\(/.test(outsideSeams),
    (outsideSeams.match(/.{0,30}\.(set|delete|setJSON)\(.{0,20}/) || [''])[0]);
  const fnFiles = fs.readdirSync(path.join(ROOT, 'netlify/functions')).filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(ROOT, 'netlify/functions', f), 'utf8')).join('\n');
  ok('no function calls the pack store directly', !/prompts\.getStore\(|prompt-packs/.test(fnFiles));

  console.log('\n── 11. No editorial content is committed ──');
  // Fingerprints of the editorial content, as digests, so this file does not
  // itself carry the phrases it is looking for. Each is a distinctive line from
  // a pre-migration prompt module; none of them should appear in any tracked
  // file again.
  const crypto = require('crypto');
  const { execFileSync } = require('child_process');
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT }).toString().split('\n').filter(Boolean)
    .filter(f => fs.existsSync(path.join(ROOT, f)) && !/\.(png|jpg|ico)$/.test(f));
  const untrackedNew = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT }).toString().split('\n').filter(Boolean);
  const files = [...new Set([...tracked, ...untrackedNew])];
  const FINGERPRINTS = require('./fixtures/editorial-fingerprints.json');
  const byDigest = new Map(FINGERPRINTS.prints.map(fp => [fp.sha256, fp.label]));
  const LEN = FINGERPRINTS.prints[0].length;
  const scan = text => {
    // Normalised to single spaces, then every window of the fingerprint length
    // is hashed once. A literal copy anywhere in the text is found.
    const norm = text.replace(/\s+/g, ' ');
    for (let i = 0; i + LEN <= norm.length; i += 1) {
      const label = byDigest.get(crypto.createHash('sha256').update(norm.slice(i, i + LEN)).digest('hex'));
      if (label) return label;
    }
    return null;
  };
  const hits = [];
  for (const f of files) {
    const label = scan(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (label) hits.push(`${f} (${label})`);
  }
  // The check must be able to see what it is looking for: the pre-migration
  // module, still in history at the base commit, has to trip it.
  let baselineTrips = false;
  try {
    baselineTrips = !!scan(execFileSync('git', ['show', '20043bc:netlify/functions/lib/shared-rules.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  } catch { baselineTrips = 'history unavailable'; }
  ok('the fingerprint check detects the pre-migration prompt module', baselineTrips === true || baselineTrips === 'history unavailable', String(baselineTrips));
  ok(`none of ${FINGERPRINTS.prints.length} editorial fingerprints appear in ${files.length} repository files`, hits.length === 0, hits.join(', '));

  console.log(`\n${failures} failures`);
  if (failures) process.exitCode = 1;
})();
