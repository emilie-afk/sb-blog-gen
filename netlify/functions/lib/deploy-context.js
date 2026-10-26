// Which deploy context this function bundle belongs to, and which prompt-pack
// channel it may read.
//
// WHERE THE CONTEXT COMES FROM. Netlify gives functions only URL, SITE_NAME and
// SITE_ID at runtime; the deploy context is not one of them. It is available
// during the build, as the reserved, read-only `CONTEXT` variable
// ("production", "deploy-preview", "branch-deploy", "dev"), which cannot be set
// or overridden in the Netlify UI. tools/build-site.js writes it into
// deploy-context.json beside this file, and Netlify bundles that file with the
// functions. So the context a function sees is the one Netlify assigned to the
// deploy it was built for, not something a request or a site setting can claim.
//
// THE RULES, all failing closed:
//   production       PROMPT_PACK_CHANNEL unset or "production"  -> "production"
//                    anything else                              -> refused
//   deploy-preview,  PROMPT_PACK_CHANNEL a valid name other     -> that channel
//   branch-deploy,   than "production"
//   dev              unset, invalid or "production"             -> refused
//   missing stamp, or any other context                         -> refused
//
// A non-production deploy can therefore never select production's pointer, and
// one that was not given a channel refuses to generate rather than borrowing
// production's instructions.
//
// WHAT THIS DOES NOT DO. It protects against misconfiguration by honest code.
// A preview runs the code of the branch it was built from, so someone who can
// push a branch can change this file too. That is why deploy previews of
// outside contributions must be disabled or approval-gated, and why pack
// pointers are signed with a key no deploy holds (docs/SECURITY.md).

const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const KNOWN_CONTEXTS = ['production', 'deploy-preview', 'branch-deploy', 'dev'];

let override = null;   // tests only

function stamped() {
  if (override) return override;
  try {
    // A static require, so the function bundler includes the generated file.
    const stamp = require('./deploy-context.json');
    return stamp && typeof stamp.context === 'string' ? stamp : null;
  } catch {
    return null;
  }
}

function deployContext() {
  const stamp = stamped();
  return stamp && KNOWN_CONTEXTS.includes(stamp.context) ? stamp.context : 'unknown';
}

function refuse(reason) {
  return Object.assign(new Error(`Prompt-pack channel refused: ${reason}`), { code: 'prompt_pack_unavailable', reason });
}

// Returns the channel name, or throws a coded error the caller reports as a
// configuration failure.
function resolveChannel(env) {
  const ctx = deployContext();
  const raw = String(((env || process.env).PROMPT_PACK_CHANNEL) || '').trim().toLowerCase();

  if (ctx === 'unknown') throw refuse('deploy context unknown');

  if (ctx === 'production') {
    if (!raw || raw === 'production') return 'production';
    throw refuse('production must not select another channel');
  }

  if (!raw) throw refuse(`${ctx} has no PROMPT_PACK_CHANNEL`);
  if (!CHANNEL_PATTERN.test(raw)) throw refuse(`${ctx} has an invalid PROMPT_PACK_CHANNEL`);
  if (raw === 'production') throw refuse(`${ctx} may not use the production channel`);
  return raw;
}

function setDeployContextForTests(context) { override = context ? { context } : null; }

module.exports = { deployContext, resolveChannel, setDeployContextForTests, CHANNEL_PATTERN, KNOWN_CONTEXTS };
