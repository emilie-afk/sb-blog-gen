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

Plain HTML, CSS, JavaScript and Netlify Functions. The only build step copies an
explicit allowlist of browser files into `public/`, which is all Netlify
publishes (`tools/build-site.js`).

The editorial instructions the generator sends to the model (brand voice,
article templates, style samples, product and metadata rules) are **not in this
repository**. They live in a private, versioned prompt pack in Netlify Blobs,
read only by the server functions. See `docs/PROMPT-PACK.md`. Sign-in uses
signed, expiring HttpOnly session cookies; see `docs/SECURITY.md`.

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
netlify/functions/auth.js         sign in (password -> signed session cookie) and sign out
netlify/functions/gift-catalog.js live gift and plant products from public storefront JSON
netlify/functions/generate.js     synchronous generation (single-plant gift guide)
netlify/functions/generate-background.js  background generation (the other formats)
netlify/functions/generate-status.js      job status, scoped to the session that started it
netlify/functions/lib/session.js          signed sessions, cookies, CSRF, authorisation
netlify/functions/lib/prompt-pack.js      loads, validates and renders the private prompt pack
netlify/functions/lib/limits.js           login throttling and usage limits
netlify/functions/lib/sanitize-output.js  allowlist sanitiser for the article HTML
netlify/functions/lib/                    prompt assembly (no editorial wording), validation,
                                          titles, ranking, table repair, output checks, jobs
tools/                            site build (stamps the deploy context), private prompt-pack
                                  tooling and signing, parity check, ownership race check,
                                  read-only listing of obsolete Netlify deploys
docs/                             security, prompt pack, rollout and history cleanup
tests/                            server, handler, security and browser suites (tests/run.sh)
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
packaged file layout and verifies that the handler initializes, refuses a
request without a session, and fails closed without its security configuration.

`data/*.js` are dual-mode: a classic script in the browser (globals) and a CommonJS
module in the functions. `netlify.toml` bundles them into the functions explicitly.

## Request and response contract

Request:

```json
{ "articleType": "occasion_gift_guide", "fields": { } }
```

The request carries no credential in its body. The session is an HttpOnly cookie
the page cannot read, and every protected call also sends the `X-CSRF-Token`
header issued at sign-in. `articleType` is checked against an allowlist server side, and every field is type
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

Set in Netlify (Site configuration > Environment variables). Full list, with
optional limits, in `docs/SECURITY.md`.

- `SITE_PASSWORD` — the team password. Compared on the server only; never sent
  back to the browser.
- `SESSION_SECRET` — at least 32 random characters, used to sign sessions.
- `SESSION_EPOCH` — optional; raise it to sign everyone out at once.
- `PROMPT_PACK_PUBLIC_KEY` — public half of the prompt-pack signing key
  (`node tools/pack.js keygen`). Only signed pack pointers are accepted.
- `PROMPT_PACK_CHANNEL` — leave unset in production; **required** in deploy
  previews and branch deploys (for example `preview`), which refuse to generate
  without it and can never use `production`.
- `GENERATION_PAUSED` — `true` pauses generation for maintenance without
  touching sign-in or the site.
- `ANTHROPIC_API_KEY` — used only inside the functions, never sent to the browser.

Missing `SITE_PASSWORD` or `SESSION_SECRET` denies all access. Sign-out revokes
the session on the server. Login throttling and usage limits fail closed.

## Local testing

```
bash tests/run.sh
```

Runs the site build, the application-logic, prompt-pack and security suites, the
handler suites against a stubbed Anthropic SDK, and a headless browser suite
against `tests/mock-server.js`. The mock server runs the real sign-in and
authorisation code and serves only `public/`; it simulates the work behind them.
The browser suite needs playwright and a chromium binary.

Every committed suite uses synthetic fixtures and a synthetic prompt pack. The
editorial regression suites, which check the real instructions, are private:
`docs/PROMPT-PACK.md` explains how to run them.

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
most formats do not run synchronously any more.

- `generate.js` serves the single-plant gift format, and remains available as a
  fallback for the others.
- `generate-background.js` runs the care guide and both gift guides. The care
  guide moved here after it began returning 504s: ten sections, a twelve row
  table and five question-and-answer pairs is a long generation, and it was
  never as bounded as the original design assumed. It is not shortened to fit
  the limit, it is taken off the limit. Netlify
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

Installed version: **@netlify/blobs 10.7.13** (pinned exactly; it supports the
`onlyIfNew` conditional write used for job ownership and still supports Node
from 16, while 11.x requires Node 22.12 or later). The store uses the **default,
eventual consistency**. `connectLambda` sets four properties and never
`uncachedEdgeURL`, while the client throws `BlobsConsistencyError` on a
strong-consistency read without it. That is true in 8.2.0, 10.7.13 and 11.1.x,
so no version makes strong consistency available in Lambda mode and
`uncachedEdgeURL` is never derived by hand. Store names are unchanged on the
wire (`site:<name>`) between 8.2.0 and 10.7.13, so existing data stays readable.

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
