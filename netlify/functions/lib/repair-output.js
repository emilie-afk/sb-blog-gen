// Deterministic repair of one specific, recurring structural fault: the model
// occasionally emits the comparison table's header row as a SINGLE <th> holding
// every header label run together, instead of one <th> per column. Browsers, the
// preview pane and Shopify all render that as one wide merged cell, so it reaches
// the content user looking broken and gets pasted into a post that way.
//
// This is a repair, not a rewrite. It is deliberately narrow:
//   - only the header row of a table is ever touched
//   - it fires only when there is exactly one <th> in that table
//   - its text must split cleanly into known header labels, in order, with
//     nothing left over
//   - the number of labels must equal the number of <td> cells in the body rows
// If any of those fail, nothing is changed and the caller warns instead. Silent
// guessing about a table's meaning would be worse than a visible warning.
//
// Nothing here invents a cell value: the labels already exist in the model's own
// output, they are simply separated back out into the cells they belong in.

// The labels the comparison-table skeleton asks for, plus the optional columns it
// permits. Longest first, so "Care level" is matched before "Care" could be.
const KNOWN_HEADERS = [
  'A good choice for',
  'Best suited for',
  'Style or format',
  'Care level',
  'Light level',
  'Best for',
  'Gift',
  'Price',
  'Size',
  'Light',
  'Care'
];

const TH_STYLE = 'style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;text-align:left;"';

function decode(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Splits a run-together header string into the labels it is made of. Returns null
// unless the WHOLE string is consumed by known labels: a leftover fragment means
// this is not the fault we recognise, and guessing is not allowed.
function splitHeaderLabels(text) {
  let rest = decode(text);
  if (!rest) return null;
  const labels = [];
  const separator = /^[\s|,/·•–—-]+/;

  while (rest.length) {
    rest = rest.replace(separator, '');
    if (!rest) break;
    const match = KNOWN_HEADERS.find(h => rest.toLowerCase().startsWith(h.toLowerCase()));
    if (!match) return null;
    labels.push(match);
    rest = rest.slice(match.length);
    if (labels.length > 8) return null;
  }
  return labels.length >= 2 ? labels : null;
}

function headerCellCount(tableHtml) {
  return (tableHtml.match(/<th[\s>]/gi) || []).length;
}

// Widest body row, so a stray short row cannot decide the column count.
function bodyCellCount(tableHtml) {
  const rows = tableHtml.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  let widest = 0;
  for (const row of rows) {
    if (/<th[\s>]/i.test(row)) continue;
    const cells = (row.match(/<td[\s>]/gi) || []).length;
    if (cells > widest) widest = cells;
  }
  return widest;
}

// Repairs one table. Returns { html, repaired }.
function repairTable(tableHtml) {
  if (headerCellCount(tableHtml) !== 1) return { html: tableHtml, repaired: false };

  // The whitespace group matters: /<th([^>]*)>/ also matches the opening <thead>,
  // which would capture "ead" as the cell's attributes and rewrite the wrong tag.
  const thMatch = /<th(\s[^>]*)?>([\s\S]*?)<\/th>/i.exec(tableHtml);
  if (!thMatch) return { html: tableHtml, repaired: false };

  const labels = splitHeaderLabels(thMatch[2]);
  if (!labels) return { html: tableHtml, repaired: false };

  const columns = bodyCellCount(tableHtml);
  if (!columns || columns !== labels.length) return { html: tableHtml, repaired: false };

  // Reuse the attributes the model already wrote on its single <th> when it has
  // any, so the repaired header keeps the same styling as the rest of the table.
  const attrs = thMatch[1] && thMatch[1].trim() ? thMatch[1].trim() : TH_STYLE;
  const rebuilt = labels.map(l => `<th ${attrs}>${l}</th>`).join('\n');

  return { html: tableHtml.replace(thMatch[0], rebuilt), repaired: true };
}

// Repairs every table in the article body. Returns the possibly-updated HTML and
// how many tables were repaired, so the caller can report it honestly rather than
// claiming a repair that did not happen.
function repairArticleHtml(html) {
  const source = String(html || '');
  if (!source) return { html: source, repaired: 0 };

  let repaired = 0;
  const out = source.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const result = repairTable(table);
    if (result.repaired) repaired += 1;
    return result.html;
  });

  return { html: out, repaired };
}

module.exports = {
  repairArticleHtml,
  KNOWN_HEADERS,
  _internals: { splitHeaderLabels, repairTable, headerCellCount, bodyCellCount, decode }
};
