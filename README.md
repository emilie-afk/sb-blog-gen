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

The Gift Products selector also offers `All products`. Shopify collection pages
are fetched in bounded batches of 250, deduplicated, cached, and searched in the
browser. Only the first 100 matches are rendered at once. If the storefront walk
reaches its time budget, the picker labels the result as potentially incomplete.

The Netlify runtime is pinned to Node 22. The generate handler avoids optional
chaining in its initialization path, and `tests/packaged.test.js` recreates the
packaged file layout and verifies that a bad token reaches the handler as a 401.

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

## Generation timing and the 60 second limit

Netlify's synchronous function limit is 60 seconds and cannot be configured, so
the list formats do not run synchronously any more.

- `generate.js` still serves the care guide and single-plant formats, which are
  bounded, and remains available as a fallback for the list formats.
- `generate-background.js` runs the general and occasion gift guides. Netlify
  executes any function whose name ends in `-background` asynchronously with a
  15 minute budget, so a long guide is no longer racing the request timeout.
  Netlify answers the browser with an **empty 202 and no body**, before the
  handler has necessarily run, so the browser mints the job id and keeps using
  its own. Every outcome reaches the user through the job record.
- `generate-status.js` is what the browser polls, every 2.5 seconds. It reports
  `pending`, `complete`, `failed` or `expired`. The browser never clears the form
  or the confirmed products, so any of those states leaves the work ready to
  retry.
- **Startup race.** Because the 202 can arrive before `createPending` has
  written anything, a missing record is reported as `pending` while the job is
  younger than a 90 second startup grace period, measured from the base-36
  submit time in the job id. The id is parsed defensively: a malformed or
  implausible id is rejected as `bad_job_id`, and a future-dated one is clamped
  to now, so a forged id can only shorten its own grace, never extend it or
  reach another job's record. Only past the grace period does a missing record
  mean `job_expired`.
- The browser polls for the full 15 minute platform limit plus 30 seconds. If it
  gives up first, that is reported as `client_wait_timeout`, which says this
  browser stopped waiting and the job may still finish, rather than claiming the
  server expired it.
- `lib/job-store.js` keeps job records in Netlify Blobs. Records expire after an
  hour. There is no production fallback: a store failure throws and the caller
  reports `job_store_unavailable`. The in-memory store exists only when a test
  installs it through `useMemoryStoreForTests()`.

### Netlify Blobs in Lambda compatibility mode

These functions export `exports.handler = async (event) => {}`, the Lambda style
signature rather than Functions v2, so `@netlify/blobs` cannot pick the
environment up on its own. Every handler that reaches the store calls
`jobs.connectJobStore(event)` first, which runs `connectLambda(event)` to read
the invocation's base64 Blobs context and set `siteID`, `token`, `edgeURL` and
`deployID`. No `SITE_ID` or personal access token is configured by hand.

Installed version: **@netlify/blobs 8.2.0**, and the store uses the **default,
eventual consistency**. `connectLambda` sets four properties and never
`uncachedEdgeURL`, while the client throws `BlobsConsistencyError` on a
strong-consistency read without it. That is true in 8.2.0 and unchanged in
11.1.0, the newest release, so no upgrade makes strong consistency available in
Lambda mode and `uncachedEdgeURL` is never derived by hand.

Eventual consistency shapes how records are written. A new blob is globally
available immediately; an update to an existing key can take up to 60 seconds to
propagate. The terminal record is therefore written under its own
`<jobId>.result` key rather than overwriting the pending one, and a read checks
that key first, so completion is visible as soon as it is written. If a future
change were to overwrite the pending key instead, completion could appear up to
60 seconds late; the 15 minute polling window and the 90 second startup grace
both have room for that.

Every generation logs one line per run:

```json
{"event":"generation_timing","context":"generate","totalMs":0,"phases":{
  "validation":0,"prompt_build":0,"article_call":0,"metadata_call":0,
  "ai_calls":0,"response_processing":0},"articleType":"...","productCount":0,
  "recommendationCount":0,"articleChars":0,"truncated":false,"ok":true}
```

The keys are an allowlist in `lib/timing.js`: durations, small counts and the
article type. No prompt text, article text, field values, passwords or API keys
can appear in a log line. `ai_calls` is the wall-clock span of both model calls,
which run in parallel, so it is close to the longer of the two rather than their
sum.

Output budget: the article call is capped at 3500 tokens and the metadata call at
600. When the model stops because it hit the cap, the response carries
`truncated: true` and a warning, and the browser shows it as an error. A cut-off
article is never presented as a finished one.
