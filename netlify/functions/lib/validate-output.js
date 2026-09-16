// Lightweight post-generation checks on the article HTML. Deliberately regex
// based: this is a handful of dependable structural checks, not an HTML parser.
// Findings become warnings shown to the content user. Nothing is ever rewritten
// or silently patched, and a failing check is never reported as a pass.

const LIST_FORMATS = ['general_gift_guide', 'occasion_gift_guide'];
const REQUIRED_HEADERS = ['gift', 'best for', 'light', 'care level'];

function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function findTables(html) {
  return String(html || '').match(/<table[\s\S]*?<\/table>/gi) || [];
}

function headerCells(tableHtml) {
  return (tableHtml.match(/<th[\s>][\s\S]*?<\/th>/gi) || []).map(c => stripTags(c).toLowerCase());
}

function bodyRowCount(tableHtml) {
  const rows = tableHtml.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  return rows.filter(r => !/<th[\s>]/i.test(r) && /<td[\s>]/i.test(r)).length;
}

function validateArticleOutput(articleType, fields, html) {
  const warnings = [];
  if (!LIST_FORMATS.includes(articleType)) return warnings;

  const products = (fields.selectedProducts || []).slice(0, fields.numberOfRecommendations || undefined);
  const expected = products.length;
  const text = stripTags(html);

  // ── Comparison table ──
  const tables = findTables(html);
  const comparison = tables.find(t => {
    const cells = headerCells(t);
    return cells.some(c => c.includes('best for')) || cells.some(c => c === 'gift');
  });

  if (!tables.length) {
    warnings.push('The comparison table is missing from the article. Add one before publishing.');
  } else if (!comparison) {
    warnings.push('No comparison table with the expected headers was found. Check the table before publishing.');
  } else {
    const cells = headerCells(comparison);
    if (cells.length < 2) {
      warnings.push('The comparison table headers are merged into one cell instead of separate <th> elements. Rebuild the header row before publishing.');
    } else {
      const missing = REQUIRED_HEADERS.filter(h => !cells.some(c => c.includes(h)));
      if (missing.length) {
        warnings.push(`The comparison table is missing these headers: ${missing.join(', ')}.`);
      }
    }
    const rows = bodyRowCount(comparison);
    if (expected && rows !== expected) {
      warnings.push(`The comparison table has ${rows} product row${rows === 1 ? '' : 's'} but ${expected} product${expected === 1 ? ' was' : 's were'} confirmed. Check the table before publishing.`);
    }
  }

  // ── Confirmed products present ──
  const missingTitles = products.filter(p => !text.toLowerCase().includes(String(p.title).toLowerCase())).map(p => p.title);
  if (missingTitles.length) {
    warnings.push(`These confirmed products are not mentioned in the article: ${missingTitles.join(', ')}.`);
  }
  const missingUrls = products.filter(p => !String(html).includes(p.url)).map(p => p.title);
  if (missingUrls.length) {
    warnings.push(`The product link is missing for: ${missingUrls.join(', ')}.`);
  }

  // ── No product URL that was never confirmed ──
  const confirmed = new Set(products.map(p => p.url.replace(/\/+$/, '').toLowerCase()));
  const found = String(html).match(/https?:\/\/(?:www\.)?succulentsbox\.com(?:\/[^\s"'<>)]*?)?\/products\/[^\s"'<>)]+/gi) || [];
  const unconfirmed = Array.from(new Set(
    found.map(u => u.replace(/\/+$/, '').toLowerCase()).filter(u => !confirmed.has(u))
  ));
  if (unconfirmed.length) {
    warnings.push(`The article links to ${unconfirmed.length} product URL${unconfirmed.length === 1 ? '' : 's'} that ${unconfirmed.length === 1 ? 'was' : 'were'} not confirmed: ${unconfirmed.slice(0, 3).join(', ')}. Remove ${unconfirmed.length === 1 ? 'it' : 'them'} before publishing.`);
  }

  return warnings;
}

module.exports = { validateArticleOutput, _internals: { headerCells, bodyRowCount, findTables, stripTags } };
