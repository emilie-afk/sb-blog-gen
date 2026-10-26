// The read-only deploy classifier used in rollout step 7. Uses this checkout's
// real Git history and a fake Netlify API; nothing touches the network.
// Run: node tests/deploy-cleanup.test.js
const { run, DEFAULT_FIX } = require('../tools/list-obsolete-deploys');

let failures = 0;
const ok = (n, c, x) => { if (c) console.log('PASS ' + n); else { failures++; console.log('FAIL ' + n + (x !== undefined ? ' :: ' + x : '')); } };

const deploys = [
  { id: 'new-prod', context: 'production', branch: 'main', commit_ref: DEFAULT_FIX, created_at: '2026-10-24', state: 'ready' },
  { id: 'pre-review', context: 'deploy-preview', branch: 'security-hardening', commit_ref: '6239995', created_at: '2026-10-23', state: 'ready' },
  { id: 'pre-onlyifnew', context: 'deploy-preview', branch: 'security-hardening', commit_ref: '901cd77', created_at: '2026-10-23', state: 'ready' },
  { id: 'old-prod', context: 'production', branch: 'main', commit_ref: '20043bc', created_at: '2026-10-14', state: 'ready' },
  { id: 'old-branch', context: 'branch-deploy', branch: 'multi-format-generator', commit_ref: '9b0e65c', created_at: '2026-10-01', state: 'ready' },
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
  const { publishedId, rows } = await run({ siteId: 'site', token: 'synthetic-token', fix: DEFAULT_FIX, fetchImpl: fakeFetch });
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
  console.log(`\n${failures} failures`);
  if (failures) process.exitCode = 1;
})();
