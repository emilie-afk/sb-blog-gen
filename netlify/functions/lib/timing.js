// Phase timing for the generation path.
//
// Every line is built from durations and small counts only. No prompt text, no
// article text, no field values, no tokens, no passwords, no API keys, and
// nothing a person typed. What a log line can contain is fixed by this module:
// the phase names below, integers, and the article type.

const PHASES = [
  'validation',
  'prompt_build',
  'article_call',
  'metadata_call',
  'ai_calls',
  'response_processing'
];

function createTimer() {
  const started = Date.now();
  const marks = {};
  return {
    // Times fn() and records it under a known phase name.
    async phase(name, fn) {
      const t0 = Date.now();
      try {
        return await fn();
      } finally {
        marks[name] = (marks[name] || 0) + (Date.now() - t0);
      }
    },
    // For work that is not a single awaited call.
    record(name, ms) { marks[name] = (marks[name] || 0) + Math.max(0, Math.round(ms)); },
    start() { return Date.now(); },
    since(t0) { return Date.now() - t0; },
    totalMs() { return Date.now() - started; },
    summary() {
      const phases = {};
      PHASES.forEach(p => { if (marks[p] !== undefined) phases[p] = marks[p]; });
      return { phases, totalMs: Date.now() - started };
    }
  };
}

// A single structured line, safe to keep in the Netlify function log.
function logTiming(context, timer, facts) {
  const { phases, totalMs } = timer.summary();
  const safeFacts = {};
  // Allowlisted, non-identifying facts only.
  ['articleType', 'productCount', 'recommendationCount', 'articleChars', 'truncated', 'ok', 'jobId']
    .forEach(k => { if (facts && facts[k] !== undefined) safeFacts[k] = facts[k]; });
  console.log(JSON.stringify({ event: 'generation_timing', context, totalMs, phases, ...safeFacts }));
  return { phases, totalMs };
}

module.exports = { createTimer, logTiming, PHASES };
