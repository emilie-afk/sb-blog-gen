// Metadata + related recommendations prompt. One JSON response per generation:
// excerpt, meta description, related articles, and (care / single-plant formats only)
// catalog product suggestions for the reference panel.
const { CATALOG } = require('../../../data/catalog.js');
const { rankArticles } = require('./rank-articles');

const CATALOG_FORMATS = ['care_guide', 'single_plant_gift'];

function subjectLine(articleType, fields) {
  switch (articleType) {
    case 'care_guide':
      return `Plant care guide about "${fields.plantName}"${fields.sciName ? ` (${fields.sciName})` : ''}.`;
    case 'single_plant_gift':
      return `Gift guide about giving "${fields.plantName}" as a gift. Gift angle: ${fields.giftAngle === 'Custom angle' ? fields.customGiftAngle : fields.giftAngle}.${fields.recipient ? ` Recipient: ${fields.recipient}.` : ''}${fields.occasion ? ` Occasion: ${fields.occasion}.` : ''}`;
    case 'general_gift_guide':
      return `Plant gift guide titled "${fields.title}".${fields.recipient ? ` Recipient: ${fields.recipient}.` : ''}${(fields.giftCharacteristics || []).length ? ` Characteristics: ${fields.giftCharacteristics.join(', ')}.` : ''}`;
    case 'occasion_gift_guide':
      return `Occasion plant gift guide titled "${fields.title}". Occasion: ${fields.occasion}. Tone: ${fields.tone}.${fields.recipient ? ` Recipient: ${fields.recipient}.` : ''}${fields.sensitiveOccasion ? ' This is an emotionally sensitive occasion.' : ''}`;
    default:
      return `Blog post titled "${fields.title}".`;
  }
}

function buildMetadataAndRelatedPrompt(articleType, fields) {
  const wantsCatalog = CATALOG_FORMATS.includes(articleType);
  const articles = rankArticles(articleType, fields, 80);
  const articlesStr = articles.map(a => `${a.t}|${a.u}`).join('\n');
  const catalogStr = wantsCatalog
    ? CATALOG.map(p => `${p.t}|${p.h}|${p.p}|${p.i}|${p.cat}`).join('\n')
    : '';

  const sensitive = articleType === 'occasion_gift_guide' && fields.sensitiveOccasion;
  const shape = wantsCatalog
    ? `{"excerpt":"...","meta_description":"...","products":[{"t":"title","h":"handle","p":"price","i":"image_url"}],"articles":[{"t":"title","u":"url"}]}`
    : `{"excerpt":"...","meta_description":"...","articles":[{"t":"title","u":"url"}]}`;

  const productRule = wantsCatalog
    ? `- products: exactly 4 items. ${articleType === 'care_guide'
        ? `Plants a ${fields.plantName} owner would also enjoy. Same genus first, then similar care or looks. Do NOT include ${fields.plantName} itself.`
        : `Plants or items that pair well with ${fields.plantName} as a gift. Do NOT include ${fields.plantName} itself.`}
- Copy every product value EXACTLY from the PRODUCTS list. Never invent a product, handle, price or image.
`
    : '';

  const relatedRule = articleType === 'care_guide'
    ? `- articles: exactly 3, the most closely related to "${fields.plantName}" care. Prefer the same plant or genus, then care problems, propagation or issues specific to this plant type.`
    : `- articles: exactly 3, ranked by relevance in this order: same occasion, same recipient, same gift constraint, same plant or product type, then complementary care content. Do not pick a generic propagation article unless it is genuinely relevant. If fewer than 3 are genuinely relevant, return only the relevant ones.`;

  return `Subject of the blog post: ${subjectLine(articleType, fields)}
Article title: "${fields.title || ''}"

Return ONLY a valid JSON object. No explanation, no markdown, no code fences:
${shape}

Rules:
- excerpt: 2 to 3 plain text sentences summarising the post. No HTML, no quotes around the value.
- meta_description: 160 characters maximum, one sentence written for Google search. No HTML.
- Never use em dashes or en dashes in either field.${sensitive ? '\n- This is a sensitive occasion. Keep the excerpt and meta description quiet and supportive. No urgency, no celebration, no promotional language.' : ''}
${productRule}${relatedRule}
- Copy every article title and URL EXACTLY from the ARTICLES list. Never invent a URL.
${catalogStr ? `\nPRODUCTS (title|handle|price|image|category):\n${catalogStr}\n` : ''}
ARTICLES (title|url):
${articlesStr}`;
}

module.exports = { buildMetadataAndRelatedPrompt, CATALOG_FORMATS };
