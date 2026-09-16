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
    process.env.SITE_PASSWORD = 'smoke-test-password';
    const handler = require(path.join(STAGE, 'generate.js')).handler;
    if (typeof handler !== 'function') throw new Error('handler was not exported');
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ token: 'wrong' }) });
    if (response.statusCode !== 401) throw new Error('expected 401, got ' + response.statusCode);
    if (/node_modules|\.js:\d+:\d+/.test(response.body)) throw new Error('response leaked a stack trace');
    console.log('PASS packaged generate function initializes and rejects a bad token safely');
  } finally {
    fs.rmSync(STAGE, { recursive: true, force: true });
  }
})().catch(err => { console.error('FAIL', err.message); process.exit(1); });
