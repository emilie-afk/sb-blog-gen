// A switch that pauses generation without weakening anything.
//
// Setting GENERATION_PAUSED=true (and redeploying, so the functions see it)
// makes both generation endpoints refuse new work with a clear "paused" message,
// after the session check and before validation, storage, the prompt pack or
// the model. Everything else is unchanged: sign-in, signed sessions, CSRF, the
// private prompt pack, public/ publishing and job status all keep working, so a
// job already running still reports its result.
//
// This is the safe "stop" lever during an incident. It replaces any idea of
// rolling back to the old password-token code, which would re-expose both the
// password and the prompts.

function generationPaused(env) {
  const v = String(((env || process.env).GENERATION_PAUSED) || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

const PAUSED = {
  status: 503,
  code: 'maintenance',
  error: 'Article generation is paused for maintenance. Your brief is still here; please try again later.'
};

module.exports = { generationPaused, PAUSED };
