// The prompt pack the test suites use.
//
// By default this is tests/fixtures/synthetic-prompt-pack.json, which holds
// template names and placeholders and no editorial content. Setting
// SB_PROMPT_PACK to the path of a real pack file makes the same suites run
// against the real instructions instead; that is how the private editorial
// regression suites are run (docs/PROMPT-PACK.md). The real file is never
// committed.

const fs = require('fs');
const path = require('path');
const promptPack = require('../../netlify/functions/lib/prompt-pack');
const { generateKeyPair, signPointer } = require('../../netlify/functions/lib/pack-signature');
const { setDeployContextForTests } = require('../../netlify/functions/lib/deploy-context');

// A throwaway signing key, made fresh for every test run and never written
// anywhere. Its public half is what the functions verify pointers against.
const TEST_KEYS = generateKeyPair();
process.env.PROMPT_PACK_PUBLIC_KEY = TEST_KEYS.publicKeyBase64;
const signForTests = pointer => signPointer(TEST_KEYS.privateKeyPem, pointer);

// Handler tests run as a production deploy unless a test says otherwise.
setDeployContextForTests('production');

const SYNTHETIC = path.join(__dirname, '..', 'fixtures', 'synthetic-prompt-pack.json');

function packFile() {
  return process.env.SB_PROMPT_PACK || SYNTHETIC;
}

function loadPackJson() {
  return JSON.parse(fs.readFileSync(packFile(), 'utf8'));
}

// A handle for calling builders directly.
function testPack() {
  const pack = loadPackJson();
  return promptPack.packHandle(pack, process.env.SB_PROMPT_PACK ? 'private' : 'synthetic', promptPack.hashPack(pack));
}

// Installs the pack in the in-memory prompt store, for handler tests that go
// through loadActivePack() exactly as production does.
function installTestPack(version) {
  return promptPack.usePackForTests(loadPackJson(), { version: version || 'test-pack', sign: signForTests });
}

module.exports = { testPack, installTestPack, loadPackJson, packFile, signForTests, TEST_KEYS, SYNTHETIC };
