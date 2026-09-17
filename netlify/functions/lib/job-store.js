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

function newJobId() {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return 'job_' + Date.now().toString(36) + '_' + rand() + rand();
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
  newJobId, createPending, completeJob, failJob, get, put, isExpired,
  TTL_MS, STORE_NAME,
  _memory: memory
};
