#!/usr/bin/env node
// PRIVATE TOOL. Checks, against a REAL deploy (use a deploy preview), that the
// Netlify Blobs service lets exactly one of many simultaneous submissions of
// one job id win. The local suites prove this code sends a conditional create
// and handles both answers; only the real service can prove it decides them
// atomically.
//
//   node tools/check-claim-race.js https://deploy-preview-N--sb-blog-gen.netlify.app [--submissions 12]
//
// It reads the site password from standard input (so it stays out of shell
// history and process lists), signs in TWICE to get two separate sessions,
// fires the submissions at once (alternating sessions, one shared job id),
// then polls the job as both sessions.
//
// PASS means: exactly one session ever sees the job, the other only ever sees
// "no longer available", and the function log shows ONE generation_started
// line for the job id printed below (check it in Logs > Functions).
//
// COST: one real generation (one short general gift guide).

const SITE = process.argv[2];
const N = Number((process.argv.indexOf('--submissions') > 0 && process.argv[process.argv.indexOf('--submissions') + 1]) || 12);

function fail(msg) { console.error('check-claim-race: ' + msg); process.exit(2); }

async function readPassword() {
  if (process.stdin.isTTY) process.stderr.write('Site password (input hidden is not supported here; pipe it in): ');
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, '');
}

async function signIn(password) {
  const res = await fetch(`${SITE}/.netlify/functions/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
  });
  const body = await res.json().catch(() => ({}));
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const cookie = (setCookie || []).map(c => String(c || '').split(';')[0]).find(c => c.startsWith('sb_session='));
  if (!res.ok || !cookie || !body.csrfToken) fail(`sign-in failed (HTTP ${res.status}).`);
  return { cookie, csrf: body.csrfToken };
}

const post = (fn, s, payload) => fetch(`${SITE}/.netlify/functions/${fn}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie: s.cookie, 'X-CSRF-Token': s.csrf },
  body: JSON.stringify(payload)
});

async function main() {
  if (!SITE || !(/^https:\/\//.test(SITE) || /^http:\/\/localhost(:\d+)?$/.test(SITE))) fail('pass the deploy URL, for example https://deploy-preview-3--sb-blog-gen.netlify.app');
  const password = await readPassword();
  if (!password) fail('no password on standard input.');
  const a = await signIn(password);
  const b = await signIn(password);
  const rand = () => Math.random().toString(36).slice(2, 10);
  const jobId = 'job_' + Date.now().toString(36) + '_' + rand() + rand();
  const fields = {
    recipient: 'Synthetic race check', numberOfRecommendations: 1,
    selectedProducts: [{ title: 'Race Check Item', url: 'https://example.com/products/race-check', source: 'manual' }]
  };

  console.log(`job id: ${jobId}`);
  console.log(`submitting ${N} times at once, alternating two sessions...`);
  const statuses = await Promise.all(Array.from({ length: N }, (_, i) =>
    post('generate-background', i % 2 ? b : a, { jobId, articleType: 'general_gift_guide', fields }).then(r => r.status)));
  console.log(`submission HTTP statuses: ${statuses.join(' ')}`);

  const seen = { a: new Set(), b: new Set() };
  const deadline = Date.now() + 5 * 60 * 1000;
  let done = false;
  while (Date.now() < deadline && !done) {
    await new Promise(r => setTimeout(r, 3000));
    for (const [name, s] of [['a', a], ['b', b]]) {
      const res = await post('generate-status', s, { jobId });
      const body = await res.json().catch(() => ({}));
      seen[name].add(body.status + (body.starting ? '(starting)' : ''));
      if (body.status === 'complete' || body.status === 'failed') done = true;
    }
  }
  const owners = ['a', 'b'].filter(n => [...seen[n]].some(st => st === 'pending' || st === 'complete' || st === 'failed'));
  console.log(`session A saw: ${[...seen.a].join(', ')}`);
  console.log(`session B saw: ${[...seen.b].join(', ')}`);
  if (owners.length === 1 && done) {
    console.log(`PASS: only session ${owners[0].toUpperCase()} owns the job. Now confirm ONE generation_started line for ${jobId} in the function log.`);
  } else {
    console.log('FAIL: ownership was not exclusive, or the job did not finish. Do not roll out; see docs/SECURITY.md, "Job ownership".');
    process.exitCode = 1;
  }
  // Sign both sessions out, which also revokes them server-side.
  await Promise.all([a, b].map(s => post('auth', s, { action: 'logout' })));
}

main().catch(err => fail(err.message));
