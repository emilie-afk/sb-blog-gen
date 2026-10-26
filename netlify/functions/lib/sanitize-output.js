// Server-side allowlist for the article HTML, applied before anything is
// returned or stored.
//
// WHY THE SERVER DOES THIS TOO. The browser already sanitises the preview, but
// the Copy HTML value, which is what gets pasted into Shopify, used to be the
// model's raw output. The model's input includes storefront descriptions, which
// are untrusted copy, and a description written to steer the model could get a
// script tag or an event handler into the article. This makes the copied HTML
// safe regardless of what the model returned.
//
// IT DOES NOT CHANGE A NORMAL ARTICLE. If every tag and attribute is on the
// allowlist and every URL is safe, the input is returned byte for byte. Only an
// article that actually contains something disallowed is rebuilt, and the caller
// adds a warning saying so, so the content team knows to look.
//
// The allowlist matches the one the browser preview uses (app/ui.js), which
// already covers every element the article templates ask for.

const ALLOWED_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'a', 'strong', 'em', 'b', 'i', 'br', 'hr', 'div', 'span', 'img', 'blockquote', 'small']);
const ALLOWED_ATTRS = new Set(['style', 'href', 'src', 'alt', 'id', 'title', 'colspan', 'rowspan',
  'width', 'height', 'target', 'rel']);
const VOID_TAGS = new Set(['br', 'hr', 'img']);
// Removed together with everything inside them, because their content is code
// or markup rather than article text.
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template',
  'noscript', 'textarea', 'select', 'svg', 'math', 'title', 'head', 'frameset', 'frame', 'applet']);
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?\s*>|<[!?][^>]*>/g;
const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);?/gi, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n')
    .replace(/&amp;/gi, '&');
}

// A URL is safe when it is relative, or when its scheme is on the list. The
// value is decoded and stripped of whitespace and control characters first,
// because "java&#115;cript:" and "jav\tascript:" both execute in a browser.
function safeUrl(value) {
  const plain = decodeEntities(value).replace(/[\u0000- \u007f-\u009f]+/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(plain);
  if (!scheme) return true;
  return SAFE_SCHEMES.has(scheme[1].toLowerCase());
}

function safeStyle(value) {
  const plain = decodeEntities(value).toLowerCase().replace(/[\s\\]+/g, '');
  return !/expression\(|javascript:|vbscript:|url\(|behavior:|-moz-binding|@import/.test(plain);
}

function escapeAttr(value) {
  return String(value).replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Returns { attrs, changed }: the attributes that survive, and whether any did
// not.
function filterAttributes(raw) {
  const kept = [];
  let changed = false;
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(raw || ''))) {
    const name = m[1].toLowerCase();
    const value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    if (!ALLOWED_ATTRS.has(name) || name.startsWith('on')) { changed = true; continue; }
    if ((name === 'href' || name === 'src') && !safeUrl(value)) { changed = true; continue; }
    if (name === 'style' && !safeStyle(value)) { changed = true; continue; }
    kept.push([name, value]);
  }
  return { attrs: kept, changed };
}

function sanitizeArticleHtml(html) {
  const input = String(html || '');
  let out = '';
  let last = 0;
  let changed = false;
  let removed = 0;
  let dropping = null;   // the tag whose content is being skipped

  const text = segment => {
    // A "<" that did not form a recognisable tag is escaped, so a malformed
    // fragment cannot become a tag once it reaches a browser.
    if (/<[a-zA-Z\/!?]/.test(segment)) {
      changed = true;
      removed += 1;
      return segment.replace(/<(?=[a-zA-Z\/!?])/g, '&lt;');
    }
    return segment;
  };

  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(input))) {
    const before = input.slice(last, m.index);
    last = TOKEN.lastIndex;
    const token = m[0];
    const name = m[1] ? m[1].toLowerCase() : '';
    const closing = token.startsWith('</');

    if (dropping) {
      if (closing && name === dropping) dropping = null;
      continue;
    }
    out += text(before);

    if (!name) {
      // A comment, a doctype or a processing instruction: never article text.
      changed = true;
      removed += 1;
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) {
      changed = true;
      removed += 1;
      if (!closing && !/\/\s*>$/.test(token)) dropping = name;
      continue;
    }
    if (!ALLOWED_TAGS.has(name)) {
      // An unknown tag is removed, but its text content is kept: losing a
      // sentence is worse than losing a wrapper.
      changed = true;
      removed += 1;
      continue;
    }
    if (closing) {
      out += token;
      continue;
    }
    const { attrs, changed: attrsChanged } = filterAttributes(m[2]);
    if (!attrsChanged) {
      out += token;
      continue;
    }
    changed = true;
    removed += 1;
    const rebuilt = attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
    out += `<${name}${rebuilt}${VOID_TAGS.has(name) && /\/\s*>$/.test(token) ? ' /' : ''}>`;
  }
  if (!dropping) out += text(input.slice(last));
  else changed = true;

  if (!changed) return { html: input, changed: false, removed: 0 };
  return { html: out, changed: true, removed };
}

module.exports = { sanitizeArticleHtml, ALLOWED_TAGS, ALLOWED_ATTRS, _internals: { safeUrl, safeStyle, decodeEntities } };
