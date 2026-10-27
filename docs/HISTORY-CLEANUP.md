# Git history cleanup plan

**Not executed. Do not run any of this without the repository owner's explicit
approval.** It rewrites published history, and once pushed it cannot be undone
except from the backup mirror.

## What it can and cannot do

Moving the instructions to the private pack stops them being published from now
on. It does nothing about the copies already published, and neither does this
plan, fully:

- **It cannot recall existing copies.** The instructions have been public in
  this repository since May 2026, and the live site served the prompt files from
  its root until this change. Anyone who cloned, forked, downloaded, scraped or
  archived the repository or the site in that time keeps their copy. Search
  engines, the Wayback Machine and code-search services may hold copies too. No
  rewrite reaches any of those.
- **What it does** is remove the instructions from this repository's history, so
  they are no longer one `git log` away for everyone who visits from now on.

Given that, treat the published instructions as known to anyone who looked, and
decide whether the cleanup is still worth the disruption. It usually is, because
it ends easy, ongoing access.

## Where the instructions are in history

28 commits across `main`, `multi-format-generator` and `care-guide-background`.
Prompt text appears in seven paths:

| Path | Versions in history | Period |
| --- | --- | --- |
| `index.html` (prompts built in the browser) | 9 | May 2026 to September 2026 |
| `netlify/functions/lib/shared-rules.js` | 19 | from September 2026 |
| `netlify/functions/lib/prompt-care-guide.js` | 19 | from September 2026 |
| `netlify/functions/lib/prompt-general-gift-guide.js` | 9 | from September 2026 |
| `netlify/functions/lib/prompt-occasion-gift-guide.js` | 9 | from September 2026 |
| `netlify/functions/lib/prompt-single-plant-gift.js` | 9 | from September 2026 |
| `netlify/functions/lib/prompt-metadata-related.js` | 3 | from September 2026 |

And quoted, in part, by six test suites now moved private:
`tests/prompts.test.js`, `tests/prompt-voice.test.js`, `tests/corrections.test.js`,
`tests/care-guide-background.test.js`, `tests/gift-voice-regressions.test.js`,
`tests/storefront-and-copy.test.js`.

Pull requests keep their own references (`refs/pull/<n>/head`) on GitHub, which
the owner cannot delete or rewrite.

## Option A, recommended: start the public history fresh

The simplest complete cleanup. The public repository gets a single new root
commit containing the current, clean tree. The full old history is kept in the
private backup mirror.

1. Make the backup mirror (`docs/ROLLOUT.md`, step 1) and check it opens.
2. Confirm the clean tree really is clean: `node tests/prompt-pack.test.js`
   includes a fingerprint scan of every tracked file.
3. Build the new root commit from the merged, clean `main`:
   ```
   git checkout --orphan fresh main
   git commit -m "Succulents Box Blog Generator"
   ```
4. Scan the new history once more:
   ```
   git log --all --oneline        # one commit
   node tests/prompt-pack.test.js  # fingerprint scan passes
   ```
5. With approval, replace the remote:
   ```
   git push --force origin fresh:main
   git push origin --delete multi-format-generator care-guide-background
   ```
6. On GitHub, close or delete any open pull requests, then ask GitHub Support
   to remove cached views and the `refs/pull/*` references for this repository
   (they are the one copy the owner cannot remove). If that is refused or slow,
   the alternative is to delete the repository and recreate it under the same
   name from the fresh history; that drops the pull-request references, issues
   and stars along with it.
7. Everyone with a clone deletes it and clones again. An old clone pushed back
   would restore the old history.

Cost: old commits, blame and pull-request discussion are gone from the public
repository (they remain in the private mirror).

## Option B: rewrite history and keep it

Keeps every commit, with the instructions taken out. More work and easier to get
wrong: the old prompt modules were the working code of those commits, so the
rewritten commits will no longer run.

Using [git-filter-repo](https://github.com/newren/git-filter-repo), on a fresh
mirror clone, never on a working checkout:

```
git clone --mirror <repo> rewrite.git && cd rewrite.git
git filter-repo --invert-paths \
  --path netlify/functions/lib/shared-rules.js \
  --path netlify/functions/lib/prompt-care-guide.js \
  --path netlify/functions/lib/prompt-general-gift-guide.js \
  --path netlify/functions/lib/prompt-occasion-gift-guide.js \
  --path netlify/functions/lib/prompt-single-plant-gift.js \
  --path netlify/functions/lib/prompt-metadata-related.js \
  --path tests/prompts.test.js --path tests/prompt-voice.test.js \
  --path tests/corrections.test.js --path tests/care-guide-background.test.js \
  --path tests/gift-voice-regressions.test.js --path tests/storefront-and-copy.test.js
```

This removes those files from **every** commit, including the current pack-based
versions of the six prompt modules. Re-add the current versions in one new commit
on top before pushing.

`index.html` cannot be removed (it is the application). Its early versions need
their prompt text replaced, using `--replace-text` with an expressions file
written from those versions, or a `--blob-callback`. Check every historical
version of `index.html` afterwards:

```
for c in $(git rev-list --all); do git show $c:index.html 2>/dev/null | grep -c "plant care expert"; done | sort | uniq -c
```

Then the fingerprint scan over every blob in the rewritten history, and steps 5
to 7 of Option A.

## After either option

- Re-run `tools/pack-parity.js` with `--baseline private/baseline-20043bc`
  (the archive made in the rollout backup), since `--ref 20043bc` will no longer
  resolve.
- Rotate anything that was ever committed in the clear. A scan of the whole
  history (all 195 blobs, every branch) found no API key, access token, private
  key or real password; the test suites used obviously synthetic values. So no credential rotation is required by the
  history itself. `SITE_PASSWORD` should still be changed, separately, because
  the old sign-in sent it in every request body, where any browser extension,
  proxy log or saved request could have captured it.
