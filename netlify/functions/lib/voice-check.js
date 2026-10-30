// House-style check on a finished article. It only adds a warning, it never
// rewrites anything: an editor decides what to change.
//
// The model (a small, fast one, chosen to keep cost down) does not reliably
// follow every "never write" rule in a long prompt. This check catches the
// phrases and headings the team has said to avoid, so they are fixed before
// publishing instead of slipping through.
//
// The lists live in the private prompt pack, not here, because they are part of
// the editorial instructions. A pack without them simply skips the check:
//   voiceCheck.articleTypes   comma-separated article types the check applies to
//   voiceCheck.phrases        one phrase per line, matched in the article text,
//                             excerpt and meta description (case-insensitive)
//   voiceCheck.headingWords   one word or phrase per line, matched in headings only

const MAX_LISTED = 6;

function lines(value) {
  return String(value || '').split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function plainOf(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ');
}

function textOf(html) { return plainOf(html).toLowerCase(); }

function headingsOf(html) {
  const out = [];
  const re = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) out.push(plainOf(m[1]).trim());
  return out;
}

function settings(pack) {
  const vc = pack && pack.raw && pack.raw.voiceCheck;
  if (!vc || typeof vc !== 'object') return null;
  return {
    types: String(vc.articleTypes || '').split(',').map(s => s.trim()).filter(Boolean),
    phrases: lines(vc.phrases),
    headingWords: lines(vc.headingWords)
  };
}

// Returns { warnings, found } where found lists what matched (for tests and
// logs; the log records counts only).
function checkVoice(articleType, pack, { html, excerpt, metaDescription }) {
  const s = settings(pack);
  if (!s || !s.types.includes(articleType)) return { warnings: [], found: [] };

  const body = [textOf(html), textOf(excerpt), textOf(metaDescription)].join(' \u0000 ');
  const phrases = s.phrases.filter(p => body.includes(p));
  const heads = headingsOf(html).filter(h => s.headingWords.some(w => h.toLowerCase().includes(w)));

  const warnings = [];
  if (phrases.length) {
    const listed = phrases.slice(0, MAX_LISTED).map(p => `"${p}"`).join(', ');
    const more = phrases.length > MAX_LISTED ? ` and ${phrases.length - MAX_LISTED} more` : '';
    warnings.push(`Phrases our house style avoids appear in the article, excerpt or meta description: ${listed}${more}. Rewrite them before publishing.`);
  }
  if (heads.length) {
    const listed = heads.slice(0, MAX_LISTED).map(h => `"${h}"`).join(', ');
    warnings.push(`These headings read like outline labels rather than real headings: ${listed}. Rename them before publishing.`);
  }
  return { warnings, found: phrases.concat(heads) };
}

module.exports = { checkVoice, _internals: { textOf, headingsOf, settings } };
