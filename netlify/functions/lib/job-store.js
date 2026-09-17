// Durable storage for background generation jobs.
//
// Netlify Blobs is the store: it is available to functions on Netlify with no
// setup and it survives the short-lived function instances, which an in-memory
// map would not. When the Blobs runtime is not present (local test runs), an
// in-memory fallback keeps the same interface so the job lifecycle can be tested
// without the platform.
//
// A record holds no prompts and no credentials: status, timestamps, the finished
// payload, and an error message that has already been made safe for the browser.

const STORE_NAME = 'article-jobs';
const TTL_MS = 60 * 60 * 1000;   // an hour: long enough to come back to a tab

const memory = new Map();
let blobsModule;
let blobsUnavailable = false;

function loadBlobs() {
  if (blobsUnavailable || blobsModule) return blobsModule;
  try {
    blobsModule = require('@netlify/blobs');
  } catch {
    blobsUnavailable = true;
  }
  return blobsModule;
}

function getStore() {
  const blobs = loadBlobs();
  if (!blobs || typeof blobs.getStore !== 'function') return null;
  try {
    return blobs.getStore({ name: STORE_NAME, consistency: 'strong' });
  } catch (err) {
    // Not running on Netlify, or the store is not configured for this context.
    // Warn once: in local runs this would otherwise repeat on every call.
    if (!blobsUnavailable) {
      blobsUnavailable = true;
      console.warn('Job store unavailable, using in-memory fallback:', err.message);
    }
    return null;
  }
}

// job_<base36 submit time>_<random>. The browser mints the id and the same id is
// used end to end, because a Netlify background invocation answers with an empty
// 202 and never returns a body to the browser.
const JOB_ID_PATTERN = /^job_([0-9a-z]{6,12})_([0-9a-z]{6,40})$/;
const EARLIEST_PLAUSIBLE_MS = Date.UTC(2020, 0, 1);
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function newJobId() {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return 'job_' + Date.now().toString(36) + '_' + rand() + rand();
}

// Reads the submit time out of a job id without trusting it for anything but
// timing. An id whose shape or timestamp is not plausible is rejected outright;
// a timestamp in the future is clamped to now, so a forged id can only ever
// shorten the grace period it would get, never extend it or reach another job.
function parseJobId(jobId) {
  const id = typeof jobId === 'string' ? jobId.trim() : '';
  const match = JOB_ID_PATTERN.exec(id);
  if (!match) return { valid: false };

  const submittedAt = parseInt(match[1], 36);
  if (!Number.isFinite(submittedAt) || submittedAt < EARLIEST_PLAUSIBLE_MS) return { valid: false };

  const now = Date.now();
  if (submittedAt > now + CLOCK_SKEW_MS) return { valid: true, jobId: id, submittedAt: now, ageMs: 0 };
  return { valid: true, jobId: id, submittedAt, ageMs: Math.max(0, now - submittedAt) };
}

function isExpired(record) {
  return !record || (Date.now() - new Date(record.createdAt).getTime()) > TTL_MS;
}

async function put(jobId, record) {
  const store = getStore();
  const body = JSON.stringify(record);
  if (store) {
    await store.set(jobId, body);
    return record;
  }
  memory.set(jobId, body);
  return record;
}

async function get(jobId) {
  const store = getStore();
  let body = null;
  if (store) {
    body = await store.get(jobId, { type: 'text' });
  } else {
    body = memory.get(jobId) || null;
  }
  if (!body) return null;
  try { return JSON.parse(body); } catch { return null; }
}

async function createPending(jobId, meta) {
  return put(jobId, {
    jobId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Non-identifying context only, so a status poll can show something useful.
    articleType: meta && meta.articleType,
    recommendationCount: meta && meta.recommendationCount
  });
}

async function completeJob(jobId, payload, timing) {
  const existing = (await get(jobId)) || { jobId, createdAt: new Date().toISOString() };
  return put(jobId, Object.assign({}, existing, {
    status: 'complete',
    updatedAt: new Date().toISOString(),
    timing: timing || null,
    result: payload
  }));
}

async function failJob(jobId, error, code, timing) {
  const existing = (await get(jobId)) || { jobId, createdAt: new Date().toISOString() };
  return put(jobId, Object.assign({}, existing, {
    status: 'failed',
    updatedAt: new Date().toISOString(),
    timing: timing || null,
    error: error,
    code: code || 'ai_failure'
  }));
}

module.exports = {
  newJobId, parseJobId, createPending, completeJob, failJob, get, put, isExpired,
  TTL_MS, STORE_NAME, JOB_ID_PATTERN,
  _memory: memory
};
