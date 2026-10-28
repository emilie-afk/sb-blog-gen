// The generation core, shared by the synchronous function and the background job.
// It takes already-validated fields and returns either a finished payload or a
// structured failure. It never touches HTTP, auth or storage.
//
// The prompt pack is passed in, never loaded here. The caller loads it once, at
// the start of the request, and that same handle is used for every prompt this
// run builds. That is what pins a job to one prompt version: activating a new
// pack while a background job is running cannot reach the handle it holds.

const Anthropic = require('@anthropic-ai/sdk');
const { buildCareGuidePrompt } = require('./prompt-care-guide');
const { buildSinglePlantGiftPrompt } = require('./prompt-single-plant-gift');
const { buildGeneralGiftGuidePrompt } = require('./prompt-general-gift-guide');
const { buildOccasionGiftGuidePrompt } = require('./prompt-occasion-gift-guide');
const { buildMetadataAndRelatedPrompt, CATALOG_FORMATS } = require('./prompt-metadata-related');
const { checkVoice } = require('./voice-check');
const { resolveTitles } = require('./title');
const { validateArticleOutput } = require('./validate-output');
const { repairArticleHtml } = require('./repair-output');
const { sanitizeArticleHtml } = require('./sanitize-output');
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

// The metadata reply is a small JSON object, but it can arrive cut off: the
// call has a fixed token budget, and a reply that lists catalog products and
// related articles can run past it. A cut-off reply is not valid JSON, so the
// whole object used to be thrown away and the title, excerpt and meta
// description were lost with it. Now a reply that does not parse is salvaged:
// every COMPLETE string the reply did finish (title, alternative titles,
// excerpt, meta description, product handles, article URLs) is kept, and
// anything cut off mid-value is dropped. Products and articles are matched
// against our own catalog and index afterwards either way, so a salvaged value
// can never introduce a product or URL we do not have.
const JSON_STRING = '"((?:[^"\\\\]|\\\\.)*)"';

function readJsonString(body) {
  try { return JSON.parse('"' + body + '"'); } catch { return null; }
}

function salvageMetadata(text) {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('No JSON object found in the metadata response.');
  const body = text.slice(start);
  const field = name => {
    const m = body.match(new RegExp('"' + name + '"\\s*:\\s*' + JSON_STRING));
    return m ? readJsonString(m[1]) : null;
  };
  // The complete strings inside one array, stopping where the array ends or
  // where the reply was cut off.
  const section = (name, next) => {
    const at = body.search(new RegExp('"' + name + '"\\s*:\\s*\\['));
    if (at < 0) return '';
    const rest = body.slice(at);
    const end = next.map(n => rest.search(new RegExp('"' + n + '"\\s*:'))).filter(i => i > 0);
    return end.length ? rest.slice(0, Math.min(...end)) : rest;
  };
  const strings = (chunk, key) => {
    const re = key ? new RegExp('"' + key + '"\\s*:\\s*' + JSON_STRING, 'g') : new RegExp(JSON_STRING, 'g');
    const out = [];
    let m;
    while ((m = re.exec(chunk))) { const v = readJsonString(m[1]); if (v !== null) out.push(v); }
    return out;
  };
  const keys = ['title', 'alternative_titles', 'excerpt', 'meta_description', 'products', 'articles'];
  const altChunk = section('alternative_titles', keys.filter(k => k !== 'alternative_titles'));
  const meta = {
    title: field('title'),
    alternative_titles: altChunk ? strings(altChunk.slice(altChunk.indexOf('[') + 1)).filter(s => s !== 'alternative_titles') : [],
    excerpt: field('excerpt'),
    meta_description: field('meta_description'),
    products: strings(section('products', keys.filter(k => k !== 'products')), 'h').map(h => ({ h })),
    articles: strings(section('articles', keys.filter(k => k !== 'articles')), 'u').map(u => ({ u }))
  };
  if (!meta.title && !meta.excerpt && !meta.meta_description) {
    throw new Error('The metadata response could not be read, even in part.');
  }
  Object.defineProperty(meta, 'partial', { value: true });
  return meta;
}

function parseMetadata(raw) {
  const text = stripFences(raw);
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* fall through to salvage */ }
  }
  return salvageMetadata(text);
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

// Bounded retries. The SDK retries connection errors, 408, 409, 429 and 5xx
// with exponential backoff; this states the bound explicitly rather than leaning
// on a default that could change with an upgrade. Each retry is a full model
// call, so the number stays small, and a job that still fails is reported as
// failed. Nothing retries a whole generation automatically.
const MODEL_MAX_RETRIES = 2;

// instanceof against an SDK error class, tolerating a build of the SDK (or a
// test double) that does not export it.
function isSdkError(err, className) {
  const Ctor = Anthropic && Anthropic[className];
  return typeof Ctor === 'function' && err instanceof Ctor;
}

// The browser is never shown a provider error verbatim. An API error message
// can carry the provider's own diagnostic text, request identifiers and, for
// some validation failures, a fragment of what was sent, which here is prompt
// content. The status alone is enough to tell the user what to do next.
function safeProviderError(err) {
  const status = err && Number(err.status);
  if (status === 429) {
    return { code: 'ai_rate_limited', error: 'The AI service is busy right now. Please wait a minute and generate again.' };
  }
  if (status === 529 || status === 503 || status === 502 || status === 500) {
    return { code: 'ai_unavailable', error: 'The AI service is temporarily unavailable. Please try again in a few minutes.' };
  }
  if (status === 401 || status === 403) {
    return { code: 'server_config', error: 'The AI service rejected the server credentials. The API key needs to be checked in Netlify.' };
  }
  if (status === 400 || status === 413 || status === 422) {
    return { code: 'ai_rejected', error: 'The AI service could not accept this request. Try shortening the additional instructions or the product notes.' };
  }
  // The SDK's error classes all report name "Error", so the class is tested
  // directly rather than by name.
  if (isSdkError(err, 'APIConnectionTimeoutError') || (err && (err.name === 'AbortError' || err.name === 'TimeoutError'))) {
    return { code: 'ai_timeout', error: 'The AI service did not respond in time. Please try again.' };
  }
  return { code: 'ai_failure', error: 'The AI service could not generate the article. Please try again.' };
}

// What reaches the server log about a provider failure: the class of error and
// its status, never its message, for the same reason as above.
function describeProviderError(err) {
  if (!err) return 'unknown';
  const kind = isSdkError(err, 'APIConnectionTimeoutError') ? 'connection_timeout'
    : isSdkError(err, 'APIConnectionError') ? 'connection_error'
    : isSdkError(err, 'APIError') ? 'api_error'
    : 'error';
  const type = err.error && err.error.error && err.error.error.type;
  return [kind, err.status ? `status ${err.status}` : '', type || ''].filter(Boolean).join(' ');
}

// Returns { ok: true, payload } or { ok: false, status, error, code }.
async function runGeneration({ articleType, fields, apiKey, timer, client, pack }) {
  if (!pack || typeof pack.render !== 'function') {
    // A programming error, not a configuration one: every caller loads the pack
    // before it gets here. Reported without any detail of what is missing.
    return { ok: false, status: 500, error: 'The article instructions were not loaded.', code: 'prompt_config' };
  }
  const anthropic = client || new Anthropic({ apiKey, maxRetries: MODEL_MAX_RETRIES });

  const promptStart = timer ? timer.start() : 0;
  let articlePrompt, metadataPrompt;
  try {
    articlePrompt = BUILDERS[articleType](fields, pack);
    metadataPrompt = buildMetadataAndRelatedPrompt(articleType, fields, pack);
  } catch (err) {
    // A template the pack lacks, or a placeholder it cannot fill. The template
    // name is structural and safe to log; the content never is.
    console.error('Prompt build failed for pack', pack.version, ':', err && err.message);
    if (timer) timer.record('prompt_build', timer.since(promptStart));
    return { ok: false, status: 503, error: 'The article instructions are not configured correctly on the server. No article was generated.', code: 'prompt_config' };
  }
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
    console.error('Anthropic article call failed:', describeProviderError(err));
    const safe = safeProviderError(err);
    return { ok: false, status: 502, error: safe.error, code: safe.code };
  }

  const processingStart = timer ? timer.start() : 0;
  const rawHtml = stripDashes(stripFences(firstText(articleRes.value)));
  // Deterministic structural repair of the collapsed comparison-table header,
  // applied BEFORE validation and before anything is returned, so the preview,
  // the Copy HTML value and the published post all carry the same repaired HTML.
  // The repair refuses to act unless it is certain; validateArticleOutput still
  // warns about anything it left alone.
  const repair = repairArticleHtml(rawHtml);
  // Allowlist sanitisation, independent of anything the model was told. A normal
  // article passes through byte for byte; one carrying a script, an event
  // handler or an unsafe URL is rebuilt without it, and a warning says so.
  const cleaned = sanitizeArticleHtml(repair.html);
  const html = cleaned.html;
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

  if (cleaned.changed) {
    warnings.push('Some HTML in the generated article was not safe to publish (for example a script, an event handler or an unsafe link) and was removed. Read the article through before publishing.');
  }

  if (repair.repaired) {
    warnings.push(`The comparison table header row came back merged into one cell and was rebuilt into separate header cells. Check the table before publishing.`);
  }

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
    console.error('Anthropic metadata call failed:', describeProviderError(metadataRes.reason));
    warnings.push('The excerpt, meta description and related recommendations could not be generated. The article itself is fine.');
  } else {
    try {
      const metaStop = metadataRes.value && metadataRes.value.stop_reason;
      meta = parseMetadata(firstText(metadataRes.value));
      // Logged without content: only whether the reply was cut off and salvaged.
      if (meta.partial || metaStop === 'max_tokens') {
        console.error('Metadata response incomplete:', JSON.stringify({ stopReason: metaStop || null, salvaged: !!meta.partial }));
      }
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

  // House-style phrases and outline-label headings, from the pack's own lists.
  // Warns only; the count is logged, never the text.
  const voice = checkVoice(articleType, pack, { html, excerpt, metaDescription });
  if (voice.warnings.length) {
    warnings.push(...voice.warnings);
    console.error('House-style check:', JSON.stringify({ matches: voice.found.length }));
  }

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
  MODEL_MAX_RETRIES,
  _internals: { safeProviderError, describeProviderError, stripFences, stripDashes, stripDashesPlain, firstText, parseMetadata, salvageMetadata, reconcileArticles, reconcileCatalogProducts }
};
