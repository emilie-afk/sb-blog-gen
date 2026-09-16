// Live gift catalog. Reads the public Shopify collection JSON that
// SucculentsBox.com already serves. No Admin API, no credentials, and only
// handles from the allowlist in data/gift-collections.js are ever requested.

const {
  isAllowedCollection, isAllowedLivePlantCollection,
  collectionForOccasion, DEFAULT_GIFT_COLLECTION
} = require('../../data/gift-collections.js');

const STORE_ORIGIN = 'https://succulentsbox.com';
const FETCH_TIMEOUT_MS = 8000;
const PAGE_SIZE = 250;
const MAX_PAGES = 16;
const PAGE_BATCH = 4;
const WALK_BUDGET_MS = 7000;
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes on a warm instance
const DESCRIPTION_LIMIT = 200;

// Per-instance cache. Netlify recycles instances, so this is a best-effort
// warm cache, backed up by the Cache-Control header below.
const cache = new Map();

function json(statusCode, payload, extraHeaders) {
  return {
    statusCode,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}),
    body: JSON.stringify(payload)
  };
}

function money(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return '$' + n.toFixed(2);
}

// Lowest available variant price, else the first variant price. Never a range.
function pickPrice(variants) {
  const list = Array.isArray(variants) ? variants : [];
  if (!list.length) return { price: '', compareAtPrice: '' };
  const available = list.filter(v => v && v.available && Number.isFinite(Number(v.price)));
  const pool = available.length ? available : list;
  const chosen = pool.reduce((lowest, v) => {
    if (!lowest) return v;
    return Number(v.price) < Number(lowest.price) ? v : lowest;
  }, null);
  return { price: money(chosen && chosen.price), compareAtPrice: money(chosen && chosen.compare_at_price) };
}

// body_html is large and inconsistent marketing copy. Strip it to a short plain
// text blurb for the picker UI only. It is never treated as verified product
// fact and never reaches an article prompt.
function shortDescription(bodyHtml) {
  const text = String(bodyHtml || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= DESCRIPTION_LIMIT) return text;
  return text.slice(0, DESCRIPTION_LIMIT).replace(/\s+\S*$/, '') + '…';
}

function normalizeProducts(raw, sourceCollection, source, sharedSeen) {
  const products = Array.isArray(raw && raw.products) ? raw.products : [];
  const seen = sharedSeen || new Set();
  const out = [];
  for (const p of products) {
    if (!p || !p.handle || !p.title) continue;
    const key = String(p.id || p.handle);
    const handleKey = String(p.handle).toLowerCase();
    if (seen.has(key) || seen.has(handleKey)) continue;
    seen.add(key);
    seen.add(handleKey);
    const { price, compareAtPrice } = pickPrice(p.variants);
    out.push({
      id: p.id,
      title: p.title,
      handle: p.handle,
      url: STORE_ORIGIN + '/products/' + p.handle,
      price,
      compareAtPrice,
      image: (Array.isArray(p.images) && p.images[0] && p.images[0].src) || '',
      productType: p.product_type || '',
      tags: Array.isArray(p.tags) ? p.tags.slice(0, 20) : [],
      description: shortDescription(p.body_html),
      sourceCollection,
      source
    });
  }
  return out;
}

async function fetchPage(handle, page) {
  const url = `${STORE_ORIGIN}/collections/${handle}/products.json?limit=${PAGE_SIZE}&page=${page}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json', 'User-Agent': 'succulents-box-blog-generator' }
    });
    if (!res.ok) {
      const err = new Error(`The Succulents Box storefront returned HTTP ${res.status} for that collection.`);
      err.statusCode = res.status === 404 ? 404 : 502;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCollection(handle, source) {
  const seen = new Set();
  const products = [];
  const deadline = Date.now() + WALK_BUDGET_MS;
  let pages = 0;
  let truncated = false;
  const take = (raw, page) => {
    const list = Array.isArray(raw && raw.products) ? raw.products : [];
    if (list.length) pages = Math.max(pages, page);
    products.push(...normalizeProducts({ products: list }, handle, source, seen));
    return list.length;
  };

  if (take(await fetchPage(handle, 1), 1) < PAGE_SIZE) {
    return { products, pages: 1, truncated: false };
  }
  for (let start = 2; start <= MAX_PAGES; start += PAGE_BATCH) {
    const batch = [];
    for (let i = 0; i < PAGE_BATCH && start + i <= MAX_PAGES; i += 1) batch.push(start + i);
    const responses = await Promise.all(batch.map(page => fetchPage(handle, page)));
    const sizes = responses.map((raw, i) => take(raw, batch[i]));
    if (sizes.some(n => n < PAGE_SIZE)) return { products, pages, truncated: false };
    if (Date.now() > deadline) { truncated = true; break; }
    if (start + PAGE_BATCH > MAX_PAGES) truncated = true;
  }
  return { products, pages, truncated };
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

  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword || payload.token !== sitePassword) {
    return json(401, { error: 'Your session has expired. Please sign in again.', code: 'unauthorized' });
  }

  // A collection may be chosen explicitly, but only from the allowlist. Anything
  // else, including a full URL or another domain, is ignored in favour of the
  // occasion mapping or the default collection.
  const catalogType = payload.catalogType === 'plants' ? 'plants' : 'gift';
  const requested = typeof payload.collection === 'string' ? payload.collection.trim().toLowerCase() : '';
  let handle;
  let collectionSource;
  const allowed = catalogType === 'plants' ? isAllowedLivePlantCollection : isAllowedCollection;
  if (requested && allowed(requested)) {
    handle = requested;
    collectionSource = 'requested';
  } else if (catalogType === 'plants') {
    handle = 'all';
    collectionSource = requested ? 'rejected_request' : 'default';
  } else if (requested) {
    handle = collectionForOccasion(payload.occasion);
    collectionSource = 'rejected_request';
  } else {
    handle = collectionForOccasion(payload.occasion);
    collectionSource = payload.occasion ? 'occasion' : 'default';
  }

  const cacheKey = `${catalogType}:${handle}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < CACHE_TTL_MS) {
    return json(200, {
      collection: handle,
      catalogType,
      collectionSource,
      products: cached.products,
      count: cached.products.length,
      pages: cached.pages,
      truncated: !!cached.truncated,
      cached: true,
      fetchedAt: new Date(cached.at).toISOString()
    }, { 'Cache-Control': 'private, max-age=900' });
  }

  try {
    const source = catalogType === 'plants' ? 'live-plant-catalog' : 'live-gift-catalog';
    const { products, pages, truncated } = await fetchCollection(handle, source);
    cache.set(cacheKey, { at: Date.now(), products, pages, truncated });
    return json(200, {
      collection: handle,
      catalogType,
      collectionSource,
      products,
      count: products.length,
      pages,
      truncated,
      cached: false,
      fetchedAt: new Date().toISOString()
    }, { 'Cache-Control': 'private, max-age=900' });
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
    console.error('Gift catalog fetch failed for', handle, ':', err && err.message);
    return json(err && err.statusCode === 404 ? 404 : 502, {
      error: aborted
        ? 'The Succulents Box storefront did not respond in time.'
        : (err && err.message) || 'The Succulents Box storefront could not be reached.',
      code: 'storefront_failure',
      collection: handle
    });
  }
};

exports._internals = {
  normalizeProducts, pickPrice, shortDescription, money, fetchCollection,
  DEFAULT_GIFT_COLLECTION, PAGE_SIZE, MAX_PAGES, PAGE_BATCH
};
