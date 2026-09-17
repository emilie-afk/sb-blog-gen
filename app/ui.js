// Output rendering, copy helpers, and the preview sanitizer.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function $(id) { return document.getElementById(id); }

// ── Preview sanitizer ────────────────────────────────────────────
// The generated article is written by the model, not by a person, but it still
// goes through an allowlist before it is put in the DOM. The allowlist covers
// everything the Shopify-compatible output uses, so formatting is not affected.
const ALLOWED_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'P', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY',
  'TR', 'TH', 'TD', 'A', 'STRONG', 'EM', 'B', 'I', 'BR', 'HR', 'DIV', 'SPAN', 'IMG', 'BLOCKQUOTE', 'SMALL']);
const ALLOWED_ATTRS = new Set(['style', 'href', 'src', 'alt', 'id', 'title', 'colspan', 'rowspan', 'width', 'height', 'target', 'rel']);

function sanitizeHTML(html) {
  const doc = document.implementation.createHTMLDocument('preview');
  doc.body.innerHTML = String(html || '');
  const walk = (node) => {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); return; }
      if (!ALLOWED_TAGS.has(child.tagName)) { child.remove(); return; }
      Array.from(child.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '');
        if (!ALLOWED_ATTRS.has(name) || name.startsWith('on')) { child.removeAttribute(attr.name); return; }
        if ((name === 'href' || name === 'src') && /^\s*(javascript|data|vbscript):/i.test(value)) {
          child.removeAttribute(attr.name);
        }
        if (name === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(value)) {
          child.removeAttribute(attr.name);
        }
      });
      walk(child);
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

// ── Response reading ─────────────────────────────────────────────
// Netlify can answer with an HTML error page or a plain text gateway message
// rather than our JSON. Read whatever actually came back, keep the status, and
// never surface raw platform internals to the user.
async function readResponse(res) {
  const type = (res.headers.get('content-type') || '').toLowerCase();
  let raw = '';
  try { raw = await res.text(); } catch { raw = ''; }

  if (type.includes('application/json')) {
    try { return JSON.parse(raw); } catch { /* fall through to the text path */ }
  }
  if (raw.trim().startsWith('{')) {
    try { return JSON.parse(raw); } catch { /* not JSON after all */ }
  }
  return { error: describeNonJson(res.status, raw), code: codeForStatus(res.status), nonJson: true };
}

function codeForStatus(status) {
  if (status === 504 || status === 408) return 'gateway_timeout';
  if (status === 502 || status === 503) return 'bad_gateway';
  if (status === 500) return 'server_error';
  return 'unexpected_response';
}

function describeNonJson(status, raw) {
  const looksLikeTimeout = /task timed out|timed out|timeout/i.test(String(raw || ''));
  if (status === 504 || status === 408 || looksLikeTimeout) {
    return 'Generation took too long. Try again or use fewer products. (The server returned a ' + (status || 504) + ' timeout response.)';
  }
  if (status === 502 || status === 503) {
    return `The generation service returned an unexpected response (HTTP ${status}). Try again in a moment.`;
  }
  if (status >= 500) {
    return `The generation service returned an unexpected response (HTTP ${status}).`;
  }
  if (status === 401 || status === 403) {
    return 'Your session is no longer valid. Please sign in again.';
  }
  return `The server returned an unreadable response (HTTP ${status}).`;
}

// ── Copy helpers ─────────────────────────────────────────────────
// The old version called document.execCommand('copy') and threw its return value
// away, then said "Copied!" unconditionally. execCommand returns false whenever
// the copy did not happen, and it is deprecated: in a page served over a context
// where the clipboard is blocked, or where the browser has dropped execCommand,
// the button reported success while the clipboard still held whatever was in it.
// Someone then pasted the previous article into a post.
//
// Now: the async Clipboard API first, execCommand only as a fallback and only
// when it returns exactly true, and "Copied!" only after one of those succeeded.
// A failure says so, leaves the text selected and focused so it can be copied by
// hand, and never alters the content being copied.

const COPY_RESET_MS = 2500;
const copyTimers = {};   // one pending restore timer per button

// A polite, non-interrupting announcement region. Created once, on demand, so the
// markup does not have to carry it and an older index.html still works.
function copyStatusRegion() {
  let region = document.getElementById('copy-status');
  if (!region) {
    region = document.createElement('div');
    region.id = 'copy-status';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.className = 'copy-status';
    document.body.appendChild(region);
  }
  return region;
}

// The status region is shared by all four buttons, so its lifecycle cannot be
// owned by any one of them. It is guarded two ways:
//   - one timer, cleared and replaced on every new attempt, so a newer message
//     is never cut short by an older button's schedule;
//   - a token, so a timer that somehow survives its clearTimeout still refuses
//     to erase a message it did not write.
// Without this the message was set and never cleared: the button went back to
// its idle label while "Copied to clipboard" stayed pinned to the screen.
let copyStatusTimer = null;
let copyStatusToken = 0;

function announceCopy(message) {
  const region = copyStatusRegion();
  // Clearing first makes a repeated identical message announce again.
  region.textContent = '';
  region.textContent = message;

  const token = ++copyStatusToken;
  if (copyStatusTimer) clearTimeout(copyStatusTimer);
  copyStatusTimer = setTimeout(() => {
    copyStatusTimer = null;
    // Only the attempt that wrote the current message may clear it.
    if (token !== copyStatusToken) return;
    // Clear the text only. The element keeps its role and aria-live so the next
    // message is announced from a region that was there all along, and CSS hides
    // it while it is empty.
    copyStatusRegion().textContent = '';
  }, COPY_RESET_MS);
  return token;
}

// Restores a button to its idle label. Any timer already pending for that button
// is cleared first, so two quick clicks cannot leave an earlier timer to wipe the
// newer label out from under it. The status message clears on its own schedule,
// started by announceCopy at the same moment, so the two reset together.
function scheduleCopyReset(btn, buttonId, original) {
  if (copyTimers[buttonId]) clearTimeout(copyTimers[buttonId]);
  copyTimers[buttonId] = setTimeout(() => {
    delete copyTimers[buttonId];
    btn.textContent = original;
    btn.classList.remove('ok');
    btn.classList.remove('copy-failed');
  }, COPY_RESET_MS);
}

// Selects the field and focuses it. Used both as the execCommand fallback's
// precondition and, on failure, as the way to leave the text ready to copy by
// hand. It never changes the value.
function selectField(el) {
  try {
    el.focus({ preventScroll: true });
  } catch (e) {
    try { el.focus(); } catch (e2) { /* not focusable, nothing to do */ }
  }
  try {
    if (typeof el.setSelectionRange === 'function') el.setSelectionRange(0, el.value.length);
    else if (typeof el.select === 'function') el.select();
  } catch (e) {
    try { el.select(); } catch (e2) { /* selection unavailable */ }
  }
}

// Returns true ONLY when the text is known to have reached the clipboard.
async function writeToClipboard(el, text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Permission denied, insecure context, or the document was not focused.
      // Fall through and try the legacy path rather than reporting success.
    }
  }
  if (typeof document.execCommand === 'function') {
    try {
      selectField(el);
      // Strict equality: execCommand can return undefined where it is stubbed or
      // partially removed, and undefined is not a successful copy.
      if (document.execCommand('copy') === true) return true;
    } catch (e) {
      // Blocked. Treated as a failure, which is what it is.
    }
  }
  return false;
}

async function copyFrom(textareaId, buttonId, restoreLabel) {
  const el = $(textareaId);
  const btn = $(buttonId);
  if (!el || !btn) return false;

  // The exact current value of the field, so Copy HTML copies precisely what is
  // shown in #html-code, including any edit made in the textarea.
  const text = typeof el.value === 'string' ? el.value : String(el.value || '');
  const original = restoreLabel || btn.getAttribute('data-idle-label') || btn.textContent;
  btn.setAttribute('data-idle-label', original);

  const copied = await writeToClipboard(el, text);

  if (copied) {
    if (window.getSelection) {
      try { window.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
    }
    btn.textContent = '✅ Copied!';
    btn.classList.remove('copy-failed');
    btn.classList.add('ok');
    announceCopy('Copied to clipboard.');
  } else {
    // Leave it selected and focused: the person can finish the copy themselves.
    selectField(el);
    btn.textContent = '⚠️ Copy failed';
    btn.classList.remove('ok');
    btn.classList.add('copy-failed');
    announceCopy('Copy failed. The text is selected, press Ctrl+C or Command+C to copy it.');
  }

  scheduleCopyReset(btn, buttonId, original);
  return copied;
}

function copyHTML() { return copyFrom('html-code', 'copyBtn', '📋 Copy HTML'); }
function copyExcerpt() { return copyFrom('excerpt-text', 'excerptCopyBtn', '📋 Copy Excerpt'); }
function copyMeta() { return copyFrom('meta-text', 'metaCopyBtn', '📋 Copy Meta Description'); }
function copyTitle() { return copyFrom('title-text', 'titleCopyBtn', '📋 Copy Title'); }

function switchTab(t) {
  ['html', 'preview'].forEach(n => {
    $('tab-' + n).classList.toggle('active', n === t);
    $(n + '-pane').classList.toggle('active', n === t);
  });
}

function updateMetaCounter() {
  const len = $('meta-text').value.length;
  const cnt = $('metaCounter');
  cnt.textContent = len + ' / 160 characters';
  cnt.classList.toggle('over', len > 160);
  $('metaWarning').style.display = len > 160 ? 'block' : 'none';
}

// ── Reference panels ─────────────────────────────────────────────
function buildProductCards(products) {
  if (!products || !products.length) return '<p class="muted">No products.</p>';
  return '<div class="rec-grid">' + products.map(p => {
    const url = p.url || ('https://succulentsbox.com/products/' + (p.handle || ''));
    return `<div class="rec-product">
      ${p.image ? `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(p.image)}" alt="${esc(p.title)}"></a>` : ''}
      <div class="rec-product-title"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.title)}</a></div>
      ${p.price ? `<div class="rec-product-price">${esc(p.price)}</div>` : ''}
      ${p.source === 'manual' ? '<div class="rec-product-tag">manual entry</div>' : ''}
    </div>`;
  }).join('') + '</div>';
}

function buildRelatedArticles(articles) {
  if (!articles || !articles.length) return '<p class="muted">No related articles matched closely enough.</p>';
  return '<div class="rec-articles">' + articles.map(a => {
    const title = a.t || a.title || '';
    const url = a.u || a.url || '';
    return `<div class="rec-article"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a></div>`;
  }).join('') + '</div>';
}

function showError(message, detail) {
  const box = $('errorBox');
  box.innerHTML = `<strong>${esc(message)}</strong>${detail ? `<div style="margin-top:6px;font-weight:400;">${esc(detail)}</div>` : ''}`;
  box.classList.add('visible');
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearError() { $('errorBox').classList.remove('visible'); }

function showWarnings(warnings) {
  const box = $('warningBox');
  if (!warnings || !warnings.length) { box.classList.remove('visible'); return; }
  box.innerHTML = '<strong>Heads up</strong><ul>' + warnings.map(w => `<li>${esc(w)}</li>`).join('') + '</ul>';
  box.classList.add('visible');
}
