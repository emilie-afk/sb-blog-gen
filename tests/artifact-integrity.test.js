// Artifact integrity: everything that ships inside the Lambda must be intact.
//
// Why this exists: the deployed generate function failed at init with
// Runtime.UserCodeSyntaxError because data/articles.js arrived in the repository
// truncated (14183 of 58918 bytes) with binary padding appended. Every source
// file was fine in the working tree, so source-only checks passed while the
// deployed artifact could not be parsed.
//
// This walks the real require graph from each function entrypoint, so any file
// that is added to the bundle later is covered automatically, and then checks the
// two things a plain syntax check cannot: that the bytes are valid UTF-8, and
// that the data files are complete rather than merely parseable. A file can be
// truncated at a point where it still parses.
//
// Run: node tests/artifact-integrity.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const results = [];
const check = (name, cond, extra) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : ''));

const ENTRYPOINTS = fs.readdirSync(path.join(ROOT, 'netlify/functions'))
  .filter(f => f.endsWith('.js'))
  .map(f => path.join(ROOT, 'netlify/functions', f));

// ── Walk the require graph, relative requires only (bundled project files) ──
function bundledFiles() {
  const seen = new Set();
  const queue = [...ENTRYPOINTS];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      let resolved = path.resolve(path.dirname(file), m[1]);
      if (!fs.existsSync(resolved) && fs.existsSync(resolved + '.js')) resolved += '.js';
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) queue.push(resolved);
    }
  }
  return Array.from(seen).sort();
}

const files = bundledFiles();
check('require graph reaches the whole bundle', files.length >= 13, files.length + ' files');
check('the article index is in the bundle', files.some(f => f.endsWith('data/articles.js')));
check('the plant catalog is in the bundle', files.some(f => f.endsWith('data/catalog.js')));

// ── Byte-level integrity ────────────────────────────────────────
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const raw = fs.readFileSync(file);

  let text = null;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch (err) {
    // Report the offset so a corrupted upload can be located immediately.
    let offset = -1;
    for (let i = 0; i < raw.length && offset < 0; i++) {
      try { new TextDecoder('utf-8', { fatal: true }).decode(raw.subarray(0, i)); }
      catch { offset = i - 1; }
    }
    check(`valid UTF-8: ${rel}`, false, `invalid byte near offset ${offset}`);
    continue;
  }
  check(`valid UTF-8: ${rel}`, true);

  // Control characters outside tab/newline/carriage return mean binary padding.
  const control = [...text].findIndex(c => {
    const n = c.charCodeAt(0);
    return n < 9 || (n > 13 && n < 32);
  });
  check(`no binary padding: ${rel}`, control === -1, control === -1 ? undefined : `control char at index ${control}`);

  try { new vm.Script(text, { filename: rel }); check(`parses: ${rel}`, true); }
  catch (err) { check(`parses: ${rel}`, false, err.message); }
}

// ── Completeness of the data files ──────────────────────────────
// A truncated file can still parse. These floors catch that; raise them when the
// real lists grow, never lower them to make a broken file pass.
const MIN_ARTICLES = 400;
const MIN_CATALOG = 50;

try {
  const { ARTICLES } = require(path.join(ROOT, 'data/articles.js'));
  check('article index is complete', Array.isArray(ARTICLES) && ARTICLES.length >= MIN_ARTICLES,
    (ARTICLES || []).length + ' entries, floor is ' + MIN_ARTICLES);
  check('every article has a title and url',
    ARTICLES.every(a => a && typeof a.t === 'string' && a.t && /^https:\/\/succulentsbox\.com\//.test(a.u || '')));
  check('no duplicate article urls', new Set(ARTICLES.map(a => a.u)).size === ARTICLES.length);
} catch (err) {
  check('article index loads', false, err.message);
}

try {
  const { CATALOG } = require(path.join(ROOT, 'data/catalog.js'));
  check('offline plant fallback is complete', Array.isArray(CATALOG) && CATALOG.length >= MIN_CATALOG,
    (CATALOG || []).length + ' entries, floor is ' + MIN_CATALOG);
  check('every fallback plant has a title and handle',
    CATALOG.every(p => p && typeof p.t === 'string' && p.t && typeof p.h === 'string' && p.h));
} catch (err) {
  check('offline plant fallback loads', false, err.message);
}

console.log(results.filter(r => r.startsWith('FAIL')).join('\n'));
const failures = results.filter(r => r.startsWith('FAIL')).length;
console.log(`${results.length - failures} checks passed across ${files.length} bundled files`);
console.log('\n' + failures + ' failures of ' + results.length);
process.exitCode = failures ? 1 : 0;
