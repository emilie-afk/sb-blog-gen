# Succulents Box Blog Post Generator

Internal content-production tool. Generates Shopify-ready blog HTML in four formats:

| Format | Internal value | Products |
| --- | --- | --- |
| Plant Care Guide | `care_guide` | Catalog suggestions, reference panel only |
| Single-Plant Gift Guide | `single_plant_gift` | Catalog suggestions, reference panel only |
| General Gift Guide | `general_gift_guide` | User-confirmed products, written into the article |
| Occasion Gift Guide | `occasion_gift_guide` | User-confirmed products, written into the article |

Titles are generated, not typed. The content user can give an optional *title
direction*, then picks the recommended title or one of two alternatives after
generation.

No build step. Plain HTML, CSS, JavaScript and Netlify Functions.

## Layout

```
index.html                    markup, styles, script tags
data/catalog.js               CATALOG of individual plants, shared by browser and functions
data/articles.js              ARTICLES, shared by the browser and the functions
data/gift-collections.js      allowlisted storefront gift collections + occasion mapping
app/formats.js                per-format fields, labels, progress copy, panel names
app/ui.js                     preview sanitizer, copy helpers, panel rendering
app/products.js               confirmed-product picker (catalog search + manual entry)
app/main.js                   form state, validation, request creation, output rendering
netlify/functions/auth.js         password check, returns the session token
netlify/functions/gift-catalog.js live gift and plant products from public storefront JSON
netlify/functions/generate.js     request validation, prompt selection, Anthropic calls
netlify/functions/lib/            prompt builders, shared rules, validation, titles,
                                  article ranking, post-generation output checks
tests/                            server, handler and browser suites (tests/run.sh)
```

## Live storefront catalogs

`gift-catalog.js` reads the public Shopify collection JSON that SucculentsBox.com
already serves (`/collections/<handle>/products.json`). No Admin API and no
credentials. Only handles listed in `data/gift-collections.js` can be requested:
anything else, including a full URL or another domain, falls back to the occasion
mapping or `succulents-gift-boxes`. Responses are deduplicated by product id and
handle, normalized, cached for 20 minutes per warm instance and for the session in
the browser. Price is the lowest available variant price (or the first variant
price), never a range. `body_html` is stripped to a short plain-text blurb shown
only in the picker: it is marketing copy, so it never reaches an article prompt.

The product picker has three tabs, Gift Products, Live Plants and Add Manually.
Both catalog tabs load current products from SucculentsBox.com. The old
`data/catalog.js` plant list is offered only as an explicitly labelled offline
fallback if the live plant request fails. Selections from all three sources combine into one ordered list that
survives tab switches. Factual notes can be added to any confirmed product; those
notes are the only product-level facts the article is allowed to state.

`data/*.js` are dual-mode: a classic script in the browser (globals) and a CommonJS
module in the functions. `netlify.toml` bundles them into the functions explicitly.

## Request and response contract

Request:

```json
{ "articleType": "occasion_gift_guide", "fields": { }, "token": "..." }
```

`articleType` is checked against an allowlist server side, and every field is type
checked, length capped and rebuilt before it reaches a prompt builder. The browser
never sends prompt text.

Response:

```json
{
  "title": "", "alternative_titles": ["", ""], "html": "", "excerpt": "",
  "meta_description": "", "products": [], "related_articles": [],
  "warnings": [], "articleType": ""
}
```

`html` is the article body only. The title is handled separately so it can go into
Shopify's own title field without being duplicated in the body.

## Rules the generator enforces

- Gift-guide list articles only ever mention products the user confirmed. Claude is
  never asked to choose or invent a product for those formats.
- Holiday and observance dates are never guessed. A date appears only when the
  content user supplies a verified one.
- Sensitive Occasion mode removes urgency, celebration, promotion and any suggestion
  that a plant can help with grief.
- Product attributes (price, pet safety, packaging, shipping, materials, eco claims)
  are only written when supplied as confirmed facts.
- Em dashes and en dashes are forbidden in the prompts and stripped server side.
- There is no tone selector. The occasion, recipient, relationship and the
  sensitive-occasion flag set the emotional register; the editorial voice is fixed.
- Product attributes are stated only from confirmed data. No invented shipping
  behaviour, ordering windows, pet safety, packaging, materials or care levels.
- Gift guides are capped at 8 recommendations per article so one synchronous
  generation stays inside the platform execution limit. A larger request is
  rejected, never silently truncated.
- After generation the article HTML is checked structurally (comparison table
  headers and row count, every confirmed product title and URL present, no
  unconfirmed product URL). Findings are surfaced as warnings and nothing is
  rewritten.
- Related articles and catalog products returned by the model are reconciled against
  `data/articles.js` and `data/catalog.js`, so an invented URL never reaches the page.

## Environment variables

- `SITE_PASSWORD` — team password, also used as the session token.
- `ANTHROPIC_API_KEY` — used only inside the function, never sent to the browser.

## Local testing

```
bash tests/run.sh
```

Runs a syntax pass, the validation and prompt-builder suite, the correction-pass
suite, the generate handler against a stubbed Anthropic SDK, and a headless browser
suite against `tests/mock-server.js` (which mocks all three functions). The browser
suite needs playwright and a chromium binary. For manual work, `netlify dev` serves
the real functions.

## Adding fallback metadata later

`data/catalog.js` rows are `{t, h, p, i, cat}`. The picker in `app/products.js` maps a
row into a confirmed-product record in one place (`fromCatalog`), so per-product gift
metadata can be added to the catalog and carried through without touching the rest of
the app:

```js
{ giftTypes: [], occasions: [], recipients: [], careLevel: "", lightLevel: "",
  petSafety: "", priceBand: "", giftReady: null, ecoAttributes: [], active: true }
```

These are deliberately unset today. Do not fill them with guessed values. This catalog
is only an offline fallback, not the current Shopify catalog. Manual product entry
also remains available.
