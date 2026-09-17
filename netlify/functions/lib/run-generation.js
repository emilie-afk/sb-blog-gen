// The generation core, shared by the synchronous function and the background job.
// It takes already-validated fields and returns either a finished payload or a
// structured failure. It never touches HTTP, auth or storage.

const Anthropic = require('@anthropic-ai/sdk');
const { buildCareGuidePrompt } = require('./prompt-care-guide');
const { buildSinglePlantGiftPrompt } = require('./prompt-single-plant-gift');
const { buildGeneralGiftGuidePrompt } = require('./prompt-general-gift-guide');
const { buildOccasionGiftGuidePrompt } = require('./prompt-occasion-gift-guide');
const { buildMetadataAndRelatedPrompt, CATALOG_FORMATS } = require('./prompt-metadata-related');
const { resolveTitles } = require('./title');
const { validateArticleOutput } = require('./validate-output');
const { ARTICLES } = require('../../../data/articles.js');
const { CATALOG } = require('../../../data/catalog.js');

const MODEL = 'claude-haiku-4-5-20251001';

// Output budget, per format.
//
// A gift guide writes one section per confirmed product on top of the intro,
// comparison table, selection guidance, presentation ideas, care primer, five
// Q&As and the closing section. At 3500 tokens a normal five product guide ran
// out of budget mid-article, so the gift formats get 6000. The fix is the
// allowance, not a shorter article: no section, product detail or guardrail is
// removed to make one fit.
//
// The model is claude-haiku-4-5, whose documented maximum output is 64K tokens,
// so 6000 is well inside what it will serve. A run that still hits the cap is
// reported as truncated, never returned as if complete.
//
// The care guide keeps 3500: its structure is fixed and it has never truncated.
// Raising a limit that is not under pressure only buys worst-case latency.
const ARTICLE_MAX_TOKENS = 3500;              // care guide, and the default
const GIFT_ARTICLE_MAX_TOKENS = 6000;         // every gift-oriented format
const METADATA_MAX_TOKENS = 600;

const GIFT_FORMATS = ['single_plant_gift', 'general_gift_guide', 'occasion_gift_guide'];

// The single truncation message. The browser matches on it to avoid showing the
// same problem twice, so the wording is shared rather than duplicated.
const TRUNCATION_WARNING = 'The article reached the output limit and is incomplete. Please generate it again. If this continues, the article generator needs a higher output allowance.';

function articleMaxTokens(articleType) {
  return GIFT_FORMATS.includes(articleType) ? GIFT_ARTICLE_MAX_TOKENS : ARTICLE_MAX_TOKENS;
}

const BUILDERS = {
  care_guide: buildCareGuidePrompt,
  single_plant_gift: buildSinglePlantGiftPrompt,
  general_gift_guide: buildGeneralGiftGuidePrompt,
  occasion_gift_guide: buildOccasionGiftGuidePrompt
};

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

function firstText(message) {
  if (!message || !Array.isArray(message.content) || !message.content[0]) return '';
  return message.content[0].text || '';
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
    const hit = byUrl.get(String((p && p.u) || '').trim()) || byTitle.get(String((p && p.t) || '').trim().toLowerCase());
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
    const hit = byHandle.get(String((p && p.h) || '').trim()) || byTitle.get(String((p && p.t) || '').trim().toLowerCase());
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

// Returns { ok: true, payload } or { ok: false, status, error, code }.
async function runGeneration({ articleType, fields, apiKey, timer, client }) {
  const anthropic = client || new Anthropic({ apiKey });

  const promptStart = timer ? timer.start() : 0;
  const articlePrompt = BUILDERS[articleType](fields);
  const metadataPrompt = buildMetadataAndRelatedPrompt(articleType, fields);
  if (timer) timer.record('prompt_build', timer.since(promptStart));

  // The article and the metadata call run in parallel: both already receive the
  // same user-confirmed product data, so neither depends on the other.
  const callsStart = timer ? timer.start() : 0;
  const articleStart = timer ? timer.start() : 0;
  const articleCall = anthropic.messages.create({
    model: MODEL,
    max_tokens: articleMaxTokens(articleType),
    messages: [{ role: 'user', content: articlePrompt }]
  }).then(r => { if (timer) timer.record('article_call', timer.since(articleStart)); return r; },
          e => { if (timer) timer.record('article_call', timer.since(articleStart)); throw e; });

  const metadataStart = timer ? timer.start() : 0;
  const metadataCall = anthropic.messages.create({
    model: MODEL,
    max_tokens: METADATA_MAX_TOKENS,
    messages: [{ role: 'user', content: metadataPrompt }]
  }).then(r => { if (timer) timer.record('metadata_call', timer.since(metadataStart)); return r; },
          e => { if (timer) timer.record('metadata_call', timer.since(metadataStart)); throw e; });

  const [articleRes, metadataRes] = await Promise.allSettled([articleCall, metadataCall]);
  if (timer) timer.record('ai_calls', timer.since(callsStart));

  if (articleRes.status === 'rejected') {
    const err = articleRes.reason || {};
    console.error('Anthropic article call failed:', err.message || err);
    return {
      ok: false,
      status: 502,
      error: 'The AI service could not generate the article: ' + (err.message || 'unknown error'),
      code: 'ai_failure'
    };
  }

  const processingStart = timer ? timer.start() : 0;
  const html = stripDashes(stripFences(firstText(articleRes.value)));
  if (!html || html.length < 200) {
    if (timer) timer.record('response_processing', timer.since(processingStart));
    return {
      ok: false,
      status: 502,
      error: 'The AI returned an incomplete article. Please try again.',
      code: 'incomplete_response'
    };
  }

  const warnings = [];

  // The model stopped because it ran out of output budget, so the article is cut
  // off. This is surfaced loudly rather than returned as a finished article.
  const truncated = articleRes.value && articleRes.value.stop_reason === 'max_tokens';
  if (truncated) {
    // One message, and it never blames the number of products: five is a normal
    // guide. The browser shows this once, as its own banner, and keeps it out of
    // the general warning list so the same problem is not reported twice.
    warnings.push(TRUNCATION_WARNING);
  }

  let excerpt = '';
  let metaDescription = '';
  let relatedArticles = [];
  let catalogPicks = [];
  let meta = null;

  if (metadataRes.status === 'rejected') {
    console.error('Anthropic metadata call failed:', (metadataRes.reason && metadataRes.reason.message) || metadataRes.reason);
    warnings.push('The excerpt, meta description and related recommendations could not be generated. The article itself is fine.');
  } else {
    try {
      meta = parseMetadata(firstText(metadataRes.value));
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

  if (timer) timer.record('response_processing', timer.since(processingStart));

  return {
    ok: true,
    payload: {
      title,
      alternative_titles: alternatives,
      html,
      excerpt,
      meta_description: metaDescription,
      products,
      related_articles: relatedArticles,
      warnings,
      truncated: !!truncated,
      articleType
    }
  };
}

module.exports = {
  runGeneration,
  articleMaxTokens,
  ARTICLE_MAX_TOKENS,
  GIFT_ARTICLE_MAX_TOKENS,
  GIFT_FORMATS,
  TRUNCATION_WARNING,
  METADATA_MAX_TOKENS,
  MODEL,
  _internals: { stripFences, stripDashes, stripDashesPlain, firstText, parseMetadata, reconcileArticles, reconcileCatalogProducts }
};
