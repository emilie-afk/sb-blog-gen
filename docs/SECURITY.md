# Security model

How the Blog Generator authenticates people, authorises requests, decides who
owns a job, limits use, and keeps its instructions and credentials on the
server. Written for whoever maintains the site next. Each section says what is
guaranteed and, where it matters, what is not.

## What changed, in one table

| Before | Now |
| --- | --- |
| A correct password was answered with `{ token: <the password> }`, held by the browser and sent in every request body. It never expired. | The password is compared on the server and never sent back. The browser gets a signed, expiring session in an **HttpOnly, Secure, SameSite=Strict** cookie, plus a CSRF value kept in memory. |
| Every function compared the body token with `SITE_PASSWORD`. | Every protected function awaits one check, `authorizeRequest()` in `lib/session.js`, before parsing the request, touching other storage or calling the model. |
| No sign-out. | Sign-out clears the cookie **and revokes the session on the server**. `SESSION_EPOCH` ends every session at once. |
| A job id was enough to read a job, and two submissions of one id could both run. | Ownership is decided by a single conditional create: exactly one submission wins, and only its session can read the result. |
| No login throttling, no usage limits. | Durable login throttling and generation limits, both failing closed. |
| `publish = "."` served every repository file from the live site. | Only `public/`, an allowlist of eight browser files, is published. |
| The prompts were in public source. | The prompts are in a private, versioned, **signed** prompt pack in Netlify Blobs (`docs/PROMPT-PACK.md`). |
| Provider errors and raw model HTML reached the browser. | Errors are classified; article HTML is sanitised on the server. |

## Sessions

A session is `v1.<payload>.<signature>`: base64url JSON, signed with HMAC-SHA256
under `SESSION_SECRET`:

```json
{ "sid": "<random 128-bit id>", "csrf": "<random 128-bit value>", "iat": 0, "exp": 0, "epoch": "1" }
```

- **Nothing in it is secret.** No password, no key; the signature makes it
  unforgeable.
- **Expiry is enforced on the server** from the signed `exp` (default 12 hours,
  `SESSION_TTL_MS`). The cookie's `Max-Age` matches but is never trusted.
- **The cookie** is `sb_session`, `Path=/; HttpOnly; Secure; SameSite=Strict`.
  Page script cannot read it.
- **The password** is sent once, compared in constant time, and the field is
  cleared. Nothing is stored in `localStorage`, `sessionStorage`, IndexedDB or a
  script-readable cookie.
- **Reloading** shows the sign-in screen, as before: the CSRF value is in memory
  only.
- **When a session ends mid-work**, the page returns to sign-in with the brief
  and confirmed products still in the form.

### CSRF

Every protected call must send `X-CSRF-Token` equal to the `csrf` value signed
into the session. It comes back in the sign-in response body and is held in
memory only. Another site can make the browser send the cookie but cannot read or
send the header. `SameSite=Strict` is a second layer.

### Ending sessions

- **Sign out** clears the cookie and records the session id in the
  `session-revocations` store. Every authorised request checks that store, so a
  copy of the cookie and CSRF value taken before sign-out (a captured request, a
  synced profile, a proxy log) stops working.
  - *On the function instance that handled the sign-out:* immediately.
  - *Everywhere else:* as soon as the Blobs read sees the new key. Netlify
    documents edge propagation of changes as within 60 seconds; a new key is
    normally visible at once, but a lookup that an edge location recently
    answered "not found" may be served from cache until that window passes.
    **Treat revocation as complete everywhere within about 60 seconds.** Strong
    consistency would close the window, but the Lambda compatibility layer does
    not provide the uncached endpoint it needs.
  - *If the revocation cannot be recorded*, the cookie is still cleared and the
    response says the session could not be ended on the server and when it
    expires on its own.
- **Every session at once:** raise `SESSION_EPOCH` (for example `1` to `2`) and
  redeploy. Unchanged by this work.
- **A suspected leak of `SESSION_SECRET`:** replace it and redeploy; that ends
  every session too.
- **Locking someone out of the shared login:** change `SITE_PASSWORD` and raise
  `SESSION_EPOCH`.

### Fail closed

- Missing `SITE_PASSWORD` or `SESSION_SECRET`, or a secret under 32 characters:
  sign-in returns 503 and existing sessions are refused.
- Revocation store unreadable: the request is refused (503,
  `session_check_unavailable`). A sign-out that cannot be checked is treated as
  if it might have happened.

## What each endpoint checks

| Endpoint | Session + CSRF | Then |
| --- | --- | --- |
| `auth` (sign in) | — | throttle (fails closed), constant-time compare, issue session |
| `auth` (`logout`) | session optional | revoke server-side, clear cookie |
| `generate` | required, plus revocation | maintenance pause, validate, usage check and record, load signed pack, generate |
| `generate-background` | required, plus revocation | maintenance pause, validate, usage check, load signed pack, **atomic claim**, record usage, generate |
| `generate-status` | required, plus revocation | read job, enforce scope |
| `gift-catalog` | required, plus revocation | fetch allowlisted storefront collection |

The signature, expiry, epoch and CSRF checks run before anything touches
storage. Only a caller with a valid signed session reaches even the revocation
lookup. An unauthenticated call to `generate-background` writes nothing.

There is no endpoint that lists, returns, edits or downloads prompt content.

## Job ownership

**Guarantee (with the caveat below):** among any number of simultaneous
submissions of one job id, from any sessions and any function instances, exactly
one starts a generation, and only that session can read or finish the job.

How:
- The pending record is written with a **conditional create**, through the
  supported `@netlify/blobs` API: `store.set(key, value, { onlyIfNew: true })`
  (`@netlify/blobs` 10.7.13, pinned exactly). The client sends the PUT with
  `If-None-Match: *`; the service writes only if the key does not exist and
  answers 412 otherwise. Whoever gets the write owns the job; every other caller
  gets a "duplicate" acknowledgement and runs nothing.
- **A gap in the library is closed in `lib/atomic-create.js`.** For a
  conditional write, `@netlify/blobs` (10.7.13, and 11.1.x likewise) reports
  `{ modified: true }` for *any* answer other than 412, including 401, 403 and a
  5xx still failing after its retries. Taken at face value, two callers could
  both "win". The job store is therefore created with the library's public
  `fetch` option set to a guard that turns any conditional-PUT answer other than
  2xx or 412 into an error. The library retries and then rethrows it, so the job
  is refused, never run twice. `createIfAbsent` refuses any store not created
  with that guard, refuses an installed `@netlify/blobs` older than 10 (whose
  `set` would ignore `onlyIfNew` and overwrite), and refuses an answer without a
  boolean `modified`. The Blobs suite reproduces the gap on the real client.
- The winner keeps its own claimed record in memory and builds the terminal
  record (complete or failed) from it, so the result carries the winner's scope
  even if a re-read of the pending record would come back empty under eventual
  consistency.
- The terminal record is itself a conditional create. The first outcome stands;
  nothing can replace it.
- There is no read-then-write fallback and no plain-write fallback, and the
  browser's disabled button is not relied on. (The background function does a
  read first only as a shortcut to answer an obvious duplicate; the conditional
  create alone decides ownership.)

Tested: 50 simultaneous claims and 20 simultaneous submissions from two sessions
in the security suite; in the Blobs suite, through the **real** `@netlify/blobs`
client against a local Blobs HTTP stand-in, 20 direct claims from two sessions
and 10 handler submissions, each with exactly one winner, one
`generation_started`, no read and no overwrite by the loser; and conditional
answers of 400, 401, 403, 500 and 503 each ending as an error rather than a win.
The same claim race also passes in the functions as Netlify's nft bundler packs
them, loaded with `require(esm)` disabled. Putting the old read-then-write claim
back, dropping `onlyIfNew`, or removing the guard fails those tests.

**What is still assumed:** that the Netlify Blobs service evaluates
`If-None-Match: *` atomically per key. Netlify documents `onlyIfNew` as an atomic
conditional write; `tools/check-claim-race.js` proves it on a deploy preview
before rollout (`docs/ROLLOUT.md`, step 4).

Other job facts, unchanged:
- The browser mints the job id (Netlify's empty 202 leaves no other way).
- Another session's job reads exactly like a job that does not exist.
- Records hold the session id and prompt version, never a cookie, session
  string, CSRF value or password.
- Records from before this change carry no scope; they stay readable to a
  signed-in session for one hour after creation, then the allowance lapses.
- The model call is retried at most twice; nothing re-runs a whole generation.

## Deploy contexts and the prompt pack

Netlify shares a site's Blobs stores across production, deploy previews and
branch deploys. Isolation is built on top of that:

- **A trusted context.** Functions are not told their deploy context at runtime
  (only `URL`, `SITE_NAME` and `SITE_ID` are available). The build stamps
  Netlify's reserved, read-only `CONTEXT` into `deploy-context.json`, bundled with
  the functions.
- **Fail-closed routing** (`lib/deploy-context.js`):

  | Context | `PROMPT_PACK_CHANNEL` | Result |
  | --- | --- | --- |
  | production | unset or `production` | production pointer |
  | production | anything else | refused |
  | deploy-preview, branch-deploy, dev | valid name other than `production` | that channel's pointer |
  | deploy-preview, branch-deploy, dev | unset, invalid, or `production` | refused |
  | unknown or missing stamp | anything | refused |

  A refusal stops generation before any model call (`prompt_config`).
- **Signed pointers** (`lib/pack-signature.js`). A pointer counts only if it is
  signed (Ed25519) with the operator's private key, which never leaves the
  operator's machine. Functions verify against `PROMPT_PACK_PUBLIC_KEY`. The
  channel and the pack's content hash are inside the signature, so a preview
  pointer copied into production's key, an unsigned pointer, one signed by any
  other key, or a pack swapped under a valid pointer are all refused.

### What the deployed code cannot do, and what a deploy's credentials can

"The functions have no write path to the pack store" is an **application
safeguard, not a permission boundary**. Every deploy, previews and branch
deploys included, runs with Blobs credentials that can read and write every
store on the site. Code in a preview is the code of the branch it was built
from, so whoever can get a branch or pull request deployed controls that code.

Against such code:

| It could | Protected? |
| --- | --- |
| Activate or redirect a prompt pack | **Yes.** It cannot sign a pointer. |
| Overwrite an existing job or its result | **Yes.** Conditional creates refuse it. |
| Read the private prompt pack | **No.** It can read every store. |
| Delete revocation records, re-enabling a signed-out session until it expires | **No.** |
| Delete usage counters, resetting limits | **No.** |
| Delete job records | **No.** |

So **only people trusted with the private prompts may be able to cause a deploy
of this site.** Before rollout (`docs/ROLLOUT.md`, step 0):
- turn off deploy previews for pull requests from forks, or set the sensitive
  variable policy to require approval before such a build runs (Environment
  variables > Sensitive variable policy). Confirm in the Netlify UI that an
  outside pull request does not build;
- limit who can push branches to the repository.

The strongest structural option, if previews are wanted for outside work, is to
run them on a **separate Netlify site** with its own Blobs, its own keys and no
production data, and to turn off deploy previews and branch deploys on this one.

## Usage limits

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOGIN_MAX_ATTEMPTS` | 10 | failed sign-ins per address per window |
| `LOGIN_WINDOW_MS` | 900000 (15 min) | login window |
| `GENERATION_LIMIT_PER_SESSION` | 40 | generations per session per window |
| `GENERATION_WINDOW_MS` | 3600000 (1 h) | per-session window |
| `GENERATION_LIMIT_PER_DAY` | 400 | generations across the app per day |
| `GENERATION_DAY_MS` | 86400000 (24 h) | app-wide window |

- **Fail closed.** If the counter store cannot be read, sign-in returns 503
  (`login_unavailable`) and generation returns 503 (`limits_unavailable`). Usage
  is recorded before the model call; if it cannot be recorded, generation is
  refused, so nothing runs uncounted. This costs nothing in practice: every
  generation path already needs Blobs, so an outage that breaks the counters has
  already stopped the app.
- **Best-effort, not a spending cap.** Counting is eventually consistent, so a
  burst inside a propagation window can be undercounted, and a deploy's own Blobs
  credentials could delete counters. **The guaranteed cap is a spend limit on the
  Anthropic account itself**: set one in the Anthropic Console (organisation or
  workspace limits) at the most the team is willing to spend in a month.
- Addresses are HMAC-hashed before they become keys.

## Maintenance pause

`GENERATION_PAUSED=true` (then redeploy) makes both generation endpoints refuse
new work with "paused for maintenance", after the session check and before
validation, storage, the prompt pack or the model. A background submission
reports the pause through its own job record. Sign-in, signed sessions, CSRF,
revocation, the private pack, `public/` publishing and job status are all
unchanged. This is the stop lever during an incident.

## What reaches the browser, and what reaches the logs

- **Article HTML** passes a server-side allowlist sanitiser; a normal article is
  unchanged byte for byte. The preview also sanitises.
- **Errors** are classified codes and safe messages; provider messages, which can
  quote the prompt, are never forwarded.
- **Logs** are allowlisted: event names, job ids, the opaque session id, the
  prompt version, counts, durations, safe codes. Never a password, session
  string, CSRF value, secret, API key, client address, prompt text, article text,
  product names or user fields.

## Static site

Only `public/` is published (`index.html`, `app/*.js`, `data/*.js`); the build
refuses server code or source maps there. `netlify.toml` sets
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer` and a same-origin Content-Security-Policy.

## Netlify settings

Site configuration > Environment variables. Values are placeholders; never paste
a real secret into a ticket, chat or document.

| Name | Contexts | Value | Notes |
| --- | --- | --- | --- |
| `SITE_PASSWORD` | all | `<team password>` | existing |
| `SESSION_SECRET` | all, **different outside production** | `<48 random bytes, base64url>` | at least 32 characters |
| `ANTHROPIC_API_KEY` | all | `<key>` | existing |
| `PROMPT_PACK_PUBLIC_KEY` | all | `<from tools/pack.js keygen>` | public half of the pack signing key |
| `PROMPT_PACK_CHANNEL` | previews, branch deploys | `preview` | required there; leave unset in production |
| `SESSION_EPOCH` | optional | `1` | raise to end every session |
| `SESSION_TTL_MS` | optional | `43200000` | session lifetime |
| `GENERATION_PAUSED` | optional | `true` | maintenance pause |
| limit variables | optional | see above | |

The Lambda-compatible functions share a 4KB environment; everything above is
short. **Never in Netlify:** the pack signing private key, `NETLIFY_SITE_ID` and
`NETLIFY_AUTH_TOKEN`. Those live only with the operator.

Blobs stores: `article-jobs`, `prompt-packs`, `app-counters`,
`session-revocations`. All are private to the site (no public URLs), and all are
shared across deploy contexts.

## Intentionally public

- **Application code**, including the session, routing, signing-verification and
  job-ownership code. None of it depends on being secret.
- **Public storefront material**: the blog index, catalogs, collection allowlist,
  and the succulentsbox.com links the care guide may cite.
- **A high-level description of the editorial rules** in the README.
- **Template names** in `lib/prompt-pack.js` and the synthetic pack (structure,
  not content).
- **One-way fingerprints** (`tests/fixtures/editorial-fingerprints.json`): 145
  SHA-256 digests of 40-character windows, to catch a copy of the content
  creeping back in. Not reversible; they only let someone who already holds a
  copy confirm a match.
- **The pack signing public key**, if published: by design it can only verify.

Moving code into a Netlify Function does **not** hide it from GitHub readers.

## Remaining risks

- **Deploy credentials** can read the private pack and delete revocations,
  counters and job records (above). Mitigation is controlling who can cause a
  deploy.
- **Conditional-create atomicity** is assumed from Netlify's documentation until
  `tools/check-claim-race.js` passes on a real deploy preview. It uses the
  supported `onlyIfNew` API of `@netlify/blobs` 10.7.13, plus a guard for the
  library's habit of reporting failed conditional writes as successful; re-check
  that guard if the package is ever upgraded.
- **Revocation** takes up to about 60 seconds to reach every edge location.
- **Usage limits** are best-effort; only the Anthropic spend limit is a hard cap.
- **Shared login**: no per-person audit trail or per-person revocation of the
  password itself.
- **Existing copies of the prompts** from the public history and the live site
  cannot be recalled (`docs/HISTORY-CLEANUP.md`).
- **`'unsafe-inline'` in the CSP**, because of inline `onclick` handlers.
- **Storefront descriptions are untrusted input** to the model; they are reduced
  to plain text, labelled, and the output is sanitised.
