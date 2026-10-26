// Rebuild the NFT-style file layout, load the function, and prove initialization
// reaches the handler before any Anthropic call.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const STAGE = path.join(ROOT, '.tmp-packaged');
const files = [
  'netlify/functions/generate.js',
  ...fs.readdirSync(path.join(ROOT, 'netlify/functions/lib')).map(f => 'netlify/functions/lib/' + f),
  'data/articles.js', 'data/catalog.js'
];
fs.rmSync(STAGE, { recursive: true, force: true });
for (const rel of files) {
  const dest = path.join(STAGE, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, rel), dest);
}
fs.writeFileSync(path.join(STAGE, 'generate.js'), "module.exports = require('./netlify/functions/generate.js')");
(async () => {
  try {
    process.env.SITE_PASSWORD = 'synthetic-smoke-test-password';
    process.env.SESSION_SECRET = 'synthetic-smoke-test-session-secret-0123456789';
    const handler = require(path.join(STAGE, 'generate.js')).handler;
    if (typeof handler !== 'function') throw new Error('handler was not exported');
    // The old shared-password "token" is no longer accepted in any form.
    const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ token: process.env.SITE_PASSWORD }) });
    if (response.statusCode !== 401) throw new Error('expected 401, got ' + response.statusCode);
    if (/node_modules|\.js:\d+:\d+/.test(response.body)) throw new Error('response leaked a stack trace');
    // Missing security configuration denies access rather than letting anyone in.
    delete process.env.SESSION_SECRET;
    const unconfigured = await handler({ httpMethod: 'POST', headers: {}, body: '{}' });
    if (unconfigured.statusCode !== 503) throw new Error('expected 503 without SESSION_SECRET, got ' + unconfigured.statusCode);
    console.log('PASS packaged generate function initializes, refuses the old password token, and fails closed without configuration');
  } finally {
    fs.rmSync(STAGE, { recursive: true, force: true });
  }
})().catch(err => { console.error('FAIL', err.message); process.exit(1); });
