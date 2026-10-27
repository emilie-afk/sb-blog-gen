# The private prompt pack

Every instruction the generator sends to the model lives in a **prompt pack**: a
single JSON document stored in Netlify Blobs, read only by the server functions,
and never committed to this repository. This document explains what is in it,
how it is stored and versioned, and how to import, update and roll it back.

## Inventory

What was confidential, where it was, and where it is now.

| Content | Was in | Now |
| --- | --- | --- |
| Writing and HTML output rules | `lib/shared-rules.js` | pack `shared.styleRules.*` |
| Plant accuracy rules | `lib/shared-rules.js` | pack `shared.plantAccuracy.*` |
| Gift brand voice, relationship guidance, banned phrases, voice and recipient checks | `lib/shared-rules.js` | pack `shared.giftVoice.*` |
| Approved style samples (three shortened articles) | `lib/shared-rules.js` | pack `shared.giftVoice.body` |
| Evidence rules and storefront-description rules | `lib/shared-rules.js` | pack `shared.evidenceRules`, `shared.storefrontDescriptionRules` |
| Comparison-table instructions | `lib/shared-rules.js` | pack `shared.comparisonTable.*` |
| How confirmed products, references, keywords and extra instructions are labelled for the model | `lib/shared-rules.js` | pack `shared.productEntry.*`, `shared.references.*`, `shared.keywordLine`, `shared.additionalInstructions` |
| Care guide template and every plant-type section variant | `lib/prompt-care-guide.js` | pack `careGuide.*` |
| Single-plant gift template and brief | `lib/prompt-single-plant-gift.js` | pack `singlePlantGift.*` |
| General gift guide template, structure and banned sections | `lib/prompt-general-gift-guide.js` | pack `generalGiftGuide.*` |
| Occasion gift guide template, date rules, sensitive-occasion rules | `lib/prompt-occasion-gift-guide.js` | pack `occasionGiftGuide.*` |
| Product-selection, title, metadata and related-article instructions | `lib/prompt-metadata-related.js` | pack `metadata.*` |
| An unused product-accuracy fragment (never sent to the model) | `lib/shared-rules.js` | pack `archive.productAccuracy`, kept for reference |
| Editorial regression suites, which quote the rules they check | `tests/*.test.js` (six files) | private, outside the repository |
| The original care-guide prompt, built in the browser | `index.html`, May to September 2026 | history only; see `HISTORY-CLEANUP.md` |

**AI repair prompts:** there are none. The only post-processing is the
deterministic comparison-table repair in `lib/repair-output.js`, which makes no
model call and stays in the repository.

### What stays in the repository, and why

The application logic around the prompts is not confidential and is what makes
the app correct, so it stays where it can be read, reviewed and tested:

- **Prompt assembly**: which template each format and plant type selects, which
  values fill it, and which internal links a care section may carry. For
  example, the code only gives the succulent overwatering link to the Succulent
  and Cactus watering section, so a pack that tried to put it into an air-plant
  guide fails to render rather than sending it.
- Request validation, the output sanitiser, the table repair, the structural
  output checks, article ranking and reconciliation, title resolution, and the
  job handling.
- The internal page URLs the care guide may cite, the heading colours and the
  shop button markup. These are public website material and presentation.

## Storage design

**Store:** Netlify Blobs, store name `prompt-packs`, private to the site.

Why Blobs: the app already depends on it for job records; Blobs has no public
URLs and is reachable only through the site's own functions; it adds no cost or
service; and a pack version is a single document written once, which suits it.

Why not environment variables: these functions use the Lambda-compatible
signature, and in that mode Netlify still caps the whole function environment at
4KB (the June 2026 removal of that cap applies only to the current Functions
runtime). The pack is about 100KB. It would not fit, and it would be copied into
every function's environment.

| Key | Contents | Written |
| --- | --- | --- |
| `pack/<version>` | the pack JSON | once, by `import`; never changed |
| `meta/<version>` | `{ version, hash, importedAt }` | once, by `import` |
| `active` | production's signed pointer: `{ channel, version, hash, activatedAt, signature }` | by `activate --channel production` and `rollback` |
| `active.<channel>` | another deploy context's signed pointer, e.g. `active.preview` | by `activate --channel <channel>` |
| `history/<channel>/<time>-<version>` | `{ version, hash, channel, activatedAt, previous }` | one new key per activation |

### Deploy contexts, channels and signatures

Netlify shares a site's Blobs stores across production, deploy previews and
branch deploys, so the pack store cannot be split by context. The **pointer**
is. Versions are shared, because they are immutable; which version runs is
chosen per channel.

- **The context is trusted.** The build stamps Netlify's reserved `CONTEXT` into
  the function bundle; the functions read that, not a request or a site setting.
- **Production** reads only `active`. A production deploy with any other
  `PROMPT_PACK_CHANNEL` refuses to generate.
- **Previews, branch deploys and dev** must set `PROMPT_PACK_CHANNEL` to a valid
  name other than `production`. Unset, invalid or `production` refuses. They can
  never read production's pointer.
- **An unknown or missing stamp** refuses.
- **Pointers are signed** (Ed25519) by the operator's private key, made once with
  `node tools/pack.js keygen --out <file>`. The functions verify against
  `PROMPT_PACK_PUBLIC_KEY`. The channel, version, content hash and activation
  time are all inside the signature. So an unsigned pointer, one signed by
  another key, a preview pointer copied into production's key, or a pack swapped
  under a valid pointer are all refused, logged by reason (never by content).
- **The deployed code has no write path to the pack store** (a committed test
  enforces this). That is an application safeguard. A deploy's Blobs credentials
  *can* write the store; the signature is what makes such a write useless. They
  can also *read* the store, which is why `docs/ROLLOUT.md` step 0 restricts who
  can cause a deploy.
- `activate` and `rollback` refuse to run without `--channel` and `--key`.

### Versioning and pinning

- **A version is immutable.** `import` refuses an id that already exists. To
  change anything, import it under a new id.
- **Every version has a content hash** (`sha256:` over the flattened templates,
  independent of key order), recorded at import. `activate` recomputes it and
  refuses a version whose stored content no longer matches.
- **Nothing incomplete is activated.** `validate`, `import` and `activate` all
  check that every template in `REQUIRED_TEMPLATES` (`lib/prompt-pack.js`) is
  present and non-empty, then dry-run every article format and its metadata
  prompt for all 141 synthetic briefs in `tests/fixtures/prompt-briefs.js`. An
  unknown placeholder or an unfilled `{{...}}` fails the dry run.
- **No partial activation.** A pack is one document and `active` is one key, so
  every format in a generation reads the same version. There is no way for one
  format to run on new instructions while another runs on old ones.
- **A running job keeps its version.** A function loads the active pack once, at
  the start of a request, and uses that same handle for every prompt it builds.
  The background job stamps the version on its record. Activating a new pack
  mid-run cannot reach it (the security suite proves this by activating a new
  version while a job's model call is in flight).
- **Timing.** `active` is an update to an existing key, which Blobs propagates
  within about 60 seconds, and each function instance caches the pointer for up
  to 60 seconds. Allow about two minutes for an activation or a rollback to
  reach every new generation.

### When the pack is unavailable

There is no fallback copy in source. If no pack is active, the active version is
missing, or it is incomplete, generation stops before any model call and the
browser is told the article instructions are not configured (code
`prompt_config`). The message is the same in every case and names no template.
The function log records the template names that are missing, never their
content.

## Procedures

All of these are run from a checkout of this repository, on a trusted machine.
Commands other than `validate` need two values **in your own shell only**, never
in Netlify:

```
export NETLIFY_SITE_ID=<the site's API ID, from Site configuration > General>
export NETLIFY_AUTH_TOKEN=<a personal access token for an account on the team>
```

Keep pack files in `private/` (ignored by Git) or outside the repository
altogether. Treat them like a credential: they are the thing this work protects.

### First import

1. Take the pack file delivered with this change (`prompt-pack.v1.json`). It was
   extracted from the prompt modules at commit `20043bc`.
2. Prove it reproduces the old prompts exactly:
   ```
   node tools/pack-parity.js --pack private/prompt-pack.v1.json --ref 20043bc
   ```
   Expected: `282 prompts compared across 141 briefs, 0 mismatches.` and
   `pack hash sha256:db46a3b2…94d24e`. Run this **before** any history cleanup,
   while commit `20043bc` still exists; afterwards use `--baseline <dir>` with a
   private copy of the old modules.
3. Validate, import and activate:
   ```
   node tools/pack.js validate private/prompt-pack.v1.json
   node tools/pack.js import private/prompt-pack.v1.json --version 2026-10-23.1
   node tools/pack.js keygen --out ~/sb-pack-signing-key.pem          # once; keep it private
   node tools/pack.js activate 2026-10-23.1 --channel preview    --key ~/sb-pack-signing-key.pem
   node tools/pack.js activate 2026-10-23.1 --channel production --key ~/sb-pack-signing-key.pem
   node tools/pack.js list
   ```

### Updating the instructions

1. Export the active version, or start from your private copy:
   `node tools/pack.js export 2026-10-23.1 --out private/working.json`
2. Edit the JSON. Placeholders are `{{name}}`. The placeholders each template may
   use are exactly those listed for it in
   `tests/fixtures/synthetic-prompt-pack.json`; anything else fails validation.
3. `node tools/pack.js validate private/working.json`
4. Run the private editorial suites against it (below).
5. Import under a new version, try it on previews, then production:
   ```
   node tools/pack.js import private/working.json --version 2026-11-02.1
   node tools/pack.js activate 2026-11-02.1 --channel preview    --key ~/sb-pack-signing-key.pem
   node tools/pack.js activate 2026-11-02.1 --channel production --key ~/sb-pack-signing-key.pem
   ```

### Rolling back

```
node tools/pack.js rollback --channel production --key <file>            # to the version active before this one
node tools/pack.js activate <version> --channel production --key <file>  # or to any stored version
```

Both keep every version stored; nothing is deleted. Allow about two minutes.

### Backup

`node tools/pack.js export <version> --out <file>` writes a private copy
(file mode 600). Keep at least the active version and the one before it outside
Netlify.

## Editorial regression suites

The six suites that check the instructions themselves (voice rules, banned
phrases, sample handling, care routing wording, evidence rules) quote the rules
they test, so they are private and live outside the repository. They are
delivered with the pack. Run them against a pack file:

```
SB_PROMPT_PACK=private/prompt-pack.v1.json bash private/editorial-tests/run.sh
```

`tests/support/editorial-preload.js` (committed, no content) gives them the pack.
At the time of this change: 824 checks, all passing on the v1 pack. Run against
the synthetic pack they fail, which is the check that they really test content.

They are **automated structural checks of the instructions**, not an assessment
of writing quality. Whether generated articles read well is a human judgement,
made by reading generated articles.

## Committed tests and fixtures

- `tests/fixtures/synthetic-prompt-pack.json`: every template is a marker plus
  the placeholders the code fills, and nothing else. Regenerate it after changing
  what a builder passes: `node tests/fixtures/make-synthetic-pack.js`.
- `tests/fixtures/editorial-fingerprints.json`: one-way digests of 40-character
  windows of the real pack. `tests/prompt-pack.test.js` hashes every window of
  every repository file and fails if one matches, so a copy of the instructions
  cannot creep back in unnoticed. After a substantial rewrite of the pack,
  regenerate them privately with the delivered `make-fingerprints.js`.
