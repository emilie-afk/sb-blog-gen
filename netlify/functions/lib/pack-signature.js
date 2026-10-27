// Signed prompt-pack pointers.
//
// WHY. Netlify gives every deploy, previews and branch deploys included, Blobs
// credentials that can write the site's stores. The functions never write the
// pack store, but that is an application safeguard, not a permission: code
// running in a deploy could write a pointer of its own. So a pointer only counts
// when it carries a signature from the operator's private key, which never
// leaves the operator's machine and is never given to Netlify. The functions
// hold only the public key (PROMPT_PACK_PUBLIC_KEY). A deploy can write any
// bytes it likes into the store; it cannot produce a pointer the functions will
// accept.
//
// WHAT IS SIGNED. The channel, the version, the pack's content hash and the
// activation time, as one canonical string. Because the channel is inside the
// signature, a pointer signed for "preview" copied into production's key is
// refused, and because the hash is inside it, a pack whose content was swapped
// under a valid pointer is refused too.
//
// Ed25519, from Node's built-in crypto. The public key is the base64 of its
// DER (SPKI) encoding: 60 characters, well inside the 4KB function environment.

const crypto = require('crypto');

const DOMAIN = 'sb-prompt-pack-pointer:v1';

function message(pointer) {
  return [DOMAIN, pointer.channel, pointer.version, pointer.hash, pointer.activatedAt].join('\n');
}

function publicKeyFrom(base64) {
  if (!base64) return null;
  try {
    return crypto.createPublicKey({ key: Buffer.from(String(base64).trim(), 'base64'), format: 'der', type: 'spki' });
  } catch {
    return null;
  }
}

function signPointer(privateKey, pointer) {
  const key = typeof privateKey === 'string' || Buffer.isBuffer(privateKey) ? crypto.createPrivateKey(privateKey) : privateKey;
  const signature = crypto.sign(null, Buffer.from(message(pointer)), key).toString('base64');
  return Object.assign({}, pointer, { signature });
}

// Returns { ok: true } or { ok: false, reason }. Never throws.
function verifyPointer(pointer, expectedChannel, publicKeyBase64) {
  const key = publicKeyFrom(publicKeyBase64);
  if (!key) return { ok: false, reason: 'no_public_key' };
  if (!pointer || typeof pointer.signature !== 'string') return { ok: false, reason: 'unsigned' };
  for (const field of ['channel', 'version', 'hash', 'activatedAt']) {
    if (typeof pointer[field] !== 'string' || !pointer[field]) return { ok: false, reason: 'incomplete' };
  }
  if (pointer.channel !== expectedChannel) return { ok: false, reason: 'channel_mismatch' };
  let valid = false;
  try {
    valid = crypto.verify(null, Buffer.from(message(pointer)), key, Buffer.from(pointer.signature, 'base64'));
  } catch {
    valid = false;
  }
  return valid ? { ok: true } : { ok: false, reason: 'bad_signature' };
}

// For the operator's tooling and the tests.
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' })
  };
}

module.exports = { signPointer, verifyPointer, generateKeyPair, message, DOMAIN };
