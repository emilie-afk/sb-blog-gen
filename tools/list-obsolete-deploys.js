#!/usr/bin/env node
// PRIVATE TOOL, READ ONLY. Lists this site's Netlify deploys and marks which are
// obsolete: built from code that predates the security fix, and therefore still
// serving the old prompt modules and running the old sign-in at their
// permalinks. It never deletes anything; it prints the list for a person to act
// on (docs/ROLLOUT.md, step 7).
//
//   NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node tools/list-obsolete-deploys.js [--fix <commit>]
//
// A deploy is KEPT when it is the currently published production deploy, or when
// its commit already contains the fix commit (checked with git in this
// checkout). Everything else is OBSOLETE. A deploy whose commit is not in this
// checkout is reported as UNKNOWN so a person checks it by hand; it is never
// guessed into either list.

const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// The first commit with every security fix from review: signed sessions, the
// private signed prompt pack, public/ publishing, atomic job ownership,
// server-side sign-out, fail-closed routing, and job ownership through the
// supported @netlify/blobs onlyIfNew API. Deploys older than this are either
// exposed or missing a review fix, and are never a rollback target.
const DEFAULT_FIX = '05a826b';
const API = 'https://api.netlify.com/api/v1';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function containsFix(commit, fix, git) {
  if (!commit) return null;
  try {
    (git || execFileSync)('git', ['merge-base', '--is-ancestor', fix, commit], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch (err) {
    // Exit status 1 means "not an ancestor"; anything else means the commit is
    // not in this checkout, which is reported as unknown.
    return err && err.status === 1 ? false : null;
  }
}

function classify(deploys, publishedId, fix, git) {
  return deploys.map(d => {
    const fixed = containsFix(d.commit_ref, fix, git);
    let verdict;
    if (d.id === publishedId) verdict = 'KEEP (published)';
    else if (fixed === true) verdict = 'KEEP (contains fix)';
    else if (fixed === false) verdict = 'OBSOLETE';
    else verdict = 'UNKNOWN (check by hand)';
    return {
      id: d.id, verdict, context: d.context, branch: d.branch,
      commit: d.commit_ref ? d.commit_ref.slice(0, 7) : '-',
      created: d.created_at, state: d.state,
      permalink: d.deploy_ssl_url || d.deploy_url || ''
    };
  });
}

async function fetchJson(url, token, fetchImpl) {
  const res = await (fetchImpl || fetch)(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Netlify API ${res.status} for ${url.replace(API, '')}`);
  return res.json();
}

async function run({ siteId, token, fix, fetchImpl, git }) {
  const site = await fetchJson(`${API}/sites/${siteId}`, token, fetchImpl);
  const publishedId = site.published_deploy && site.published_deploy.id;
  const deploys = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await fetchJson(`${API}/sites/${siteId}/deploys?per_page=100&page=${page}`, token, fetchImpl);
    deploys.push(...batch);
    if (batch.length < 100) break;
  }
  return { publishedId, rows: classify(deploys, publishedId, fix, git) };
}

if (require.main === module) {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteId || !token) {
    console.error('Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN in this shell.');
    process.exit(2);
  }
  run({ siteId, token, fix: arg('--fix') || DEFAULT_FIX }).then(({ publishedId, rows }) => {
    console.log(`published deploy: ${publishedId}`);
    for (const r of rows) console.log([r.verdict.padEnd(24), r.id, r.context, r.branch, r.commit, r.created, r.permalink].join('  '));
    const obsolete = rows.filter(r => r.verdict === 'OBSOLETE');
    console.log(`\n${obsolete.length} obsolete, ${rows.filter(r => r.verdict.startsWith('UNKNOWN')).length} to check by hand, ${rows.length} total.`);
    console.log('Nothing was deleted. See docs/ROLLOUT.md, step 7.');
  }, err => { console.error('list-obsolete-deploys: ' + err.message); process.exit(1); });
}

module.exports = { classify, containsFix, run, DEFAULT_FIX };
