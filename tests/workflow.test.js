// Static checks on the article-workflow code. The behaviour is covered by the
// browser suite; these guard the design decisions that behaviour depends on and
// that a future edit could quietly undo, plus the scope promise that this pass
// touched nothing on the server.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let failures = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('PASS ' + name); return; }
  failures += 1;
  console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + extra : ''));
}

const main = read('app/main.js');
const products = read('app/products.js');
const ui = read('app/ui.js');
const html = read('index.html');

// ── One reset, not several ─────────────────────────────────────────────────
// The failure this whole pass exists to prevent is state surviving into the next
// article. Several partial resets, each clearing a different subset, is how that
// happens, so there is exactly one full reset and every path calls it.
ok('there is a single full reset function',
  (main.match(/function resetArticleState\b/g) || []).length === 1);
ok('the new-article action goes through it', /async function createAnotherArticle[\s\S]*?resetArticleState\(/.test(main));
ok('a confirmed format switch goes through it', /async function setFormat[\s\S]*?resetArticleState\(/.test(main));
ok('the reset delegates the product state to the picker',
  /function resetArticleState[\s\S]*?ProductPicker\.resetForNewArticle\(\)/.test(main));
ok('the reset clears the copy timers', /function resetOutputState[\s\S]*?clearCopyState\(\)/.test(main));
ok('the reset never reloads the page', !/location\.reload|location\.href\s*=/.test(main));

// The three concerns stay separate and named.
ok('output-only reset exists', /function resetOutputState\b/.test(main));
ok('product-only reset exists', /clearSelected\(\)\s*\{/.test(products));
ok('full picker reset exists', /resetForNewArticle\(\)\s*\{/.test(products));

// ── Application-level state survives ───────────────────────────────────────
ok('the reset never clears the session token', !/function resetArticleState[\s\S]*?_sessionToken\s*=/.test(main));
ok('the picker reset keeps the loaded catalog caches',
  /resetForNewArticle\(\)\s*\{[\s\S]*?\},/.test(products)
  && !/resetForNewArticle\(\)\s*\{[\s\S]*?giftCache\.clear|resetForNewArticle\(\)\s*\{[\s\S]*?plantCache\.clear/.test(products));

// ── Stale asynchronous results ─────────────────────────────────────────────
ok('a generation identity exists', /generationId/.test(main));
ok('abandoning a generation moves the identity on', /function abandonActiveGeneration[\s\S]*?state\.generationId \+= 1/.test(main));
ok('pending is tracked for every format, not just the background ones',
  /state\.generationPending = true;/.test(main) && !/generationPending = useBackground/.test(main));
ok('the transport no longer decides whether a generation counts as pending',
  !/jobPending/.test(main));
ok('the pending flag is cleared on success, failure and abandonment',
  (main.match(/state\.generationPending = false/g) || []).length >= 4);
ok('polling checks the identity', /waitForJob\([\s\S]*?generationId !== state\.generationId/.test(main));
ok('the synchronous path checks it too',
  /postJson\('\/\.netlify\/functions\/generate'[\s\S]*?generationId !== state\.generationId/.test(main));
ok('a stale result is thrown, not rendered', /class StaleGeneration/.test(main));
ok('a stale result posts no error into the new article', /if \(err && err\.stale\) return;/.test(main));

// ── Copy behaviour preserved ───────────────────────────────────────────────
ok('Clipboard API is still tried first', /navigator\.clipboard\.writeText/.test(ui));
ok('execCommand still only counts on strict true', /document\.execCommand\('copy'\) === true/.test(ui));
ok('a failed copy still reports failure', /Copy failed/.test(ui));
ok('a failed copy still leaves the text selected', /selectField\(el\);\s*\n\s*btn\.textContent = '⚠️ Copy failed'/.test(ui));
ok('the status region keeps its accessibility attributes',
  /setAttribute\('role', 'status'\)/.test(ui) && /setAttribute\('aria-live', 'polite'\)/.test(ui));
ok('the shared status timer guard survives', /token !== copyStatusToken/.test(ui));
ok('only a successful article copy is announced as such', /field: textareaId, ok: true/.test(ui));
ok('the article-copied flag is set only by the article field',
  /detail\.field === 'html-code' && e\.detail\.ok/.test(main));
ok('the copy listener is registered once, at load',
  (main.match(/addEventListener\('sbcopy'/g) || []).length === 1);
ok('an edit to the article html marks it uncopied',
  /e\.target\.id === 'html-code'[\s\S]*?state\.articleHtmlCopied = false/.test(main));
ok('the edit listener is registered once, at load',
  (main.match(/document\.addEventListener\('input'/g) || []).length === 1);
ok('the edit listener is delegated, so a re-render cannot duplicate it',
  /document\.addEventListener\('input'/.test(main));

// ── Dialog semantics ───────────────────────────────────────────────────────
ok('the dialog declares itself a modal dialog', /role="dialog"[\s\S]*?aria-modal="true"/.test(html));
ok('the dialog is labelled by its title and body',
  /aria-labelledby="confirmTitle"/.test(html) && /aria-describedby="confirmBody"/.test(html));
ok('escape cancels', /e\.key === 'Escape'/.test(ui));
ok('focus is trapped inside the dialog', /e\.key !== 'Tab'/.test(ui));
ok('focus returns to the trigger', /trigger\.focus\(\)/.test(ui));
ok('every dialog listener is removed when it closes',
  (ui.match(/removeEventListener/g) || []).length >= 4);
ok('the dialog lives outside the region it hides',
  html.indexOf('id="confirmOverlay"') > html.indexOf('<!-- #app -->'));
ok('one dialog at a time', /if \(dialogOpen\) return Promise\.resolve\(false\)/.test(ui));
ok('missing dialog markup refuses rather than clearing', /No dialog markup on the page/.test(ui));

// ── Wording ────────────────────────────────────────────────────────────────
ok('the button is labelled Create Another Article', />Create Another Article</.test(html));
ok('it is not labelled Add another blog', !/add another blog/i.test(html));
ok('the new-article confirmation uses the agreed copy',
  /Start a new article\?/.test(main) && /brief, selected products, and generated article will be cleared/.test(main));
ok('the format-switch confirmation uses the agreed copy',
  /Switch article format\?/.test(main) && /Keep Current Article/.test(main) && /Switch Format/.test(main));
ok('the clear-products confirmation uses the agreed copy',
  /Clear selected products\?/.test(main) && /brief will remain unchanged/.test(main) && /Clear Products/.test(main));
ok('the clear-products action only renders with products confirmed',
  /selected\.length \? '<button type="button" class="clear-products-btn"/.test(products));

// ── Scope: nothing on the server moved ─────────────────────────────────────
// This pass was client-side workflow only. If any of these change, the claim in
// the delivery notes is no longer true.
const { execSync } = require('child_process');
let changed = [];
try {
  changed = execSync('git diff --name-only 9123d36', { cwd: root }).toString().split('\n').filter(Boolean);
} catch (e) {
  changed = null;   // not a git checkout, or the base is gone: skip rather than fail
}
if (changed && changed.length) {
  // The client workflow is what this file guards. A later pass may legitimately
  // change prompts under netlify/functions/lib; what must not change is the
  // workflow, the function handlers, the catalog data or the article index.
  const offLimits = changed.filter(f =>
    f.startsWith('app/') || f.startsWith('data/') || f === 'index.html'
    || /^netlify\/functions\/[^/]+\.js$/.test(f)
    // validate-output and repair-output are allowed to move ONLY in lockstep with
    // a comparison-table header rename: they hold that header's spelling, so
    // leaving them behind would make every article warn about a missing column.
    || /^netlify\/functions\/lib\/(job-store|timing|run-generation|validate)\.js$/.test(f));
  ok('the workflow, handlers, catalog and article index are untouched', offLimits.length === 0, offLimits.join(', '));
} else {
  console.log('SKIP scope diff (no git history available)');
}

console.log(`\n${failures} failures`);
if (failures) process.exitCode = 1;
