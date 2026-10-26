// The prompt pack: every confidential instruction the generator sends to the
// model, held outside this public repository.
//
// WHAT IS IN THE PACK AND WHAT IS IN THE REPOSITORY
//
// In the pack: brand voice, the article-format templates, the approved style
// samples, product-selection and recommendation instructions, metadata and
// related-article instructions, and the editorial guardrails. These are the
// things a competitor could lift wholesale, and they are the reason this module
// exists.
//
// In the repository, on purpose: how a prompt is assembled, which template a
// plant type or a gift format selects, field validation, output sanitisation,
// the deterministic table repair, article and catalog reconciliation, and every
// structural check. None of that is confidential and all of it is what makes the
// application correct, so it stays where it can be read, reviewed and tested.
//
// WHERE THE PACK LIVES. Netlify Blobs, in a store only the functions can reach.
// Blobs was chosen over a new database because the app already depends on it for
// job records, it is private to the site by default, it costs nothing extra, and
// a pack version is a single immutable document, which is the shape Blobs is
// good at. Blobs has no public URLs: a store is reachable only through this
// site's own functions, builds and edge functions.
//
// Environment variables were rejected for the pack itself. These functions use
// the Lambda-compatible signature (exports.handler), and Netlify still caps the
// total environment at 4KB in Lambda compatibility mode; the June 2026 removal
// of that cap applies only to the current Functions runtime. The pack is far
// larger than 4KB, so it would not fit, and it would be copied into every
// function's environment besides. Credentials and small switches stay in
// environment variables, which is what they are for, and the variables this app
// adds are all short.
//
// VERSIONING. A pack is written once under pack/<version> and never edited. A
// separate pointer, active, names the version in use. So:
//   - a version is immutable, and its content hash is recorded with it
//   - a job pins the version it started with, and a later edit cannot reach it
//   - rolling back is repointing active at an earlier version
//   - activation is refused unless every required template is present, so no
//     format can ever run against a pack that is missing its own instructions
//
// IT IS ONLY EVER READ ON THE SERVER. No function returns pack content to the
// browser, no endpoint serves it, and there is no prompt-management route. The
// only way in is the private tooling in tools/, which authenticates to Netlify
// with an API token that never ships to the browser.
//
// THERE IS NO FALLBACK. Keeping a copy of the prompts in source as a "safety
// net" would defeat the exercise: anyone reading this repository would still
// have them. If the pack cannot be loaded, generation fails with a configuration
// error that names no content.

const crypto = require('crypto');

const STORE_NAME = 'prompt-packs';
const ACTIVE_KEY = 'active';

// DEPLOY CONTEXT ISOLATION. Netlify shares a site's Blobs stores between
// production, deploy previews and branch deploys, so the pack store itself
// cannot be separated by context. What is separated is the POINTER: each deploy
// reads its own channel, and production's pointer is the plain `active` key.
// Which channel a deploy may read is decided by lib/deploy-context.js from the
// deploy context Netlify stamped at build time, and it fails closed: a
// non-production deploy without a valid non-production channel refuses to
// generate, and can never select production's pointer.
//
// Nothing in the deployed functions can write to this store. This module
// exports no write operation for production code (the only writes are in the
// test seams). That is an application safeguard: the Blobs credentials a
// deploy runs with CAN write site stores, so pointers are also SIGNED with a key
// that no deploy holds, and an unsigned or wrongly signed pointer is refused
// (see lib/pack-signature.js).
const { resolveChannel, CHANNEL_PATTERN } = require('./deploy-context');
const { verifyPointer } = require('./pack-signature');

function packChannel(env) {
  return resolveChannel(env);
}

function pointerKey(channel) {
  return channel === 'production' ? ACTIVE_KEY : `${ACTIVE_KEY}.${channel}`;
}
const PACK_PREFIX = 'pack/';

let injectedStore = null;        // set only by tests
const packCache = new Map();     // version -> pack, per function instance
const activeCache = new Map();   // channel -> { version, hash, at }
const ACTIVE_CACHE_MS = 60 * 1000;

// Every template the application can ask for. Activation and loading both check
// this list, which is what stops a half-built pack reaching production and stops
// one format quietly running against instructions that were never updated.
//
// The names describe structure, not content. Nothing confidential is encoded in
// a key.
const REQUIRED_TEMPLATES = [
  'shared.styleRules.body',
  'shared.styleRules.voiceLines',
  'shared.plantAccuracy.body',
  'shared.plantAccuracy.overlap',
  'shared.giftVoice.body',
  'shared.giftVoice.contextWithBrief',
  'shared.giftVoice.contextWithoutBrief',
  'shared.evidenceRules',
  'shared.storefrontDescriptionRules',
  'shared.comparisonTable.body',
  'shared.comparisonTable.priceHeader',
  'shared.comparisonTable.priceCell',
  'shared.references.block',
  'shared.references.line',
  'shared.productEntry.title',
  'shared.productEntry.url',
  'shared.productEntry.price',
  'shared.productEntry.productType',
  'shared.productEntry.description',
  'shared.productEntry.tags',
  'shared.productEntry.notes',
  'shared.productEntry.noNotes',
  'shared.additionalInstructions',
  'shared.keywordLine',

  'careGuide.document',
  'careGuide.plantTypeConfirmed',
  'careGuide.plantTypeUnconfirmed',
  'careGuide.sections.linked.watering',
  'careGuide.sections.linked.toxicity',
  'careGuide.sections.linked.seasonal',
  'careGuide.sections.unlinked.watering',
  'careGuide.sections.unlinked.toxicity',
  'careGuide.sections.unlinked.seasonal',
  'careGuide.sections.airPlant.soil',
  'careGuide.sections.airPlant.potting',
  'careGuide.sections.airPlant.pruning',
  'careGuide.sections.soilGrown.soil',
  'careGuide.sections.soilGrown.potting',
  'careGuide.sections.soilGrown.pruning',
  'careGuide.sections.soilGrown.soilLinkStandard',
  'careGuide.sections.soilGrown.soilLinkHouseplant',
  'careGuide.sections.unconfirmed.soil',
  'careGuide.sections.unconfirmed.potting',
  'careGuide.sections.unconfirmed.pruning',

  'singlePlantGift.document',
  'singlePlantGift.brief.plant',
  'singlePlantGift.brief.recipient',
  'singlePlantGift.brief.occasion',
  'singlePlantGift.brief.angle',
  'singlePlantGift.brief.care',
  'singlePlantGift.brief.productNotes',
  'singlePlantGift.brief.productUrl',
  'singlePlantGift.introLink',

  'generalGiftGuide.document',
  'generalGiftGuide.brief.recipient',
  'generalGiftGuide.brief.noRecipient',
  'generalGiftGuide.brief.count',
  'generalGiftGuide.brief.budget',
  'generalGiftGuide.brief.characteristics',

  'occasionGiftGuide.document',
  'occasionGiftGuide.brief.occasion',
  'occasionGiftGuide.brief.year',
  'occasionGiftGuide.brief.recipient',
  'occasionGiftGuide.brief.relationship',
  'occasionGiftGuide.brief.count',
  'occasionGiftGuide.brief.budget',
  'occasionGiftGuide.brief.characteristics',
  'occasionGiftGuide.dateSupplied',
  'occasionGiftGuide.dateMissing',
  'occasionGiftGuide.sensitiveBlock',
  'occasionGiftGuide.sensitiveSoftLink',

  'metadata.document',
  'metadata.titleRules',
  'metadata.titleCountRule',
  'metadata.titleNoCountRule',
  'metadata.titleYearRule',
  'metadata.titleNoYearRule',
  'metadata.titleKeywordRule',
  'metadata.titleDirectionRule',
  'metadata.shape.withCatalog',
  'metadata.shape.withoutCatalog',
  'metadata.productRule.wrapper',
  'metadata.productRule.careGuide',
  'metadata.productRule.singlePlant',
  'metadata.relatedRule.careGuide',
  'metadata.relatedRule.gift',
  'metadata.sensitiveRule',
  'metadata.productLines',
  'metadata.catalogBlock',
  'metadata.subject.careGuide',
  'metadata.subject.singlePlantGift',
  'metadata.subject.generalGiftGuide',
  'metadata.subject.occasionGiftGuide',
  'metadata.subject.fallback',
  'metadata.subject.part.recipient',
  'metadata.subject.part.noRecipient',
  'metadata.subject.part.occasion',
  'metadata.subject.part.relationship',
  'metadata.subject.part.characteristics',
  'metadata.subject.part.budget',
  'metadata.subject.part.sensitive'
];

function loadBlobs() {
  return require('@netlify/blobs');
}

function connectPromptStore(event) {
  if (injectedStore) return { connected: false, injected: true };
  const blobs = loadBlobs();
  if (typeof blobs.connectLambda !== 'function') {
    throw new Error('The installed @netlify/blobs does not provide connectLambda.');
  }
  if (!event || typeof event.blobs !== 'string' || !event.blobs) {
    throw new Error('This invocation carries no Netlify Blobs context.');
  }
  blobs.connectLambda(event);
  return { connected: true, injected: false };
}

function getStore() {
  if (injectedStore) return injectedStore;
  return loadBlobs().getStore({ name: STORE_NAME });
}

// Test seam. The committed suites run against a synthetic pack supplied here, so
// no test needs, or contains, a line of the real editorial content.
function usePackForTests(pack, meta) {
  const version = (meta && meta.version) || 'test-pack';
  const map = new Map();
  map.set(PACK_PREFIX + version, JSON.stringify(pack));
  // `sign` comes from tests/support/test-pack.js, which holds a throwaway test
  // key. Without it the pointer is unsigned, which the loader refuses.
  const pointer = { channel: 'production', version, hash: hashPack(pack), activatedAt: new Date(0).toISOString() };
  map.set(ACTIVE_KEY, JSON.stringify(meta && typeof meta.sign === 'function' ? meta.sign(pointer) : pointer));
  injectedStore = {
    async set(key, value) { map.set(key, value); },
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async delete(key) { map.delete(key); },
    async list({ prefix } = {}) {
      const blobs = [];
      for (const key of map.keys()) if (!prefix || key.startsWith(prefix)) blobs.push({ key });
      return { blobs, directories: [] };
    },
    _map: map,
    _isMemoryTestStore: true
  };
  resetCaches();
  return injectedStore;
}
function setPackStoreForTests(store) { injectedStore = store; resetCaches(); return injectedStore; }
function resetPackStoreForTests() { injectedStore = null; resetCaches(); }
function resetCaches() { packCache.clear(); activeCache.clear(); }

// A stable hash of the pack content. Key order is normalised first so the same
// content always hashes the same way, whatever order a tool wrote it in.
function hashPack(pack) {
  const flat = flatten(pack);
  const keys = Object.keys(flat).sort();
  const hash = crypto.createHash('sha256');
  for (const key of keys) hash.update(key).update('\u0000').update(String(flat[key])).update('\u0000');
  return 'sha256:' + hash.digest('hex');
}

function flatten(value, prefix, out) {
  const target = out || {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value)) {
      flatten(value[key], prefix ? `${prefix}.${key}` : key, target);
    }
  } else {
    target[prefix] = value;
  }
  return target;
}

function readPath(pack, path) {
  let node = pack;
  for (const part of String(path).split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

// Completeness check. Returns every missing or empty template rather than the
// first, so one run tells a person everything they have to fix.
function validatePack(pack) {
  if (!pack || typeof pack !== 'object') {
    return { ok: false, missing: REQUIRED_TEMPLATES.slice(), error: 'The pack is not an object.' };
  }
  const missing = [];
  for (const path of REQUIRED_TEMPLATES) {
    const value = readPath(pack, path);
    if (typeof value !== 'string' || !value.trim()) missing.push(path);
  }
  return { ok: missing.length === 0, missing };
}

// Placeholder substitution. {{name}} is replaced from values; an unknown
// placeholder is an error rather than something that ships to the model, because
// a literal {{plantName}} in a prompt is a silent quality failure that no
// structural test would catch.
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function render(template, values) {
  if (typeof template !== 'string') {
    throw new Error('A prompt template is missing from the active prompt pack.');
  }
  const supplied = values || {};
  return template.replace(PLACEHOLDER, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(supplied, name)) {
      throw new Error(`The prompt template refers to an unknown value: ${name}`);
    }
    const value = supplied[name];
    return value === null || value === undefined ? '' : String(value);
  });
}

// The handle every prompt builder is given. It carries the version with it, so a
// builder cannot accidentally mix templates from two packs, and `get` throws a
// clear error rather than returning undefined into a prompt.
function packHandle(pack, version, hash) {
  return {
    version,
    hash,
    raw: pack,
    get(path) {
      const value = readPath(pack, path);
      if (typeof value !== 'string') {
        throw Object.assign(
          new Error(`The active prompt pack is missing the template "${path}".`),
          { code: 'prompt_pack_incomplete' }
        );
      }
      return value;
    },
    render(path, values) {
      return render(this.get(path), values);
    }
  };
}

async function readJson(key) {
  const body = await getStore().get(key, { type: 'text' });
  if (!body) return null;
  try { return JSON.parse(body); } catch { return null; }
}

async function readActivePointer(channel) {
  const ch = channel || packChannel();
  const cached = activeCache.get(ch);
  if (cached && (Date.now() - cached.at) < ACTIVE_CACHE_MS) return cached;
  const pointer = await readJson(pointerKey(ch));
  if (!pointer || !pointer.version) return null;
  // Only a pointer signed by the operator's key counts. A deploy's own Blobs
  // credentials can write this key, but cannot sign. The reason is safe to log:
  // it names no content.
  const check = verifyPointer(pointer, ch, process.env.PROMPT_PACK_PUBLIC_KEY);
  if (!check.ok) {
    console.error('Prompt pack pointer refused on channel', ch, ':', check.reason);
    throw Object.assign(new Error('The prompt pack pointer is not validly signed.'), { code: 'prompt_pack_unsigned', reason: check.reason });
  }
  const entry = { version: String(pointer.version), hash: pointer.hash, channel: ch, at: Date.now() };
  activeCache.set(ch, entry);
  return entry;
}

// Loads one immutable version. Cached per function instance because the document
// never changes under a version, which is the whole point of writing it once.
async function loadPackVersion(version) {
  if (packCache.has(version)) return packCache.get(version);
  const pack = await readJson(PACK_PREFIX + version);
  if (!pack) {
    throw Object.assign(
      new Error(`Prompt pack version "${version}" is not available.`),
      { code: 'prompt_pack_unavailable' }
    );
  }
  const check = validatePack(pack);
  if (!check.ok) {
    // The names of the missing templates are safe to log: they are structural.
    console.error('Prompt pack incomplete:', version, 'missing', check.missing.join(', '));
    throw Object.assign(
      new Error('The prompt pack in use is incomplete.'),
      { code: 'prompt_pack_incomplete' }
    );
  }
  const handle = packHandle(pack, version, hashPack(pack));
  packCache.set(version, handle);
  return handle;
}

// What a new generation uses. A job that is already running passes its pinned
// version to loadPackVersion instead, so an activation mid-run cannot reach it.
async function loadActivePack() {
  const pointer = await readActivePointer();
  if (!pointer) {
    throw Object.assign(
      new Error('No prompt pack is active.'),
      { code: 'prompt_pack_unavailable' }
    );
  }
  const handle = await loadPackVersion(pointer.version);
  // The pointer records the hash the version had when it was activated. A
  // stored version whose content no longer matches is refused, not used.
  if (pointer.hash !== handle.hash) {
    console.error('Prompt pack hash mismatch for', pointer.version, 'on channel', pointer.channel);
    throw Object.assign(new Error('The active prompt pack does not match its recorded hash.'), { code: 'prompt_pack_incomplete' });
  }
  return handle;
}

// One message for every pack failure, so a browser never learns whether a pack
// is missing, incomplete or unreadable, and never sees a template name.
const PACK_FAILURE = {
  status: 503,
  code: 'prompt_config',
  error: 'The article instructions are not configured on the server, so no article was generated. Ask whoever manages the site to check the prompt pack setup.'
};

module.exports = {
  connectPromptStore, getStore,
  loadActivePack, loadPackVersion, readActivePointer,
  validatePack, hashPack, render, packHandle, flatten,
  usePackForTests, setPackStoreForTests, resetPackStoreForTests,
  packChannel, pointerKey, CHANNEL_PATTERN,
  REQUIRED_TEMPLATES, STORE_NAME, ACTIVE_KEY, PACK_PREFIX, PACK_FAILURE
};
