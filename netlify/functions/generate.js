const Anthropic = require('@anthropic-ai/sdk');
const { validateRequest, ValidationError } = require('./lib/validate');
const { buildCareGuidePrompt } = require('./lib/prompt-care-guide');
const { buildSinglePlantGiftPrompt } = require('./lib/prompt-single-plant-gift');
const { buildGeneralGiftGuidePrompt } = require('./lib/prompt-general-gift-guide');
const { buildOccasionGiftGuidePrompt } = require('./lib/prompt-occasion-gift-guide');
const { buildMetadataAndRelatedPrompt, CATALOG_FORMATS } = require('./lib/prompt-metadata-related');
const { resolveTitles } = require('./lib/title');
const { validateArticleOutput } = require('./lib/validate-output');
const { ARTICLES } = require('../../data/articles.js');
const { CATALOG } = require('../../data/catalog.js');

const MODEL = 'claude-haiku-4-5-20251001';

const BUILDERS = {
  care_guide: buildCareGuidePrompt,
  single_plant_gift: buildSinglePlantGiftPrompt,
  general_gift_guide: buildGeneralGiftGuidePrompt,
  occasion_gift_guide: buildOccasionGiftGuidePrompt
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

function stripFences(text) {
  return String(text || '')
    .replace(/^\s*```(?:html|json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

// Belt and braces: the prompts forbid em and en dashes, this guarantees it.
// Only text outside of tags is touched, so inline styles and URLs stay intact.
function stripDashes(html) {
  return String(html || '').replace(/<[^>]*>|[^<]+/g, chunk => {
    if (chunk.startsWith('<')) return chunk;
    return chunk
      .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2')
      .replace(/\s*[–—]\s*/g, ', ')
      .replace(/,\s*,/g, ',');
  });
}

function stripDashesPlain(text) {
  return String(text || '')
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/,\s*,/g, ',');
}

function parseMetadata(raw) {
  const text = stripFences(raw);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in the metadata response.');
  return JSON.parse(match[0]);
}

// Never trust the model with a URL. Every related article must exist in our index,
// every catalog product must exist in our catalog.
function reconcileArticles(picked) {
  if (!Array.isArray(picked)) return [];
  const byUrl = new Map(ARTICLES.map(a => [a.u, a]));
  const byTitle = new Map(ARTICLES.map(a => [a.t.toLowerCase(), a]));
  const out = [];
  for (const p of picked) {
    const hit = byUrl.get(String(p && p.u || '').trim()) || byTitle.get(String(p && p.t || '').trim().toLowerCase());
    if (hit && !out.some(o => o.u === hit.u)) out.push({ t: hit.t, u: hit.u });
  }
  return out.slice(0, 3);
}

function reconcileCatalogProducts(picked) {
  if (!Array.isArray(picked)) return [];
  const byHandle = new Map(CATALOG.map(p => [p.h, p]));
  const byTitle = new Map(CATALOG.map(p => [p.t.toLowerCase(), p]));
  const out = [];
  for (const p of picked) {
    const hit = byHandle.get(String(p && p.h || '').trim()) || byTitle.get(String(p && p.t || '').trim().toLowerCase());
    if (hit && !out.some(o => o.h === hit.h)) {
      out.push({
        title: hit.t,
        handle: hit.h,
        price: hit.p,
        image: hit.i,
        url: 'https://succulentsbox.com/products/' + hit.h,
        source: 'catalog'
      });
    }
  }
  return out.slice(0, 4);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid request body', code: 'bad_request' });
  }

  // Verify the session token before doing anything else.
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword || payload.token !== sitePassword) {
    return json(401, { error: 'Your session has expired. Please sign in again.', code: 'unauthorized' });
  }

  let articleType, fields;
  try {
    ({ articleType, fields } = validateRequest(payload.articleType, payload.fields));
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { error: err.message, code: err.code });
    }
    return json(400, { error: 'Invalid request fields.', code: 'invalid_input' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: 'ANTHROPIC_API_KEY environment variable is not configured on Netlify.',
      code: 'server_config'
    });
  }

  const client = new Anthropic({ apiKey });
  const articlePrompt = BUILDERS[articleType](fields);
  const metadataPrompt = buildMetadataAndRelatedPrompt(articleType, fields);

  // The article and the metadata call may run in parallel because both already
  // receive the same user-confirmed product data. Nothing is selected by the model.
  const articleCall = client.messages.create({
    model: MODEL,
    max_tokens: 5000,
    messages: [{ role: 'user', content: articlePrompt }]
  });
  const metadataCall = client.messages.create({
    model: MODEL,
    max_tokens: 900,
    messages: [{ role: 'user', content: metadataPrompt }]
  });

  const [articleRes, metadataRes] = await Promise.allSettled([articleCall, metadataCall]);

  if (articleRes.status === 'rejected') {
    const err = articleRes.reason || {};
    console.error('Anthropic article call failed:', err.message || err);
    const status = err.status === 401 || err.status === 403 ? 502 : 502;
    return json(status, {
      error: 'The AI service could not generate the article: ' + (err.message || 'unknown error'),
      code: 'ai_failure'
    });
  }

  const html = stripDashes(stripFences(articleRes.value.content?.[0]?.text));
  if (!html || html.length < 200) {
    return json(502, {
      error: 'The AI returned an incomplete article. Please try again.',
      code: 'incomplete_response'
    });
  }

  const warnings = [];
  let excerpt = '';
  let metaDescription = '';
  let relatedArticles = [];
  let catalogPicks = [];
  let meta = null;

  if (metadataRes.status === 'rejected') {
    console.error('Anthropic metadata call failed:', metadataRes.reason?.message || metadataRes.reason);
    warnings.push('The excerpt, meta description and related recommendations could not be generated. The article itself is fine.');
  } else {
    try {
      meta = parseMetadata(metadataRes.value.content?.[0]?.text);
      excerpt = stripDashesPlain(String(meta.excerpt || '').trim());
      metaDescription = stripDashesPlain(String(meta.meta_description || '').trim());
      relatedArticles = reconcileArticles(meta.articles);
      if (CATALOG_FORMATS.includes(articleType)) catalogPicks = reconcileCatalogProducts(meta.products);
      if (!excerpt || !metaDescription) {
        warnings.push('The AI returned incomplete metadata. Check the excerpt and meta description before publishing.');
      }
      if (!relatedArticles.length) {
        warnings.push('No related articles matched this topic closely enough to recommend.');
      }
    } catch (err) {
      console.error('Metadata parse error:', err.message);
      warnings.push('The excerpt and meta description could not be read from the AI response. The article itself is fine.');
    }
  }

  const { title, alternatives, usedFallback } = resolveTitles(articleType, fields, meta);
  if (usedFallback) {
    warnings.push('The title was built from your brief because the AI title could not be read. Edit it before publishing.');
  }

  // Structural checks on the finished HTML. These only add warnings, they never
  // rewrite the article or insert facts of their own.
  warnings.push(...validateArticleOutput(articleType, fields, html));

  const products = CATALOG_FORMATS.includes(articleType)
    ? catalogPicks
    : fields.selectedProducts.slice(0, fields.numberOfRecommendations);

  return json(200, {
    title,
    alternative_titles: alternatives,
    html,
    excerpt,
    meta_description: metaDescription,
    products,
    related_articles: relatedArticles,
    warnings,
    articleType
  });
};
