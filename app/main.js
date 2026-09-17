// Form state, format-aware field rendering, validation, request creation
// and output rendering.

let _sessionToken = null;

// Article-specific state. Everything in here belongs to ONE article and is
// cleared together by resetArticleState(). Application-level state that must
// outlive an article lives outside it: _sessionToken above, and the picker's
// loaded catalog caches.
//
// The defaults are defined once, as a factory, so the initial state and every
// reset produce exactly the same shape. A reset that rebuilt the object by hand
// is how fields quietly survive into the next article.
function freshValues() {
  return {
    numberOfRecommendations: 5,
    giftCharacteristics: [],
    sensitiveOccasion: false
  };
}

const state = {
  articleType: 'care_guide',
  values: freshValues(),
  errors: {},
  // True once an article has been generated and is on screen.
  hasOutput: false,
  // Set false by every completed generation, true only by a Copy HTML that
  // actually succeeded. Copying the title, excerpt or meta description does not
  // touch it, and neither does a failed copy.
  articleHtmlCopied: false,
  // Incremented on every generation and every reset. An async result carrying a
  // stale id is dropped rather than rendered: see the note on waitForJob.
  generationId: 0,
  // True while ANY generation is in flight, synchronous or background. The
  // transport is an implementation detail: a care guide on the synchronous
  // endpoint is just as much work in progress as a gift guide on a background
  // job, and abandoning either one deserves the same question. Whether polling
  // is involved is decided by BACKGROUND_FORMATS at the point of use, never by
  // this flag.
  generationPending: false
};

// The article HTML is the one field whose successful copy matters here.
// Registered once, at load, so repeated resets cannot accumulate listeners.
document.addEventListener('sbcopy', e => {
  if (e && e.detail && e.detail.field === 'html-code' && e.detail.ok) {
    state.articleHtmlCopied = true;
  }
});

// An edit makes the copy stale. What reached the clipboard is no longer what is
// on screen, so the article counts as uncopied again and starting a new one asks
// before throwing the edit away.
//
// This listens for the `input` event, which fires for typing, deleting, pasting,
// drag-and-drop and undo, but NOT for a programmatic assignment to .value. That
// is exactly the distinction needed: renderOutput() and resetOutputState() both
// set .value directly and must not trip this, and both already set the flag
// themselves.
//
// Registered once, on the document rather than the element, so no number of
// generations or resets can accumulate duplicate listeners, and so it survives
// any future re-render of the output card.
document.addEventListener('input', e => {
  if (e && e.target && e.target.id === 'html-code') {
    state.articleHtmlCopied = false;
  }
});

// ── Login ────────────────────────────────────────────────────────
async function login() {
  const pwd = document.getElementById('pwd').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  if (!pwd) { err.textContent = 'Please enter the password.'; return; }
  btn.disabled = true;
  btn.textContent = 'Checking…';
  err.textContent = '';
  try {
    const res = await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      _sessionToken = data.token; // held in memory only, never stored
      document.getElementById('login-overlay').classList.add('hidden');
      document.getElementById('app').style.display = 'block';
      document.getElementById('pwd').value = '';
      initApp();
    } else {
      err.textContent = data.error || 'Incorrect password.';
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  } catch (e) {
    err.textContent = 'Network error. Please try again.';
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

// ── Field rendering ──────────────────────────────────────────────
function currentFormat() { return FORMATS[state.articleType]; }

function visibleFields() {
  return currentFormat().fields.filter(f => !f.showIf || f.showIf(state.values));
}

function fieldError(name) {
  return state.errors[name] ? `<div class="inline-error">${esc(state.errors[name])}</div>` : '';
}

function renderField(f) {
  const v = state.values[f.name];
  const invalid = state.errors[f.name] ? ' invalid' : '';
  const label = `<label>${esc(f.label)}${f.required ? ' *' : ''}</label>`;
  const hint = f.hint ? `<div class="hint">${esc(f.hint)}</div>` : '';

  switch (f.type) {
    case 'text':
    case 'url':
      return `<div class="field${f.half ? ' half' : ''}">${label}
        <input type="${f.type === 'url' ? 'url' : 'text'}" class="fld${invalid}" data-name="${f.name}"
               placeholder="${esc(f.placeholder || '')}" value="${esc(v || '')}">${hint}${fieldError(f.name)}</div>`;

    case 'number':
      return `<div class="field${f.half ? ' half' : ''}">${label}
        <input type="number" class="fld${invalid}" data-name="${f.name}" min="${f.min}" max="${f.max}"
               value="${esc(v == null ? '' : v)}">${hint}${fieldError(f.name)}</div>`;

    case 'textarea':
      return `<div class="field">${label}
        <textarea class="fld${invalid}" data-name="${f.name}" rows="3"
                  placeholder="${esc(f.placeholder || '')}">${esc(v || '')}</textarea>${hint}${fieldError(f.name)}</div>`;

    case 'select':
      return `<div class="field${f.half ? ' half' : ''}">${label}
        <select class="fld-control${invalid}" data-name="${f.name}">
          <option value="">${esc(f.placeholder || 'Choose one')}</option>
          ${f.options.map(o => `<option value="${esc(o)}"${v === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}
        </select>${hint}${fieldError(f.name)}</div>`;

    case 'checkbox':
      return `<div class="field"><label class="check-line">
          <input type="checkbox" class="fld-control" data-name="${f.name}"${v ? ' checked' : ''}>
          <span>${esc(f.label)}</span></label>${hint}${fieldError(f.name)}</div>`;

    case 'checkboxGroup': {
      const chosen = v || [];
      return `<div class="field">${label}
        <div class="chip-group">${f.options.map(o => `
          <label class="chip${chosen.includes(o) ? ' on' : ''}">
            <input type="checkbox" class="fld-multi" data-name="${f.name}" value="${esc(o)}"${chosen.includes(o) ? ' checked' : ''}>
            <span>${esc(o)}</span></label>`).join('')}</div>${hint}${fieldError(f.name)}</div>`;
    }

    case 'references':
      return `<div class="field"><label>Reference links (optional, up to 2)</label>
        ${[1, 2].map(n => `<div class="ref-box">
          <div class="ref-label">Reference ${n}</div>
          <div class="row2">
            <div class="field half"><label>URL</label><input type="url" class="fld" data-name="ref${n}url" placeholder="https://..." value="${esc(state.values['ref' + n + 'url'] || '')}"></div>
            <div class="field half"><label>Link text</label><input type="text" class="fld" data-name="ref${n}text" placeholder="e.g. ASPCA Toxicity Guide" value="${esc(state.values['ref' + n + 'text'] || '')}"></div>
          </div>
          ${state.errors['ref' + n] ? `<div class="inline-error">${esc(state.errors['ref' + n])}</div>` : ''}
        </div>`).join('')}</div>`;

    case 'products':
      return `<div class="field">${label}
        <div id="productPicker" class="picker"></div>${fieldError(f.name)}</div>`;

    default:
      return '';
  }
}

function renderForm() {
  const fmt = currentFormat();
  document.getElementById('formatTitle').textContent = fmt.icon + ' ' + fmt.sectionTitle;
  document.getElementById('genLabel').textContent = fmt.buttonLabel;
  document.getElementById('steps').innerHTML = fmt.steps
    .map((s, i) => `<div class="step"><div class="num">${i + 1}</div><div class="txt">${esc(s)}</div></div>`).join('');
  document.getElementById('progressRows').innerHTML = fmt.progress
    .map((p, i) => `<div class="progress-row" id="p${i + 1}"><div class="dot"></div><span>${esc(p)}</span></div>`).join('');

  // Group consecutive half-width fields into rows.
  const fields = visibleFields();
  let html = '';
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].half && fields[i + 1] && fields[i + 1].half && (!fields[i + 1].showIf)) {
      html += `<div class="row2">${renderField(fields[i])}${renderField(fields[i + 1])}</div>`;
      i++;
    } else {
      html += renderField(fields[i]);
    }
  }
  document.getElementById('formFields').innerHTML = html;

  bindFields();
  const picker = document.getElementById('productPicker');
  if (picker) {
    ProductPicker.mount(
      picker,
      () => ({ occasion: state.values.occasion || '', token: _sessionToken }),
      () => { /* the picker renders its own count */ }
    );
  }
  renderSensitiveSuggestion();
}

// A non-blocking nudge. The checkbox is never set for the user.
const SENSITIVE_HINTS = ['sympathy', 'bereavement', 'memorial', 'remembrance', 'pregnancy loss',
  'infant loss', 'miscarriage', 'serious illness', 'funeral', 'condolence'];

function renderSensitiveSuggestion() {
  const box = document.getElementById('sensitiveSuggestion');
  if (!box) return;
  const occasion = String(state.values.occasion || '').toLowerCase();
  const matched = state.articleType === 'occasion_gift_guide'
    && !state.values.sensitiveOccasion
    && SENSITIVE_HINTS.some(h => occasion.includes(h));
  box.style.display = matched ? 'block' : 'none';
  if (matched) {
    box.innerHTML = 'This occasion reads as a sensitive or remembrance one. If that is right, tick '
      + '"This is a sensitive or remembrance occasion" above so the article drops urgency and promotion.';
  }
}

function bindFields() {
  // Free text: update state only, never re-render, so typing is never interrupted.
  document.querySelectorAll('#formFields .fld').forEach(el => {
    el.addEventListener('input', e => {
      const name = e.target.dataset.name;
      state.values[name] = e.target.value;
      if (state.errors[name]) { delete state.errors[name]; e.target.classList.remove('invalid'); }
      if (name === 'occasion') {
        renderSensitiveSuggestion();
        if (typeof ProductPicker !== 'undefined') ProductPicker.contextChanged();
      }
    });
  });
  // Controls that reveal or hide other fields: update and re-render.
  document.querySelectorAll('#formFields .fld-control').forEach(el => {
    el.addEventListener('change', e => {
      const name = e.target.dataset.name;
      state.values[name] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      delete state.errors[name];
      renderForm();
    });
  });
  document.querySelectorAll('#formFields .fld-multi').forEach(el => {
    el.addEventListener('change', e => {
      const name = e.target.dataset.name;
      const set = new Set(state.values[name] || []);
      if (e.target.checked) set.add(e.target.value); else set.delete(e.target.value);
      state.values[name] = Array.from(set);
      delete state.errors[name];
      renderForm();
    });
  });
}

// ── Article boundaries ───────────────────────────────────────────
// The browser session used to be one continuous draft: changing format or
// starting a different occasion left the previous article's confirmed products
// and output in place, so products chosen for one article could end up attached
// to another. These three functions are the explicit boundary.
//
// There is ONE full reset, used by every path that starts a new article. Several
// partial resets, each clearing a different subset, is how a field survives into
// the next article unnoticed.

// Does the current draft hold work worth warning about before it is thrown away?
function isArticleDirty() {
  if (state.hasOutput || state.generationPending) return true;
  const v = state.values;
  const defaults = freshValues();
  const meaningful = Object.keys(v).some(k => {
    const value = v[k];
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return value !== (defaults[k] || false);
    // A number field left at its default is not work the person has done.
    if (k in defaults) return String(value) !== String(defaults[k]);
    return true;
  });
  if (meaningful) return true;
  if (typeof ProductPicker !== 'undefined' && ProductPicker.isDirty()) return true;
  return false;
}

// Clears everything that belongs to the visible output: the article, its title
// options, metadata, related items, warnings and errors. Used on its own when
// products change under a generated article, and as part of the full reset.
function resetOutputState() {
  state.hasOutput = false;
  state.articleHtmlCopied = false;

  ['outputCard', 'excerptCard', 'metaCard', 'recsCard', 'progressCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  });
  ['html-code', 'title-text', 'excerpt-text', 'meta-text'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const previewTitle = document.getElementById('preview-title');
  if (previewTitle) previewTitle.textContent = '';
  const previewBody = document.getElementById('preview-body');
  if (previewBody) previewBody.innerHTML = '';
  const titleOptions = document.getElementById('titleOptions');
  if (titleOptions) { titleOptions.innerHTML = ''; titleOptions.style.display = 'none'; }
  ['recsProducts', 'recsArticles'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  if (document.getElementById('metaCounter')) updateMetaCounter();

  clearError();
  showWarnings([]);
  setPending('');
  switchTab('html');
  // Copy timers and the shared status region belong to the article that is
  // going away: a surviving timer would fire against the next one.
  clearCopyState();
}

// Abandons whatever generation is in flight, synchronous or background. Neither
// request is cancelled: a Netlify background function cannot be, and an
// in-flight fetch would still have to be ignored on arrival anyway. What matters
// is that no result can reach the form. Bumping generationId does that for both
// transports: the poll loop stops on its next tick, and the synchronous path
// finds the id has moved on when its fetch resolves.
function abandonActiveGeneration() {
  state.generationId += 1;
  state.generationPending = false;
}

// THE full article reset. Every path that starts a new article goes through here.
function resetArticleState(options) {
  const opts = options || {};
  abandonActiveGeneration();
  resetOutputState();

  state.values = freshValues();
  state.errors = {};
  if (opts.articleType && FORMATS[opts.articleType]) state.articleType = opts.articleType;

  if (typeof ProductPicker !== 'undefined') ProductPicker.resetForNewArticle();

  document.querySelectorAll('.format-option').forEach(el => {
    el.classList.toggle('on', el.dataset.type === state.articleType);
  });
  renderForm();

  const btn = document.getElementById('genBtn');
  if (btn) {
    btn.disabled = false;
    document.getElementById('genLabel').textContent = currentFormat().buttonLabel;
    document.getElementById('genIcon').textContent = '⚡';
  }

  if (opts.focusFormat !== false) focusArticleFormat();
}

// Returns the person to the top of the workflow and puts the keyboard on the
// first selectable format, so a new article starts where a new article starts.
function focusArticleFormat() {
  const card = document.getElementById('formatCard');
  if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const first = document.querySelector('#formatOptions .format-option.on')
    || document.querySelector('#formatOptions .format-option');
  if (first && typeof first.focus === 'function') {
    try { first.focus({ preventScroll: true }); } catch (e) { try { first.focus(); } catch (e2) { /* ignore */ } }
  }
}

const NEW_ARTICLE_BODY = 'Your current brief, selected products, and generated article will be cleared.';

async function createAnotherArticle() {
  // Generated output that has not actually reached the clipboard is work that
  // would be lost for good, so it is worth a question. Output the person has
  // successfully copied is already safe elsewhere, and a clean form has nothing
  // to lose, so neither needs one.
  const needsConfirm = state.generationPending || (state.hasOutput && !state.articleHtmlCopied);
  if (needsConfirm) {
    const body = state.generationPending
      ? NEW_ARTICLE_BODY + ' The generation still running will no longer be shown.'
      : NEW_ARTICLE_BODY;
    const go = await confirmAction({
      title: 'Start a new article?',
      body,
      cancelLabel: 'Cancel',
      confirmLabel: 'Start New Article'
    });
    if (!go) return false;   // Cancel preserves the complete current state.
  }
  resetArticleState();
  return true;
}

async function clearSelectedProducts() {
  const go = await confirmAction({
    title: 'Clear selected products?',
    body: 'This will remove all products currently confirmed for this article. Your brief will remain unchanged.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Clear Products'
  });
  if (!go) return false;

  ProductPicker.clearSelected();
  // The generated article names the products that have just been removed, so it
  // cannot stand. The brief and the chosen format are untouched.
  if (state.hasOutput || state.generationPending) {
    abandonActiveGeneration();
    resetOutputState();
  }
  renderForm();
  return true;
}

// Changing format is not editing a field: the new format's brief has different
// questions and the confirmed products were chosen for the old one. It asks
// first, but only when there is something to lose.
async function setFormat(type) {
  if (!FORMATS[type]) return;
  if (type === state.articleType) return;   // clicking the current format does nothing

  if (isArticleDirty()) {
    const go = await confirmAction({
      title: 'Switch article format?',
      body: 'The current brief, selected products, and generated article will be cleared.',
      cancelLabel: 'Keep Current Article',
      confirmLabel: 'Switch Format'
    });
    if (!go) {
      // Keep the old format selected and every value with it. The buttons are
      // re-synced in case a class was toggled optimistically.
      document.querySelectorAll('.format-option').forEach(el => {
        el.classList.toggle('on', el.dataset.type === state.articleType);
      });
      return;
    }
    resetArticleState({ articleType: type, focusFormat: false });
    return;
  }

  // A clean form switches straight over: nothing is being thrown away.
  state.articleType = type;
  state.errors = {};
  document.querySelectorAll('.format-option').forEach(el => {
    el.classList.toggle('on', el.dataset.type === type);
  });
  renderForm();
}

// ── Validation ───────────────────────────────────────────────────
function isHttpUrl(v) {
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

function validate() {
  state.errors = {};
  const fmt = currentFormat();
  const v = state.values;

  visibleFields().forEach(f => {
    if (f.type === 'references' || f.type === 'products') return;
    const value = v[f.name];
    if (f.required && f.type !== 'checkbox') {
      const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
      if (empty) { state.errors[f.name] = `${f.label.replace(/ \(optional\)/, '')} is required.`; return; }
    }
    if (f.type === 'url' && value && !isHttpUrl(value)) {
      state.errors[f.name] = 'Enter a full URL starting with http:// or https://';
    }
    if (f.type === 'number' && value !== '' && value != null) {
      const n = Number(value);
      if (!Number.isInteger(n) || n < (f.min || 1) || n > (f.max || 30)) {
        state.errors[f.name] = `Enter a whole number between ${f.min || 1} and ${f.max || 30}.`;
      }
    }
  });

  // Reference links
  [1, 2].forEach(n => {
    const u = (v['ref' + n + 'url'] || '').trim();
    const t = (v['ref' + n + 'text'] || '').trim();
    if (u && !isHttpUrl(u)) state.errors['ref' + n] = 'Reference URL must start with http:// or https://';
    else if (t && !u) state.errors['ref' + n] = 'Add the reference URL, or clear the link text.';
  });

  // Confirmed products
  if (fmt.needsProducts) {
    const count = ProductPicker.count();
    if (!count) {
      state.errors.selectedProducts = 'Confirm at least one product. Gift guides only write about products you have confirmed.';
    } else if (!state.errors.numberOfRecommendations) {
      const asked = Number(v.numberOfRecommendations);
      if (Number.isInteger(asked) && asked > count) {
        state.errors.numberOfRecommendations =
          `You asked for ${asked} recommendations but only ${count} product${count === 1 ? ' is' : 's are'} confirmed. Confirm more products or lower the number.`;
      }
    }
  }

  return Object.keys(state.errors).length === 0;
}

// ── Request ──────────────────────────────────────────────────────
function buildFields() {
  const v = state.values;
  const fields = {};
  visibleFields().forEach(f => {
    if (f.type === 'references' || f.type === 'products') return;
    let value = v[f.name];
    if (value === undefined || value === null || value === '') return;
    if (f.type === 'number') value = Number(value);
    if (Array.isArray(value) && !value.length) return;
    fields[f.name] = value;
  });

  fields.references = [1, 2].map(n => ({
    url: (v['ref' + n + 'url'] || '').trim(),
    text: (v['ref' + n + 'text'] || '').trim()
  })).filter(r => r.url && r.text);

  if (currentFormat().needsProducts) {
    fields.selectedProducts = ProductPicker.getSelected();
  }
  if (state.articleType === 'occasion_gift_guide') {
    fields.sensitiveOccasion = !!v.sensitiveOccasion;
    fields.includeYearInTitle = !!v.includeYearInTitle;
  }
  return fields;
}

function setProgress(step) {
  const rows = document.querySelectorAll('#progressRows .progress-row');
  rows.forEach((el, i) => {
    el.classList.remove('done', 'active');
    if (i < step) el.classList.add('done');
    else if (i === step) el.classList.add('active');
  });
}

const ERROR_TITLES = {
  missing_required: 'Something required is missing',
  invalid_url: 'A URL is not valid',
  no_products: 'No confirmed products',
  not_enough_products: 'Not enough confirmed products',
  unauthorized: 'Your session has expired',
  ai_failure: 'The AI service failed',
  incomplete_response: 'The AI response was incomplete',
  server_config: 'The server is not configured',
  invalid_article_type: 'Unknown article format',
  invalid_input: 'Some input could not be accepted',
  gateway_timeout: 'Generation took too long',
  bad_gateway: 'The generation service is unavailable',
  server_error: 'The server hit an error',
  unexpected_response: 'Unexpected server response',
  storefront_failure: 'The Succulents Box storefront could not be reached',
  job_expired: 'That generation is no longer available',
  client_wait_timeout: 'This browser stopped waiting',
  job_store_unavailable: 'The job store could not be read',
  bad_job_id: 'That job reference is not valid'
};

// The single truncation message, shared with the server so the browser can
// recognise it and show it exactly once. Five products is a normal guide, so the
// copy never suggests choosing fewer.
const TRUNCATION_TITLE = 'The article was cut off';
const TRUNCATION_MESSAGE = 'The article reached the output limit and is incomplete. Please generate it again. If this continues, the article generator needs a higher output allowance.';

function isTruncationWarning(warning) {
  return /reached the output limit/i.test(String(warning || ''));
}

// List formats go through the background job: a long gift guide can outrun
// Netlify's 60 second synchronous limit, which cannot be raised. The care guide
// and single-plant formats are bounded and stay on the synchronous endpoint.
const BACKGROUND_FORMATS = ['general_gift_guide', 'occasion_gift_guide'];
const POLL_INTERVAL_MS = 2500;
// Netlify background functions may run for up to 15 minutes, so the browser
// waits for the whole platform limit plus a buffer. Giving up earlier would mean
// calling a job dead while the server is still working on it.
const BACKGROUND_LIMIT_MS = 15 * 60 * 1000;
const POLL_TIMEOUT_MS = BACKGROUND_LIMIT_MS + 30 * 1000;

function newJobId() {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return 'job_' + Date.now().toString(36) + '_' + rand() + rand();
}

function setPending(message) {
  const el = document.getElementById('pendingNote');
  if (!el) return;
  el.textContent = message || '';
  el.style.display = message ? 'block' : 'none';
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { res, data: await readResponse(res) };
}

// Polls generate-status until the job finishes. The form and the confirmed
// products are never touched here, so any outcome leaves them ready to retry.
// A generation is abandoned when the person starts a new article or switches
// format while it is in flight. The server job cannot be cancelled, so the
// browser stops caring about it instead: every tick checks the generation id it
// started under, and a stale loop stops polling and throws a marker the caller
// swallows. Nothing from the old job ever reaches the form.
class StaleGeneration extends Error {
  constructor() { super('This generation was abandoned when a new article was started.'); this.stale = true; }
}

async function waitForJob(jobId, onTick, generationId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    if (generationId !== state.generationId) throw new StaleGeneration();
    const { res, data } = await postJson('/.netlify/functions/generate-status', { jobId, token: _sessionToken });
    if (generationId !== state.generationId) throw new StaleGeneration();
    if (!res.ok) {
      throw Object.assign(new Error(data.error || `Status check failed (HTTP ${res.status}).`), { code: data.code });
    }
    if (data.status === 'complete') return data;
    if (data.status === 'failed' || data.status === 'expired') {
      throw Object.assign(new Error(data.error || 'The generation did not finish.'), { code: data.code });
    }
    if (onTick) onTick(Math.round((data.elapsedMs || 0) / 1000), !!data.starting);
  }
  // The browser stopped waiting. That is not the same as the job expiring: the
  // background function may well have finished, so the message says so rather
  // than claiming the server gave up.
  throw Object.assign(
    new Error('This browser stopped waiting after 15 minutes. The job may still finish on the server. Your brief and confirmed products are still here, so you can generate again.'),
    { code: 'client_wait_timeout' }
  );
}

async function generate() {
  clearError();
  showWarnings([]);
  setPending('');

  if (!validate()) {
    renderForm();
    const first = document.querySelector('#formFields .invalid, #formFields .inline-error');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showError('Please fix the highlighted fields.', Object.values(state.errors)[0]);
    return;
  }

  const fmt = currentFormat();
  const useBackground = BACKGROUND_FORMATS.includes(state.articleType);
  const btn = document.getElementById('genBtn');
  btn.disabled = true;
  document.getElementById('genLabel').textContent = 'Generating…';
  document.getElementById('genIcon').textContent = '⏳';
  document.getElementById('progressCard').classList.add('visible');
  ['outputCard', 'excerptCard', 'metaCard', 'recsCard'].forEach(id =>
    document.getElementById(id).classList.remove('visible'));
  setProgress(0);

  // This run's identity. Everything below checks it before touching the form, so
  // a result that arrives after the person has moved on is dropped.
  const generationId = ++state.generationId;
  state.generationPending = true;
  state.hasOutput = false;
  state.articleHtmlCopied = false;

  const ticker = [1, 2, 3].map((s, i) => setTimeout(() => setProgress(s), (i + 1) * 3500));
  const requestBody = {
    articleType: state.articleType,
    fields: buildFields(),
    token: _sessionToken
  };

  try {
    let data;

    if (useBackground) {
      const jobId = newJobId();
      setPending('Starting the guide. This runs in the background, usually well under a minute, longer for eight recommendations. Keep this tab open.');
      const started = await postJson('/.netlify/functions/generate-background', Object.assign({ jobId }, requestBody));
      // Netlify answers a background invocation with an empty 202 and no body,
      // so there is nothing to read here and no job id to receive. Only a real
      // failure status is worth reporting; the job id stays the one minted above.
      if (!started.res.ok && started.res.status !== 202) {
        throw Object.assign(
          new Error((started.data && started.data.error) || `The generation could not be started (HTTP ${started.res.status}).`),
          { code: started.data && started.data.code });
      }
      data = await waitForJob(jobId, (seconds, starting) => {
        setPending(starting
          ? `Waiting for the job to start, ${seconds}s so far. Keep this tab open.`
          : `Still writing, ${seconds}s so far. Keep this tab open.`);
      }, generationId);
    } else {
      const sync = await postJson('/.netlify/functions/generate', requestBody);
      if (generationId !== state.generationId) throw new StaleGeneration();
      if (!sync.res.ok) {
        throw Object.assign(new Error(sync.data.error || `The server returned HTTP ${sync.res.status}.`), { code: sync.data.code });
      }
      data = sync.data;
    }

    ticker.forEach(clearTimeout);
    if (generationId !== state.generationId) throw new StaleGeneration();
    state.generationPending = false;
    setPending('');

    if (data.nonJson || !data.html) {
      throw Object.assign(new Error(data.error || 'The generation service returned a response without an article.'),
        { code: data.code || 'incomplete_response' });
    }

    setProgress(4);
    renderOutput(data, fmt);
    setProgress(5);
    document.getElementById('progressCard').classList.remove('visible');
    if (data.truncated) {
      // One prominent banner. renderOutput keeps the same message out of the
      // yellow warning list, so the problem is reported once rather than twice.
      showError(TRUNCATION_TITLE, TRUNCATION_MESSAGE);
    }
  } catch (err) {
    ticker.forEach(clearTimeout);
    // An abandoned generation is not a failure to report: the person has already
    // moved on, the form now belongs to a new article, and writing an error into
    // it would be writing into someone else's work.
    if (err && err.stale) return;
    state.generationPending = false;
    setPending('');
    document.getElementById('progressCard').classList.remove('visible');
    showError(ERROR_TITLES[err.code] || 'Generation failed', err.message || String(err));
  }

  // The reset may have run while this was in flight, in which case the button
  // belongs to the new article and must not be relabelled from the old format.
  if (generationId !== state.generationId) return;
  btn.disabled = false;
  document.getElementById('genLabel').textContent = fmt.buttonLabel;
  document.getElementById('genIcon').textContent = '⚡';
}

function renderOutput(data, fmt) {
  document.getElementById('html-code').value = data.html || '';
  setFinalTitle(data.title || '');
  renderTitleOptions(data.title || '', data.alternative_titles || []);
  document.getElementById('preview-body').innerHTML = sanitizeHTML(data.html || '');
  document.getElementById('outputCard').classList.add('visible');
  switchTab('html');

  if (data.excerpt) {
    document.getElementById('excerpt-text').value = data.excerpt;
    document.getElementById('excerptCard').classList.add('visible');
  }
  if (data.meta_description) {
    document.getElementById('meta-text').value = data.meta_description;
    updateMetaCounter();
    document.getElementById('metaCard').classList.add('visible');
  }

  document.getElementById('productsPanelLabel').textContent = '🛍 ' + fmt.productsPanelLabel;
  document.getElementById('articlesPanelLabel').textContent = '📚 ' + fmt.articlesPanelLabel;
  document.getElementById('productsPanelNote').textContent = fmt.needsProducts
    ? 'these products are written into the article HTML'
    : 'reference only, not in the blog HTML';
  document.getElementById('recsProducts').innerHTML = buildProductCards(data.products);
  document.getElementById('recsArticles').innerHTML = buildRelatedArticles(data.related_articles);
  document.getElementById('recsCard').classList.add('visible');

  // A truncated article already has its own banner. Filter only that message out
  // of the general warning list: every other warning still renders normally.
  const warnings = (data.warnings || []).filter(w => !isTruncationWarning(w));
  showWarnings(warnings);

  // A fresh article on screen: nothing has been copied out of it yet, so
  // starting another one will ask before clearing it.
  state.hasOutput = true;
  state.articleHtmlCopied = false;
  state.generationPending = false;
}

function setFinalTitle(title) {
  document.getElementById('title-text').value = title;
  document.getElementById('preview-title').textContent = title;
}

// The recommended title plus any alternatives. Choosing an alternative only
// swaps the editable title, it never regenerates the article.
function renderTitleOptions(recommended, alternatives) {
  const box = document.getElementById('titleOptions');
  const all = [{ label: 'Recommended', value: recommended }]
    .concat((alternatives || []).map((a, i) => ({ label: 'Alternative ' + (i + 1), value: a })))
    .filter(o => o.value);
  if (all.length < 2) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = '<div class="title-options-label">Title options</div>' + all.map((o, i) => `
    <button type="button" class="title-option${i === 0 ? ' on' : ''}" data-title="${esc(o.value)}">
      <span class="to-label">${esc(o.label)}</span>
      <span class="to-value">${esc(o.value)}</span>
    </button>`).join('');
  box.querySelectorAll('.title-option').forEach(btn => {
    btn.addEventListener('click', () => {
      box.querySelectorAll('.title-option').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      setFinalTitle(btn.dataset.title);
    });
  });
}

// ── Boot ─────────────────────────────────────────────────────────
function initApp() {
  const wrap = document.getElementById('formatOptions');
  wrap.innerHTML = FORMAT_ORDER.map(type => `
    <button type="button" class="format-option${type === state.articleType ? ' on' : ''}" data-type="${type}" onclick="setFormat('${type}')">
      <span class="fo-icon">${FORMATS[type].icon}</span>
      <span class="fo-label">${esc(FORMATS[type].label)}</span>
    </button>`).join('');
  renderForm();
}
