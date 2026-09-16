// Form state, format-aware field rendering, validation, request creation
// and output rendering.

let _sessionToken = null;

const state = {
  articleType: 'care_guide',
  values: {
    numberOfRecommendations: 5,
    giftCharacteristics: [],
    sensitiveOccasion: false
  },
  errors: {}
};

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
  if (picker) ProductPicker.mount(picker, () => { /* count rendered by the picker */ });
}

function bindFields() {
  // Free text: update state only, never re-render, so typing is never interrupted.
  document.querySelectorAll('#formFields .fld').forEach(el => {
    el.addEventListener('input', e => {
      const name = e.target.dataset.name;
      state.values[name] = e.target.type === 'number' ? e.target.value : e.target.value;
      if (state.errors[name]) { delete state.errors[name]; e.target.classList.remove('invalid'); }
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

function setFormat(type) {
  if (!FORMATS[type]) return;
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
    } else {
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
  invalid_input: 'Some input could not be accepted'
};

async function generate() {
  clearError();
  showWarnings([]);

  if (!validate()) {
    renderForm();
    const first = document.querySelector('#formFields .invalid, #formFields .inline-error');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showError('Please fix the highlighted fields.', Object.values(state.errors)[0]);
    return;
  }

  const fmt = currentFormat();
  const btn = document.getElementById('genBtn');
  btn.disabled = true;
  document.getElementById('genLabel').textContent = 'Generating…';
  document.getElementById('genIcon').textContent = '⏳';
  document.getElementById('progressCard').classList.add('visible');
  ['outputCard', 'excerptCard', 'metaCard', 'recsCard'].forEach(id =>
    document.getElementById(id).classList.remove('visible'));
  setProgress(0);

  const ticker = [1, 2, 3].map((s, i) => setTimeout(() => setProgress(s), (i + 1) * 3500));

  try {
    const res = await fetch('/.netlify/functions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articleType: state.articleType,
        fields: buildFields(),
        token: _sessionToken
      })
    });

    ticker.forEach(clearTimeout);

    let data;
    try { data = await res.json(); }
    catch { throw Object.assign(new Error('The server returned a response that could not be read.'), { code: 'incomplete_response' }); }

    if (!res.ok) {
      throw Object.assign(new Error(data.error || `Server returned ${res.status}`), { code: data.code });
    }

    setProgress(4);
    renderOutput(data, fmt);
    setProgress(5);
    document.getElementById('progressCard').classList.remove('visible');
  } catch (err) {
    ticker.forEach(clearTimeout);
    document.getElementById('progressCard').classList.remove('visible');
    showError(ERROR_TITLES[err.code] || 'Generation failed', err.message || String(err));
  }

  btn.disabled = false;
  document.getElementById('genLabel').textContent = fmt.buttonLabel;
  document.getElementById('genIcon').textContent = '⚡';
}

function renderOutput(data, fmt) {
  document.getElementById('html-code').value = data.html || '';
  document.getElementById('title-text').value = data.title || '';
  document.getElementById('preview-title').textContent = data.title || '';
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

  showWarnings(data.warnings);
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
