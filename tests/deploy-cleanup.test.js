// The read-only deploy classifier used in rollout step 7. Runs against a small
// synthetic Git repository built in a temporary folder (so the test does not
// depend on this checkout's history) and a fake Netlify API; nothing touches the
// network.
// Run: node tests/deploy-cleanup.test.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../tools/list-obsolete-deploys');

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-cleanup-'));
const sh = (...args) => execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
sh('init', '-q');
sh('config', 'user.email', 'test@example.com');
sh('config', 'user.name', 'Synthetic');
const commit = msg => { fs.writeFileSync(path.join(repo, 'f.txt'), msg); sh('add', 'f.txt'); sh('commit', '-q', '-m', msg); return sh('rev-parse', 'HEAD'); };
const OLD_PROD = commit('old production');
const PRE_REVIEW = commit('before the review fixes');
const PRE_ONLYIFNEW = commit('before the onlyIfNew upgrade');
const FIX = commit('the security fix');
sh('checkout', '-q', '-b', 'old-branch', OLD_PROD);
const OLD_BRANCH = commit('old branch work');
// The classifier's git calls, pointed at the synthetic repository.
const git = (cmd, args, opts) => execFileSync(cmd, args, { ...opts, cwd: repo });

let failures = 0;
const ok = (n, c, x) => { if (c) console.log('PASS ' + n); else { failures++; console.log('FAIL ' + n + (x !== undefined ? ' :: ' + x : '')); } };

const deploys = [
  { id: 'new-prod', context: 'production', branch: 'main', commit_ref: FIX, created_at: '2026-10-24', state: 'ready' },
  { id: 'pre-review', context: 'deploy-preview', branch: 'security-hardening', commit_ref: PRE_REVIEW, created_at: '2026-10-23', state: 'ready' },
  { id: 'pre-onlyifnew', context: 'deploy-preview', branch: 'security-hardening', commit_ref: PRE_ONLYIFNEW, created_at: '2026-10-23', state: 'ready' },
  { id: 'old-prod', context: 'production', branch: 'main', commit_ref: OLD_PROD, created_at: '2026-10-14', state: 'ready' },
  { id: 'old-branch', context: 'branch-deploy', branch: 'multi-format-generator', commit_ref: OLD_BRANCH, created_at: '2026-10-01', state: 'ready' },
  { id: 'foreign', context: 'deploy-preview', branch: 'x', commit_ref: 'f'.repeat(40), created_at: '2026-10-02', state: 'ready' },
  { id: 'manual', context: 'production', branch: null, commit_ref: null, created_at: '2026-09-01', state: 'ready' }
];
const requests = [];
const fakeFetch = async (url, opts) => {
  requests.push({ url, method: (opts && opts.method) || 'GET', auth: opts && opts.headers && opts.headers.Authorization });
  const body = /\/deploys\?/.test(url) ? deploys : { published_deploy: { id: 'new-prod' } };
  return { ok: true, json: async () => body };
};

(async () => {
  const { publishedId, rows } = await run({ siteId: 'site', token: 'synthetic-token', fix: FIX, fetchImpl: fakeFetch, git });
  const v = id => rows.find(r => r.id === id).verdict;
  ok('the published deploy is reported', publishedId === 'new-prod');
  ok('the published production deploy is kept', v('new-prod') === 'KEEP (published)');
  ok('an old production deploy without the fix is obsolete', v('old-prod') === 'OBSOLETE');
  ok('a deploy from before the review fixes is obsolete, never a rollback target', v('pre-review') === 'OBSOLETE');
  ok('a deploy from before the onlyIfNew upgrade is obsolete', v('pre-onlyifnew') === 'OBSOLETE');
  ok('an old branch deploy without the fix is obsolete', v('old-branch') === 'OBSOLETE');
  ok('a deploy from a commit not in this checkout is never guessed', v('foreign').startsWith('UNKNOWN'));
  ok('a deploy with no commit (manual upload) is checked by hand', v('manual').startsWith('UNKNOWN'));
  ok('the tool only reads: every request is a GET', requests.every(r => r.method === 'GET'));
  ok('the token is sent as a bearer header, not in the URL', requests.every(r => r.auth === 'Bearer synthetic-token' && !r.url.includes('synthetic-token')));
  fs.rmSync(repo, { recursive: true, force: true });
  console.log(`\n${failures} failures`);
  if (failures) process.exitCode = 1;
})();
