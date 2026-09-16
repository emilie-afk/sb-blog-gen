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
function copyFrom(textareaId, buttonId, restoreLabel) {
  const ta = $(textareaId);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* clipboard blocked */ }
  if (window.getSelection) window.getSelection().removeAllRanges();
  const btn = $(buttonId);
  const original = restoreLabel || btn.textContent;
  btn.textContent = '✅ Copied!';
  btn.classList.add('ok');
  setTimeout(() => { btn.textContent = original; btn.classList.remove('ok'); }, 2500);
}

function copyHTML() { copyFrom('html-code', 'copyBtn', '📋 Copy HTML'); }
function copyExcerpt() { copyFrom('excerpt-text', 'excerptCopyBtn', '📋 Copy Excerpt'); }
function copyMeta() { copyFrom('meta-text', 'metaCopyBtn', '📋 Copy Meta Description'); }
function copyTitle() { copyFrom('title-text', 'titleCopyBtn', '📋 Copy Title'); }

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
