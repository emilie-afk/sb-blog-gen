#!/usr/bin/env node
// PRIVATE TOOL. Manages the prompt packs stored in Netlify Blobs. It contains no
// prompt content: every pack it handles is a file you hold privately.
//
//   node tools/pack.js validate <file>
//   node tools/pack.js import   <file> --version <id> [--activate]
//   node tools/pack.js keygen   --out <private key file>
//   node tools/pack.js activate <version> --channel <production|preview|...> --key <private key file>
//   node tools/pack.js rollback --channel <channel> --key <private key file>
//   node tools/pack.js list
//   node tools/pack.js export   <version> --out <file>
//
// validate runs offline. Every other command talks to the site's Blobs store and
// needs two values in YOUR LOCAL SHELL, never in Netlify's site settings:
//
//   NETLIFY_SITE_ID     the site's API ID (Site configuration > General)
//   NETLIFY_AUTH_TOKEN  a personal access token for an account on the team
//
// These never reach the deployed functions. The functions read the store
// through the Blobs context Netlify gives every invocation, so the site itself
// needs neither value.
//
// THE RULES THIS ENFORCES:
//   - a version is written once and never changed; import refuses an existing id
//   - nothing is activated unless every required template is present
//   - activation re-checks the stored content against the hash recorded at
//     import, so a pack altered in storage cannot be activated
//   - every activation is recorded, so rollback knows what came before
//   - every pointer is signed with the operator's private key (--key). The
//     functions accept only pointers that verify against PROMPT_PACK_PUBLIC_KEY,
//     so a deploy's own Blobs credentials cannot activate anything. Keep the
//     private key out of the repository, out of Netlify, and out of shared drives.
//   - activate and rollback name their channel explicitly; there is no default,
//     so nothing reaches production by accident. A deploy context reads only its
//     own channel (PROMPT_PACK_CHANNEL), and production's is "production".
//
// TIMING. The active pointer is an update to an existing key, which Netlify
// Blobs propagates within about 60 seconds, and each function instance caches
// the pointer for up to 60 seconds more. Allow about two minutes for an
// activation or a rollback to reach every new generation. A generation already
// running keeps the version it started with.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const promptPack = require(path.join(ROOT, 'netlify/functions/lib/prompt-pack'));
const signature = require(path.join(ROOT, 'netlify/functions/lib/pack-signature'));

const VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const META_PREFIX = 'meta/';
const HISTORY_PREFIX = 'history/';

function fail(message, code) {
  const err = new Error(message);
  err.exitCode = code || 1;
  throw err;
}

function readPackFile(file) {
  if (!file) fail('Name the pack file.');
  let pack;
  try {
    pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`${file} is not readable JSON: ${err.message}`);
  }
  return pack;
}

// Completeness, then a dry run. The dry run renders every article format and
// its metadata prompt for every synthetic brief in tests/fixtures, so a
// placeholder the application does not fill, or a template that renders to
// something still containing {{...}}, is caught here rather than in a live
// generation. Nothing is sent anywhere and nothing is printed but the result.
function checkComplete(pack) {
  const check = promptPack.validatePack(pack);
  if (!check.ok) {
    fail(`The pack is incomplete. Missing or empty templates:\n  ${check.missing.join('\n  ')}`);
  }
  const rendered = dryRun(pack);
  return Object.assign({}, check, { rendered });
}

function dryRun(pack) {
  const handle = promptPack.packHandle(pack, 'dry-run', promptPack.hashPack(pack));
  const { validateRequest } = require(path.join(ROOT, 'netlify/functions/lib/validate'));
  const { allBriefs } = require(path.join(ROOT, 'tests/fixtures/prompt-briefs'));
  const builders = {
    care_guide: require(path.join(ROOT, 'netlify/functions/lib/prompt-care-guide')).buildCareGuidePrompt,
    single_plant_gift: require(path.join(ROOT, 'netlify/functions/lib/prompt-single-plant-gift')).buildSinglePlantGiftPrompt,
    general_gift_guide: require(path.join(ROOT, 'netlify/functions/lib/prompt-general-gift-guide')).buildGeneralGiftGuidePrompt,
    occasion_gift_guide: require(path.join(ROOT, 'netlify/functions/lib/prompt-occasion-gift-guide')).buildOccasionGiftGuidePrompt
  };
  const { buildMetadataAndRelatedPrompt } = require(path.join(ROOT, 'netlify/functions/lib/prompt-metadata-related'));
  let count = 0;
  allBriefs().forEach((brief, i) => {
    const { articleType, fields } = validateRequest(brief.articleType, brief.fields);
    for (const [kind, build] of [['article', () => builders[articleType](fields, handle)],
                                  ['metadata', () => buildMetadataAndRelatedPrompt(articleType, fields, handle)]]) {
      let text;
      try { text = build(); } catch (err) { fail(`Dry run failed for ${articleType} ${kind}, brief #${i}: ${err.message}`); }
      if (/\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/.test(text)) fail(`Dry run left an unfilled placeholder in ${articleType} ${kind}, brief #${i}.`);
      count += 1;
    }
  });
  return count;
}

async function readJson(store, key) {
  const body = await store.get(key, { type: 'text' });
  if (!body) return null;
  try { return JSON.parse(body); } catch { return null; }
}

// ── commands ─────────────────────────────────────────────────────
// Each command takes the store as an argument so the test suite can run them
// against an in-memory store without any network access.

function validate(file) {
  const pack = readPackFile(file);
  const check = checkComplete(pack);
  const bytes = Buffer.byteLength(JSON.stringify(pack));
  return { ok: true, hash: promptPack.hashPack(pack), bytes, templates: promptPack.REQUIRED_TEMPLATES.length, rendered: check.rendered };
}

async function importPack(store, file, version, now) {
  if (!version || !VERSION_PATTERN.test(version)) {
    fail('Give the pack a version id: lower case letters, digits, dot, dash or underscore, for example 2026-10-23.1');
  }
  const pack = readPackFile(file);
  checkComplete(pack);
  const key = promptPack.PACK_PREFIX + version;
  if (await store.get(key, { type: 'text' })) {
    fail(`Version ${version} already exists. Versions are immutable: import the change under a new version id.`);
  }
  const hash = promptPack.hashPack(pack);
  await store.set(key, JSON.stringify(pack));
  await store.set(META_PREFIX + version, JSON.stringify({
    version, hash, importedAt: new Date(now || Date.now()).toISOString()
  }));
  return { version, hash };
}

function requireChannel(channel) {
  if (!channel) fail('Name the channel: --channel production, --channel preview, or another channel a deploy context uses.');
  if (!promptPack.CHANNEL_PATTERN.test(channel)) fail(`"${channel}" is not a valid channel name.`);
  return channel;
}

function readSigningKey(keyOrFile) {
  if (!keyOrFile) fail('Pass the signing key with --key <file>. Create one once with: node tools/pack.js keygen --out <file>');
  if (/-----BEGIN PRIVATE KEY-----/.test(String(keyOrFile))) return String(keyOrFile);
  try { return fs.readFileSync(keyOrFile, 'utf8'); } catch (err) { fail(`The signing key ${keyOrFile} could not be read: ${err.message}`); }
}

async function activate(store, version, now, channel, signingKey) {
  requireChannel(channel);
  const privateKey = readSigningKey(signingKey);
  const key = promptPack.pointerKey(channel);
  const pack = await readJson(store, promptPack.PACK_PREFIX + version);
  if (!pack) fail(`Version ${version} is not in the store.`);
  checkComplete(pack);
  const meta = await readJson(store, META_PREFIX + version);
  const hash = promptPack.hashPack(pack);
  if (meta && meta.hash && meta.hash !== hash) {
    fail(`Version ${version} no longer matches the hash recorded when it was imported. It will not be activated.`);
  }
  const previous = await readJson(store, key);
  const at = new Date(now || Date.now()).toISOString();
  let pointer;
  try {
    pointer = signature.signPointer(privateKey, { channel, version, hash, activatedAt: at });
  } catch (err) {
    fail(`The signing key could not sign: ${err.message}`);
  }
  await store.set(key, JSON.stringify(pointer));
  // A new key per activation, so the history is never overwritten and survives
  // the eventual consistency of the pointer itself.
  await store.set(`${HISTORY_PREFIX}${channel}/${Date.parse(at)}-${version}`, JSON.stringify({
    version, hash, channel, activatedAt: at, previous: previous ? previous.version : null
  }));
  return { version, hash, channel, previous: previous ? previous.version : null };
}

async function history(store, channel) {
  const listing = await store.list({ prefix: HISTORY_PREFIX + (channel ? channel + '/' : '') });
  const entries = [];
  for (const blob of (listing && listing.blobs) || []) {
    const entry = await readJson(store, blob.key);
    if (entry) entries.push(entry);
  }
  return entries.sort((a, b) => Date.parse(a.activatedAt) - Date.parse(b.activatedAt));
}

async function rollback(store, now, channel, signingKey) {
  requireChannel(channel);
  const active = await readJson(store, promptPack.pointerKey(channel));
  if (!active) fail(`No pack is active on channel ${channel}, so there is nothing to roll back from.`);
  const entries = await history(store, channel);
  const current = entries.filter(e => e.version === active.version).pop();
  const target = current && current.previous;
  if (!target) fail(`Version ${active.version} has no recorded predecessor on ${channel}. Use "activate <version> --channel ${channel}".`);
  return activate(store, target, now, channel, signingKey);
}

function keygen(out) {
  if (!out) fail('Name the private key file with --out. Keep it outside the repository.');
  if (fs.existsSync(out)) fail(`${out} already exists; refusing to overwrite a signing key.`);
  const pair = signature.generateKeyPair();
  fs.writeFileSync(out, pair.privateKeyPem, { mode: 0o600 });
  return { out, publicKeyBase64: pair.publicKeyBase64 };
}

async function list(store) {
  const listing = await store.list({ prefix: META_PREFIX });
  const versions = [];
  for (const blob of (listing && listing.blobs) || []) {
    const meta = await readJson(store, blob.key);
    if (meta) versions.push(meta);
  }
  versions.sort((a, b) => Date.parse(a.importedAt) - Date.parse(b.importedAt));
  // Every channel's pointer: `active` (production) and `active.<channel>`.
  const channels = {};
  const pointers = await store.list({ prefix: promptPack.ACTIVE_KEY });
  for (const blob of (pointers && pointers.blobs) || []) {
    if (blob.key !== promptPack.ACTIVE_KEY && !blob.key.startsWith(promptPack.ACTIVE_KEY + '.')) continue;
    const p = await readJson(store, blob.key);
    const name = blob.key === promptPack.ACTIVE_KEY ? 'production' : blob.key.slice(promptPack.ACTIVE_KEY.length + 1);
    if (p) channels[name] = p.version;
  }
  return { active: channels.production || null, channels, versions };
}

async function exportPack(store, version, out) {
  if (!out) fail('Name the output file with --out.');
  const pack = await readJson(store, promptPack.PACK_PREFIX + version);
  if (!pack) fail(`Version ${version} is not in the store.`);
  fs.writeFileSync(out, JSON.stringify(pack, null, 2) + '\n', { mode: 0o600 });
  return { version, out, hash: promptPack.hashPack(pack) };
}

function remoteStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) {
    fail('Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN in this shell first. They are never needed in Netlify itself.');
  }
  return require('@netlify/blobs').getStore({ name: promptPack.STORE_NAME, siteID, token });
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(argv) {
  const [command, target] = argv;
  switch (command) {
    case 'keygen': {
      const k = keygen(flag(argv, '--out'));
      return `wrote the private signing key to ${k.out} (mode 600). Keep it private.\nSet this in Netlify for every deploy context, as PROMPT_PACK_PUBLIC_KEY:\n${k.publicKeyBase64}`;
    }
    case 'validate': {
      const r = validate(target);
      return `valid: ${r.templates} templates, ${r.rendered} prompts rendered in the dry run, ${r.bytes} bytes, ${r.hash}`;
    }
    case 'import': {
      const store = remoteStore();
      const r = await importPack(store, target, flag(argv, '--version'));
      let line = `imported ${r.version} (${r.hash})`;
      if (argv.includes('--activate')) {
        const a = await activate(store, r.version, undefined, flag(argv, '--channel'), flag(argv, '--key'));
        line += `\nactivated ${a.version} on ${a.channel}, previously ${a.previous || 'none'}. Allow about two minutes to take effect.`;
      } else {
        line += `\nnot active on any channel yet. Run: node tools/pack.js activate ${r.version} --channel <channel>`;
      }
      return line;
    }
    case 'activate': {
      const a = await activate(remoteStore(), target, undefined, flag(argv, '--channel'), flag(argv, '--key'));
      return `activated ${a.version} on ${a.channel}, previously ${a.previous || 'none'}. Allow about two minutes to take effect.`;
    }
    case 'rollback': {
      const a = await rollback(remoteStore(), undefined, flag(argv, '--channel'), flag(argv, '--key'));
      return `rolled back ${a.channel} to ${a.version}. Allow about two minutes to take effect.`;
    }
    case 'list': {
      const r = await list(remoteStore());
      return [...Object.entries(r.channels).map(([c, v]) => `active on ${c}: ${v}`), ...(Object.keys(r.channels).length ? [] : ['active: none']), ...r.versions.map(v => `  ${v.version}  ${v.hash}  imported ${v.importedAt}`)].join('\n');
    }
    case 'export': {
      const r = await exportPack(remoteStore(), target, flag(argv, '--out'));
      return `exported ${r.version} to ${r.out} (${r.hash}). Keep this file private.`;
    }
    default:
      return fail('Commands: keygen, validate, import, activate, rollback, list, export. See the header of tools/pack.js.');
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    line => console.log(line),
    err => { console.error('pack: ' + err.message); process.exit(err.exitCode || 1); }
  );
}

module.exports = { keygen, validate, dryRun, importPack, activate, rollback, list, history, exportPack, VERSION_PATTERN };
