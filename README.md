# Succulents Box Blog Post Generator

Internal content-production tool. Generates Shopify-ready blog HTML in four formats:

| Format | Internal value | Products |
| --- | --- | --- |
| Plant Care Guide | `care_guide` | Catalog suggestions, reference panel only |
| Single-Plant Gift Guide | `single_plant_gift` | Catalog suggestions, reference panel only |
| General Gift Guide | `general_gift_guide` | User-confirmed products, written into the article |
| Occasion Gift Guide | `occasion_gift_guide` | User-confirmed products, written into the article |

No build step. Plain HTML, CSS, JavaScript and Netlify Functions.

## Layout

```
index.html                    markup, styles, script tags
data/catalog.js               CATALOG, shared by the browser and the functions
data/articles.js              ARTICLES, shared by the browser and the functions
app/formats.js                per-format fields, labels, progress copy, panel names
app/ui.js                     preview sanitizer, copy helpers, panel rendering
app/products.js               confirmed-product picker (catalog search + manual entry)
app/main.js                   form state, validation, request creation, output rendering
netlify/functions/auth.js     password check, returns the session token
netlify/functions/generate.js request validation, prompt selection, Anthropic calls
netlify/functions/lib/        prompt builders, shared rules, validation, article ranking
```

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
  "title": "", "html": "", "excerpt": "", "meta_description": "",
  "products": [], "related_articles": [], "warnings": [], "articleType": ""
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
- Related articles and catalog products returned by the model are reconciled against
  `data/articles.js` and `data/catalog.js`, so an invented URL never reaches the page.

## Environment variables

- `SITE_PASSWORD` — team password, also used as the session token.
- `ANTHROPIC_API_KEY` — used only inside the function, never sent to the browser.

## Local testing

The functions need the Netlify CLI (`netlify dev`) or a local mock. The static files
can be served from the repo root with any static server.

## Adding gift metadata later

`data/catalog.js` rows are `{t, h, p, i, cat}`. The picker in `app/products.js` maps a
row into a confirmed-product record in one place (`fromCatalog`), so per-product gift
metadata can be added to the catalog and carried through without touching the rest of
the app:

```js
{ giftTypes: [], occasions: [], recipients: [], careLevel: "", lightLevel: "",
  petSafety: "", priceBand: "", giftReady: null, ecoAttributes: [], active: true }
```

These are deliberately unset today. Do not fill them with guessed values. The catalog
is a working list, not the full Shopify catalog, which is why manual product entry
exists.
