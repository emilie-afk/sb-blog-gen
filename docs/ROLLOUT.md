# Rollout, verification and rollback

Nothing in this document has been done yet. Every step needs the site owner.

Base commit: `20043bc` (main, "Merge pull request #2"). The change is on the
`security-hardening` branch. The first commit carrying every review fix,
including job ownership through the supported `@netlify/blobs` `onlyIfNew` API,
is `05a826b`.

**Order matters.** The new code refuses to sign anyone in without
`SESSION_SECRET`, and refuses to generate without a **signed** prompt-pack
pointer for its deploy context. All of that is prepared before the code is
deployed. The current production code ignores it, so preparing it changes
nothing live.

| Step | What | Live effect |
| --- | --- | --- |
| 0 | Restrict who can cause a deploy; back up | none |
| 1 | Make the pack signing key; set environment variables | none |
| 2 | Import the pack, sign and activate it for previews and production | none |
| 3 | How the deploy contexts are isolated (reference) | none |
| 4 | Deploy preview: ownership race, result scope, replay after sign-out, channel refusals | none (4d briefly changes the preview's channel) |
| 5 | Deploy production | the change goes live |
| 6 | Verify sessions, CSRF, sign-out revocation and throttling | none |
| 7 | Verify nothing private is served | none |
| 8 | Identify and delete obsolete deploys | removes old exposed copies |

You need: Node 22, a checkout of `security-hardening`, the private archive
(`PRIVATE — DO NOT COMMIT`), and, **in your own shell only, never in Netlify**:

```
export NETLIFY_SITE_ID=<the site's API ID, Site configuration > General>
export NETLIFY_AUTH_TOKEN=<a personal access token, User settings > Applications>
```

## 0. Restrict who can cause a deploy, then back up

**Do this before the private pack goes anywhere near Netlify.** Every deploy of
this site, previews and branch deploys included, runs with Blobs credentials
that can read every store, including the private pack. A preview runs the code
of whatever branch or pull request it was built from. So:

1. Site configuration > Build & deploy > Continuous deployment > Deploy
   Previews: turn previews off for pull requests from forks, or, under
   Environment variables > Sensitive variable policy, require approval before
   such builds run. **Confirm** in the UI that an outside pull request would not
   build.
2. On GitHub, limit who can push branches to the repository.
3. If outside contributions ever need previews, build them on a separate
   Netlify site with its own Blobs and no production data, and turn previews
   off on this one.

Then back up:

1. Copy `prompt-pack.v1.json` from the private archive to two private places.
2. Keep the old prompt modules for later parity checks:
   `git archive 20043bc netlify/functions/lib > ../baseline-20043bc.tar`
   (also included in the private archive).
3. Mirror the repository as it is today, privately:
   `git clone --mirror https://github.com/emilie-afk/sb-blog-gen.git sb-blog-gen-backup.git`
4. Job records are transient and need no backup.

## 1. Signing key and environment variables

**Make the pack signing key once**, on the operator's machine:

```
node tools/pack.js keygen --out ~/sb-pack-signing-key.pem
#   wrote the private signing key to ~/sb-pack-signing-key.pem (mode 600). Keep it private.
#   Set this in Netlify for every deploy context, as PROMPT_PACK_PUBLIC_KEY:
#   <60-character public key>
```

Store the private key file in the team's password manager or another
access-controlled place. **Never** put it in the repository, in Netlify, or in a
shared drive. Anyone holding it can activate a prompt pack.

**Environment variables:** Site configuration > Environment variables, using
"Different value for each deploy context" where the table says so. Values here
are placeholders. Never paste a real secret into a ticket, chat or document.

| Variable | Production | Deploy previews | Branch deploys | Notes |
| --- | --- | --- | --- | --- |
| `SITE_PASSWORD` | existing | existing, or a separate preview password | as previews | compared on the server only |
| `SESSION_SECRET` | `<secret A>` | `<secret B>` | `<secret B>` | **new.** At least 32 characters; different outside production |
| `ANTHROPIC_API_KEY` | existing | existing | existing | unchanged |
| `PROMPT_PACK_PUBLIC_KEY` | `<public key>` | `<public key>` | `<public key>` | **new.** From `keygen` above |
| `PROMPT_PACK_CHANNEL` | *leave unset* | `preview` | `preview` | **new.** Required outside production; never `production` there |
| `SESSION_EPOCH` | optional, `1` | optional | optional | raise to end every session |
| `GENERATION_PAUSED` | leave unset | leave unset | leave unset | `true` pauses generation (see Rollback) |
| limit variables | optional | optional | optional | defaults in `docs/SECURITY.md` |

Generate each session secret separately:
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

**Set a spending limit on the Anthropic account** (Anthropic Console,
organisation or workspace limits). The app's own usage limits are best-effort;
this is the hard cap.

Environment changes reach functions on the next deploy. The Lambda-compatible
functions share a 4KB environment; everything above is short.

## 2. Import the pack, sign and activate it

From the checkout, with the private archive unpacked to `private/` (ignored by
Git):

```
# Prove the pack reproduces the current prompts byte for byte.
node tools/pack-parity.js --pack private/prompt-pack.v1.json --ref 20043bc
#   282 prompts compared across 141 briefs, 0 mismatches.
#   pack hash sha256:db46a3b236d9883acc709576163143a27547c897d02aa2e1328767bbb794d24e

# The editorial regression suites, against the real pack.
SB_PROMPT_PACK=private/prompt-pack.v1.json bash private/editorial-tests/run.sh

# Completeness and a dry run of every format.
node tools/pack.js validate private/prompt-pack.v1.json

# Store it. This activates nothing.
node tools/pack.js import private/prompt-pack.v1.json --version 2026-10-23.1

# Sign and activate: previews first, production when you are ready.
# Each command names its channel and its key; there are no defaults.
node tools/pack.js activate 2026-10-23.1 --channel preview    --key ~/sb-pack-signing-key.pem
node tools/pack.js activate 2026-10-23.1 --channel production --key ~/sb-pack-signing-key.pem

node tools/pack.js list
#   active on production: 2026-10-23.1
#   active on preview: 2026-10-23.1
```

Allow about two minutes for a pointer to propagate before relying on it.

## 3. How production, previews and branch deploys are isolated

Reference; nothing to do here beyond steps 0 to 2.

- **Trusted context.** Functions are not told their deploy context at runtime.
  The build stamps Netlify's reserved, read-only `CONTEXT` into the function
  bundle (`deploy-context.json`), and the functions read that.
- **Fail-closed routing.** Production reads only production's pointer.
  Previews, branch deploys and local dev must name a valid channel that is not
  `production`; unset, invalid or `production` refuses generation. An unknown or
  missing stamp refuses. Refusals happen before any model call.
- **Signed pointers.** A pointer counts only if signed by the operator key. The
  channel and the pack's content hash are inside the signature, so a deploy
  cannot activate a pack, copy a preview pointer into production's key, or swap
  the pack under a valid pointer, even though its Blobs credentials can write
  the store.
- **What the credentials can still do.** A deploy can read the private pack and
  delete revocations, counters and job records. That is why step 0 restricts
  who can cause a deploy. See `docs/SECURITY.md`.
- **Sessions.** A cookie belongs to its host, so a preview session is never sent
  to production, and the separate `SESSION_SECRET` makes it invalid there
  anyway.
- **Jobs.** Shared store, but every job belongs to the session that won it, and
  the two contexts never share a session.
- **Usage limits** are shared on purpose: previews spend real API credit.

## 4. Check a deploy preview first

Push the branch and open a pull request so Netlify builds a deploy preview. The
preview must have `PROMPT_PACK_CHANNEL=preview` (step 1) and a signed `preview`
pointer (step 2). Run steps 6 and 7 against the preview URL, then the four
checks below. **All four must pass before step 5.** Each one proves on the real
platform what the local suites can only prove against a stand-in.

Record the results (date, preview URL, job id, PASS or the output) in the pull
request.

### 4a. Simultaneous submissions start exactly one generation

`@netlify/blobs` 10.7.13 sends `onlyIfNew` as `If-None-Match: *`; this proves the
Blobs service decides it atomically. Cost: one short generation.

```
printf '%s' "<the preview's SITE_PASSWORD>" | \
  node tools/check-claim-race.js https://deploy-preview-<N>--sb-blog-gen.netlify.app --submissions 12
#   job id: job_...
#   submission HTTP statuses: 202 202 ...
#   session A saw: pending, complete   (or B)
#   session B saw: expired
#   PASS: only session A owns the job. Now confirm ONE generation_started line for job_... in the function log.
```

Pipe the password in rather than typing it on the command line. Then open
**Logs > Functions > generate-background** for the preview, search for the job
id, and confirm:
- exactly **one** `{"event":"generation_started",...}` line for it, and
- the other submissions logged `duplicate_submission`, not `generation_started`.

Two or more `generation_started` lines for one job id is a **FAIL**: stop, do
not deploy, and report it. There is no further storage fallback to switch to;
ownership would need a different store.

### 4b. Only the winning session can read the result

The same run checks this: `tools/check-claim-race.js` polls the job as **both**
sessions after it finishes. PASS requires the winning session to see `complete`
and the other session to see only `expired` (the answer for a job that does not
exist). Any article HTML returned to the second session is a **FAIL**.

### 4c. A captured cookie and CSRF value fail after sign-out, and stay failed

Run the terminal script in step 6 ("replaying a captured session after
sign-out") with `SITE` set to the preview URL, and change its last lines to
replay three times:

```
st -H "X-CSRF-Token: $CSRF"          # 401  immediately after sign-out
sleep 90
st -H "X-CSRF-Token: $CSRF"          # 401  after the ~60 s propagation window
sleep 240
st -H "X-CSRF-Token: $CSRF"          # 401  still revoked five minutes later
```

The sign-out response is written to a separate cookie jar, so every replay uses
the original captured cookie. Any **200** is a **FAIL**. A 200 on the first
replay that turns into 401 after 90 seconds is the documented propagation window,
but report it. A 200 after 90 seconds means revocation is not working on this
platform.

### 4d. A missing or production-valued preview channel refuses generation

This needs two temporary changes to the **Deploy Previews** value of
`PROMPT_PACK_CHANNEL` (Site configuration > Environment variables). Change only
the Deploy Previews value, never Production. An environment change applies only
to a new build, so after each change open the preview in **Deploys** and choose
**Retry deploy**. Neither refusal calls the model.

1. **Remove** the Deploy Previews value and rebuild the preview.
2. **Set it to `production`** and rebuild the preview.
3. **Set it back to `preview`** and rebuild the preview.

After steps 1 and 2, sign in to the preview, start a short gift guide, and
confirm the page shows *"The article instructions are not configured on the
server, so no article was generated."* From a terminal, with a session from the
step 6 script (`JAR`, `CSRF`):

```
curl -s -b "$JAR" -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  --data '{"articleType":"general_gift_guide","fields":{"recipient":"Channel check","numberOfRecommendations":1,"selectedProducts":[{"title":"Channel Check Item","url":"https://example.com/products/channel-check","source":"manual"}]}}' \
  "$SITE/.netlify/functions/generate"; echo
#   {"error":"The article instructions are not configured on the server, ...","code":"prompt_config"}   HTTP 503
```

In **Logs > Functions** confirm these lines, and confirm no `generation_started`
line:
- after step 1: `Prompt pack unavailable: prompt_pack_unavailable (Prompt-pack channel refused: deploy-preview has no PROMPT_PACK_CHANNEL)`
- after step 2: `Prompt pack unavailable: prompt_pack_unavailable (Prompt-pack channel refused: deploy-preview may not use the production channel)`

Any article generated after step 1 or step 2 is a **FAIL**. After step 3, one
short generation on the preview must succeed again before you move on.

## 5. Deploy to production

Pick a quiet moment and tell the team:
- A generation started before the deploy finishes on the old code. Its record
  has no scope, so for one hour the new status function still serves it to a
  signed-in session, then that allowance lapses.
- A tab opened before the deploy runs the old page, whose requests carry the
  password in the body and no cookie. The new functions refuse them, so the tab
  shows "Your session has expired". Reload and sign in again. Asking the team
  not to start a generation in the ten minutes before the deploy avoids losing a
  result this way.
- Everyone signs in once more; there are no old sessions to migrate.

Merge the pull request. Netlify builds with
`npm install && node tools/build-site.js`, which stamps the deploy context and
publishes `public/`.

## 6. Verify sessions, CSRF, sign-out revocation and throttling

### In a browser

- [ ] A wrong password is refused.
- [ ] The right password signs in. Developer tools > Application > Cookies:
      `sb_session` is **HttpOnly**, **Secure**, **SameSite Strict**, expiring
      about 12 hours out.
- [ ] The `auth` response body has `csrfToken`, no `token`, and not the password.
- [ ] A `generate-status` request carries `X-CSRF-Token` and no body `token`.
- [ ] Local Storage and Session Storage are empty; `document.cookie` does not
      include `sb_session`.
- [ ] Sign out returns to the sign-in screen and removes the cookie.
- [ ] Every format completes: care guide (an air plant and a succulent, and one
      running past 60 seconds), single-plant gift, general gift guide with five
      products, occasion gift guide ordinary and sensitive. Gift Products and
      Live Plants load. Preview and every copy button work.

### From a terminal: CSRF, and replaying a captured session after sign-out

The password is read without echoing and the JSON body is built from standard
input, so it stays out of shell history and process lists. The sign-out
response is written to a **separate** cookie jar, so the replay below uses the
original, captured cookie, exactly as a copied request would.

```
SITE=https://sb-blog-gen.netlify.app
read -rs -p "Site password: " PW; echo
JAR=$(mktemp); OUTJAR=$(mktemp)

CSRF=$(printf '%s' "$PW" | node -e 'let p="";process.stdin.on("data",c=>p+=c).on("end",()=>process.stdout.write(JSON.stringify({password:p})))' \
  | curl -s -c "$JAR" -H 'Content-Type: application/json' --data @- \
  "$SITE/.netlify/functions/auth" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.error("token field present:", "token" in j);console.log(j.csrfToken)})')
unset PW
grep -o 'HttpOnly' "$JAR" >/dev/null && echo "cookie is HttpOnly"

# A well-formed job id that belongs to nobody: an authorised caller gets 200
# ("expired"), so the status code shows only whether the session was accepted.
JOB="job_$(node -e 'process.stdout.write(Date.now().toString(36))')_statuscheck0001"
st() { curl -s -o /dev/null -w '%{http_code}\n' -b "$JAR" -H 'Content-Type: application/json' "$@" \
  --data "{\"jobId\":\"$JOB\"}" "$SITE/.netlify/functions/generate-status"; }
st -H "X-CSRF-Token: $CSRF"          # 200  session and CSRF value
st                                   # 403  no CSRF header
st -H "X-CSRF-Token: forged"         # 403  wrong CSRF value
curl -s -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' \
  --data '{}' "$SITE/.netlify/functions/generate-status"            # 401  no session

# Sign out. The response, including its cookie-clearing header, goes to OUTJAR;
# JAR keeps the captured cookie.
curl -s -b "$JAR" -c "$OUTJAR" -H 'Content-Type: application/json' --data '{"action":"logout"}' \
  "$SITE/.netlify/functions/auth"; echo                             # {"ok":true,"loggedOut":true,"revoked":true}

# Replay the captured cookie and CSRF value in fresh requests.
st -H "X-CSRF-Token: $CSRF"          # 401  revoked
sleep 90
st -H "X-CSRF-Token: $CSRF"          # 401  still revoked after the propagation window
rm -f "$JAR" "$OUTJAR"
```

Netlify spreads requests over function instances and edge locations, so the
first replay may land anywhere; revocation is guaranteed everywhere within about
60 seconds, which the second replay confirms.

### Throttling

This locks *your own* connection out of signing in for 15 minutes, so run it
last, from a connection you can spare (a phone hotspot):

```
for i in $(seq 1 11); do curl -s -o /dev/null -w '%{http_code} ' -H 'Content-Type: application/json' \
  --data '{"password":"definitely-wrong"}' "$SITE/.netlify/functions/auth"; done; echo
#   401 ×10, then 429
```

Under eventual consistency the 429 can arrive an attempt or two late; what
matters is that it arrives and persists. Then confirm the team, on other
connections, can still sign in.

### In the function log

Logs > Functions: `session_started`, `session_ended` (for the sign-out),
`generation_started` and `generation_completed` with `promptVersion:
2026-10-23.1`, and `login_failed` / `login_throttled` for the throttle test. No
line contains the password, a session string, a CSRF value, article text or
prompt text. There should be no `Prompt pack pointer refused` line.

## 7. Confirm source, tests and docs are no longer served

```
SITE=https://sb-blog-gen.netlify.app
for p in netlify/functions/lib/shared-rules.js netlify/functions/lib/prompt-care-guide.js \
         netlify/functions/lib/prompt-pack.js netlify/functions/lib/deploy-context.json \
         netlify/functions/auth.js netlify.toml README.md package.json package-lock.json \
         tests/run.sh tests/security.test.js tests/fixtures/editorial-fingerprints.json \
         tools/pack.js docs/SECURITY.md docs/ROLLOUT.md; do
  printf '%-48s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$SITE/$p")"
done
#   every line: 404

curl -sI "$SITE/" | grep -iE 'content-security-policy|x-frame-options|x-content-type-options|referrer-policy'
#   all four headers present
```

Then check the files that *are* published carry none of the instructions, using
the committed fingerprints:

```
mkdir -p /tmp/live && cd /tmp/live
for f in index.html app/formats.js app/main.js app/products.js app/ui.js \
         data/articles.js data/catalog.js data/gift-collections.js; do
  mkdir -p "$(dirname "$f")"; curl -s -o "$f" "$SITE/$f"; done
node -e '
const fs=require("fs"),c=require("crypto"),fp=require(process.argv[1]);
const d=new Set(fp.prints.map(p=>p.sha256)); let hit=0;
for (const f of process.argv.slice(2)) { const n=fs.readFileSync(f,"utf8").replace(/\s+/g," ");
  for (let i=0;i+40<=n.length;i++) if (d.has(c.createHash("sha256").update(n.slice(i,i+40)).digest("hex"))) { console.log("FOUND in",f); hit=1; break; } }
console.log(hit ? "LEAK" : "clean");' <checkout>/tests/fixtures/editorial-fingerprints.json $(find . -type f)
#   clean
```

Repeat both checks against the deploy preview URL.

## 8. Identify and delete obsolete deploys

Every past deploy stays reachable at its own permalink
(`https://<deploy-id>--sb-blog-gen.netlify.app/`) until Netlify's retention
removes it (30 days, or 90 on paid plans), and the latest deploy of each branch
is never removed automatically. Deploys built before this change **serve the
prompt modules from the site root and run the old sign-in**, which returns the
password as a token.

**Identify them** with the read-only helper:

```
node tools/list-obsolete-deploys.js
#   published deploy: <id>
#   KEEP (published)         <id>  production  main  <sha> ...
#   KEEP (contains fix)      <id>  deploy-preview ...
#   OBSOLETE                 <id>  production  main  20043bc ...
#   UNKNOWN (check by hand)  <id>  ...
```

It keeps the published production deploy and every deploy whose commit contains
`05a826b` (the first commit with every review fix), marks the rest obsolete, and
flags deploys whose commit is not in your checkout for a person to check. It
sends only GET requests and deletes nothing. After any history rewrite, pass the
new commit with `--fix <sha>`.

**Before deleting anything:**
1. Confirm the published deploy is the new one: open it, sign in, run step 7.
   Netlify will not let you delete the published deploy.
2. Lock auto-publishing while you work (Deploys > Lock to stop auto publishing).

**Delete** each `OBSOLETE` deploy: Deploys > open it > Options > Delete deploy
(permanent). Then open two or three deleted permalinks to confirm they no longer
load, delete the merged branches on GitHub (`multi-format-generator`,
`care-guide-background`), and unlock auto-publishing.

## Rollback and incident procedures that keep the security fixes

**Never** restore the prompts to public source, **never** restore the
password-token sign-in, and **never** use Publish deploy on a deploy that the
listing in step 8 marks `OBSOLETE`. Every procedure below keeps signed sessions,
the private signed prompt pack and `public/` publishing.

**To stop generation immediately (maintenance pause):**
1. Set `GENERATION_PAUSED=true` for production.
2. Deploys > Trigger deploy > Deploy site (same commit), so the functions see it.
3. Both generation endpoints now answer "paused for maintenance" before any
   model call. Sign-in, sessions, sign-out, job status and the site keep working.
4. To resume, remove the variable and trigger a deploy again.

**To go back to an earlier good version of the code:**
1. Run `node tools/list-obsolete-deploys.js`.
2. Lock auto-publishing.
3. Publish deploy on a deploy marked `KEEP (contains fix)`, never `OBSOLETE`.
4. Fix forward on a branch; unlock when the fix is published.

| Problem | Do this | Data |
| --- | --- | --- |
| Something is wrong and needs time | maintenance pause, above | unchanged |
| The instructions produce worse articles | `node tools/pack.js rollback --channel production --key <file>`, or `activate <version> --channel production --key <file>` | every pack version is kept |
| Generation says the instructions are not configured | `node tools/pack.js list`; activate a good version on that context's channel; check `PROMPT_PACK_PUBLIC_KEY` and, outside production, `PROMPT_PACK_CHANNEL` | unchanged |
| The log says `Prompt pack pointer refused ... bad_signature` | someone wrote a pointer without the operator key: re-activate with the key, then find out how a deploy reached the store (step 0) | unchanged |
| Nobody can sign in (503) | that context lacks `SESSION_SECRET`, or Blobs is unavailable; set the secret and redeploy, or wait for Blobs | unchanged |
| Everyone signed out unexpectedly | `SESSION_EPOCH` or `SESSION_SECRET` changed: restore it, redeploy | unchanged |
| The signing key may have leaked | `keygen` a new key; set the new `PROMPT_PACK_PUBLIC_KEY`; re-activate every channel with the new key; redeploy | old pointers stop verifying, by design |
| A code fault in this change | maintenance pause, then publish an earlier `KEEP (contains fix)` deploy or fix forward | stores, packs and job records are untouched by any deploy |

## Retention

| Data | Kept | Note |
| --- | --- | --- |
| Job records (`article-jobs`) | not deleted; readable only by the creating session, so effectively for that session's life (at most 12 hours) | |
| Counters (`app-counters`) | pruned as they age out of their window | |
| Revocations (`session-revocations`) | one small record per sign-out; needed only until that session's expiry | |
| Prompt packs (`prompt-packs`) | every version kept | rollback and traceability |

Proposed, not implemented: a scheduled function that deletes job records older
than seven days and revocations past their session's expiry.

## Still unverified, and only checkable in production

- **Atomic conditional create** on the real Blobs service (`@netlify/blobs`
  10.7.13 `onlyIfNew`): step 4a and 4b on a deploy preview.
- **Revocation propagation** across edge locations: step 4c, and the second
  replay in step 6.
- The `Secure` cookie, CSP and other headers as Netlify actually serves them.
- That the build stamps `CONTEXT` as documented: the function log shows no
  `Prompt-pack channel refused` line in production, and a preview without
  `PROMPT_PACK_CHANNEL`, or with it set to `production`, refuses to generate
  (step 4d).
- Netlify's 202 for background calls (the browser learns of an ended session
  from the status poll).
- Real `x-nf-client-connection-ip` values for the throttle.
- Writing quality: every automated check is structural.
