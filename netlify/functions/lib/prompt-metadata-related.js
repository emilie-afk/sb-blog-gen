// Metadata + related recommendations prompt. One JSON response per generation:
// title and two alternatives, excerpt, meta description, related articles, and
// (care / single-plant formats only) catalog product suggestions for the panel.
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
      return `Plant gift guide with ${fields.numberOfRecommendations} recommendations.${fields.recipient ? ` Recipient: ${fields.recipient}.` : ' No recipient specified.'}${(fields.giftCharacteristics || []).length ? ` Characteristics the guide is built around: ${fields.giftCharacteristics.join(', ')}.` : ''}${fields.budgetRange ? ` Budget: ${fields.budgetRange}.` : ''}`;
    case 'occasion_gift_guide':
      return `Occasion plant gift guide with ${fields.numberOfRecommendations} recommendations. Occasion: ${fields.occasion}.${fields.recipient ? ` Recipient: ${fields.recipient}.` : ''}${fields.relationship ? ` Relationship: ${fields.relationship}.` : ''}${fields.sensitiveOccasion ? ' This is a sensitive or remembrance occasion.' : ''}`;
    default:
      return 'Blog post for Succulents Box.';
  }
}

function productLines(fields) {
  const products = (fields.selectedProducts || []).slice(0, fields.numberOfRecommendations || undefined);
  if (!products.length) return '';
  return `\nThe article recommends exactly these ${products.length} products, in this order:\n${products.map((p, i) => `${i + 1}. ${p.title}`).join('\n')}\n`;
}

function titleRules(articleType, fields) {
  const isList = articleType === 'general_gift_guide' || articleType === 'occasion_gift_guide';
  const yearRule = articleType === 'occasion_gift_guide' && fields.includeYearInTitle && fields.occasionYear
    ? `- Include the year ${fields.occasionYear} in the title.`
    : `- Do not put any year in the title.`;

  return `TITLE RULES:
- The title must match the article that was actually written and the confirmed products it covers.
${isList ? `- If the title states a number, it must be exactly ${fields.numberOfRecommendations}.` : '- Do not put a count in the title.'}
${yearRule}
${fields.primaryKeyword ? `- Work the primary keyword "${fields.primaryKeyword}" in naturally.` : ''}
${fields.titleDirection ? `- Title direction from the content team: ${fields.titleDirection}. Follow the intent of this direction. Do not copy the phrasing literally if that would read awkwardly.` : ''}
- No clickbait. No "ultimate guide". No "you won't believe".
- Do not reach for "best" by default. Use it only when the article really is a ranked pick list.
- Do not assume the recipient is family unless the brief says so.

GUIDE CHARACTERISTICS ARE A REQUESTED ANGLE, NEVER A VERIFIED FACT. This applies to the title, the alternative titles, the excerpt and the meta description, and it overrides every other rule here.
- Any characteristic named in the brief (low maintenance, beginner friendly, pet friendly, low light, desk friendly, small space friendly, easy to ship, eco conscious, or a custom requirement) describes what the content team asked for. It is not a confirmed property of the items in the article.
- Never write a title, excerpt or meta description that states or implies every item shares a characteristic. Do not claim they are all plants, all low light, all desk friendly, all pet safe, all low maintenance, all beginner friendly, all small, all easy to ship or all eco friendly.
- Never include unsupported claims such as pet safe, non toxic, eco friendly, low light, office friendly or easy to ship.
- Do not promise that every item is a plant. The article may feature gift boxes, arrangements or sets.
- A characteristic may appear as the reader's need ("gifts for a first plant") but never as a guarantee about the items.
- Keep the recommended title concise, roughly 40 to 70 characters.
- alternative_titles must be two meaningfully different angles, not punctuation or word order variations of the recommended title.
- Never use em dashes or en dashes in any title.`;
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
    ? `{"title":"...","alternative_titles":["...","..."],"excerpt":"...","meta_description":"...","products":[{"t":"title","h":"handle","p":"price","i":"image_url"}],"articles":[{"t":"title","u":"url"}]}`
    : `{"title":"...","alternative_titles":["...","..."],"excerpt":"...","meta_description":"...","articles":[{"t":"title","u":"url"}]}`;

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
${productLines(fields)}
Return ONLY a valid JSON object. No explanation, no markdown, no code fences:
${shape}

${titleRules(articleType, fields)}

Rules:
- excerpt: 2 to 3 plain text sentences summarising the post. No HTML, no quotes around the value.
- meta_description: 160 characters maximum, one sentence written for Google search. No HTML.
- Never use em dashes or en dashes anywhere in this response.${sensitive ? '\n- This is a sensitive occasion. Keep the title, excerpt and meta description quiet and supportive. No urgency, no celebration, no promotional language, no superlatives.' : ''}
${productRule}${relatedRule}
- Copy every article title and URL EXACTLY from the ARTICLES list. Never invent a URL.
${catalogStr ? `\nPRODUCTS (title|handle|price|image|category):\n${catalogStr}\n` : ''}
ARTICLES (title|url):
${articlesStr}`;
}

module.exports = { buildMetadataAndRelatedPrompt, CATALOG_FORMATS };
