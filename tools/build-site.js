#!/usr/bin/env node
// Builds the static site into public/, which is the only directory Netlify
// publishes.
//
// WHY THIS EXISTS. netlify.toml used to publish the repository root
// (publish = "."). Every file in the repository was therefore served by the live
// site to anyone who asked for it by path: function source, the prompt modules,
// tests, the README. The site now publishes an explicit allowlist of the files a
// browser actually needs, and nothing else.
//
// The allowlist is deliberately short and explicit. A new browser file has to be
// added here on purpose; it cannot be published by accident.
//
// The check at the end refuses to finish if the output contains anything that
// looks like server code, so a mistaken addition to the list fails the deploy
// instead of shipping.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public');

const ALLOWLIST = [
  'index.html',
  'app/formats.js',
  'app/main.js',
  'app/products.js',
  'app/ui.js',
  'data/articles.js',
  'data/catalog.js',
  'data/gift-collections.js'
];

// Strings that only appear in server code. Finding any of them in the published
// output means server code has been published.
const SERVER_MARKERS = [
  'exports.handler',
  'require(\'@netlify/blobs\')',
  'require(\'@anthropic-ai/sdk\')',
  'process.env.',
  'connectLambda',
  'REQUIRED_TEMPLATES',
  'SESSION_SECRET',
  'SITE_PASSWORD'
];

// The deploy context Netlify assigned to this build, stamped beside the
// functions so they can tell at runtime which context they belong to (Netlify
// does not expose CONTEXT to functions). CONTEXT is a reserved, read-only build
// variable. Anything unrecognised, including a missing value in a local build,
// is stamped "unknown", which the functions treat as "refuse to generate".
const CONTEXT_FILE = path.join(ROOT, 'netlify', 'functions', 'lib', 'deploy-context.json');
const KNOWN_CONTEXTS = ['production', 'deploy-preview', 'branch-deploy', 'dev'];

function stampDeployContext(env) {
  const raw = String((env || process.env).CONTEXT || '');
  const context = KNOWN_CONTEXTS.includes(raw) ? raw : 'unknown';
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify({ context }) + '\n');
  return context;
}

function build(env) {
  stampDeployContext(env);
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const rel of ALLOWLIST) {
    const from = path.join(ROOT, rel);
    const to = path.join(OUT, rel);
    if (!fs.existsSync(from)) throw new Error(`Allowlisted file is missing: ${rel}`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return verify();
}

function listFiles(dir, base) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(rel);
  }
  return out;
}

function verify() {
  const files = listFiles(OUT, OUT).sort();
  const unexpected = files.filter(f => !ALLOWLIST.includes(f));
  if (unexpected.length) throw new Error('Unexpected files in public/: ' + unexpected.join(', '));
  for (const rel of files) {
    const text = fs.readFileSync(path.join(OUT, rel), 'utf8');
    const hit = SERVER_MARKERS.find(m => text.includes(m));
    if (hit) throw new Error(`public/${rel} contains server-only code (${hit}).`);
    if (/\.map$/.test(rel) || /sourceMappingURL=/.test(text)) throw new Error(`public/${rel} carries a source map.`);
  }
  return files;
}

if (require.main === module) {
  const files = build();
  console.log(`public/ built with ${files.length} files: ${files.join(', ')}`);
  console.log(`deploy context stamped for the functions: ${JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8')).context}`);
}

module.exports = { build, verify, stampDeployContext, ALLOWLIST, SERVER_MARKERS, OUT, CONTEXT_FILE };
