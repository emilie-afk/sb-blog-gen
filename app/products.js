// Confirmed-product selection. Gift-guide list articles may only use products a
// person has confirmed here. Three sources, one selection list:
//   Gift Products      live from SucculentsBox.com through the gift-catalog function
//   Live Plants        live from SucculentsBox.com through the same function
//   Add Manually       anything not in either list
// The old local plant list is available only after an explicit offline choice.
// Selections survive tab switches and keep the order they were added in.

const ProductPicker = (function () {
  let selected = [];
  let activeTab = 'gift';
  let container = null;
  let onChange = () => {};
  let getContext = () => ({ occasion: '', token: null });

  const RENDER_LIMIT = 100;
  const search = { gift: '', plants: '' };
  // The manual form keeps its values across re-renders: a validation error must
  // never wipe what the content user typed.
  const manualDraft = { title: '', url: '', price: '', type: '', image: '', notes: '' };
  let manualError = '';
  let notesOpen = new Set();

  // Live gift catalog state, cached per collection for the session.
  const giftCache = new Map();
  const gift = { status: 'idle', products: [], collection: '', error: '', truncated: false };
  const plantCache = new Map();
  const plants = { status: 'idle', products: [], collection: 'all', error: '', useFallback: false };

  function key(p) { return ((p.handle || '') + '|' + p.url).toLowerCase(); }
  function isSelected(p) { return selected.some(s => key(s) === key(p)); }

  function fromCatalog(p) {
    return {
      title: p.t, handle: p.h, price: p.p || '', image: p.i || '',
      url: 'https://succulentsbox.com/products/' + p.h,
      productType: p.cat || '', notes: '', source: 'local-fallback'
    };
  }

  function fromLive(p) {
    return {
      title: p.title, handle: p.handle, price: p.price || '', image: p.image || '',
      url: p.url, productType: p.productType || '', notes: '',
      sourceCollection: p.sourceCollection || '', source: p.source || 'live-gift-catalog'
    };
  }

  function toggle(rec) {
    if (isSelected(rec)) selected = selected.filter(s => key(s) !== key(rec));
    else selected.push(rec);
    render();
  }

  // ── Live gift catalog ──────────────────────────────────────────
  async function loadGiftCatalog(collectionOverride, force) {
    const ctx = getContext();
    search.gift = '';
    const cacheKey = collectionOverride || ('occasion:' + (ctx.occasion || '').toLowerCase());
    if (!force && giftCache.has(cacheKey)) {
      const hit = giftCache.get(cacheKey);
      gift.status = 'ready';
      gift.products = hit.products;
      gift.collection = hit.collection;
      gift.truncated = !!hit.truncated;
      gift.error = '';
      render();
      return;
    }
    gift.status = 'loading';
    gift.error = '';
    render();
    try {
      const res = await fetch('/.netlify/functions/gift-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: ctx.token,
          occasion: ctx.occasion || '',
          collection: collectionOverride || ''
        })
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.error || `The gift catalog request failed (HTTP ${res.status}).`);
      gift.status = 'ready';
      gift.products = Array.isArray(data.products) ? data.products : [];
      gift.collection = data.collection || '';
      gift.truncated = !!data.truncated;
      giftCache.set(cacheKey, { products: gift.products, collection: gift.collection, truncated: gift.truncated });
    } catch (err) {
      gift.status = 'error';
      gift.products = [];
      gift.error = err.message || String(err);
    }
    render();
  }

  function ensureGiftLoaded() {
    if (gift.status === 'idle') loadGiftCatalog('', false);
  }

  async function loadPlantCatalog(collectionOverride, force) {
    const ctx = getContext();
    const handle = collectionOverride || plants.collection || 'all';
    plants.useFallback = false;
    if (!force && plantCache.has(handle)) {
      const hit = plantCache.get(handle);
      Object.assign(plants, { status: 'ready', products: hit.products, collection: handle, error: '' });
      render();
      return;
    }
    plants.status = 'loading';
    plants.collection = handle;
    plants.error = '';
    render();
    try {
      const res = await fetch('/.netlify/functions/gift-catalog', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: ctx.token, catalogType: 'plants', collection: handle })
      });
      const data = await readResponse(res);
      if (!res.ok) throw new Error(data.error || `The live plant request failed (HTTP ${res.status}).`);
      plants.status = 'ready';
      plants.products = Array.isArray(data.products) ? data.products : [];
      plants.collection = data.collection || handle;
      plantCache.set(handle, { products: plants.products });
    } catch (err) {
      plants.status = 'error';
      plants.products = [];
      plants.error = err.message || String(err);
    }
    render();
  }

  function ensurePlantsLoaded() {
    if (plants.status === 'idle') loadPlantCatalog('all', false);
  }

  // The occasion drives which collection is inferred. When it changes and the
  // content user has not picked a collection by hand, follow the new occasion.
  let collectionChosenByUser = false;
  function contextChanged() {
    if (collectionChosenByUser) return;
    gift.status = 'idle';
    if (activeTab === 'gift' && container) loadGiftCatalog('', false);
  }

  // ── Manual entry ───────────────────────────────────────────────
  function validUrl(v) {
    try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch { return false; }
  }

  function addManual() {
    const title = manualDraft.title.trim();
    const url = manualDraft.url.trim();
    const image = manualDraft.image.trim();
    if (!title) { manualError = 'A product title is required.'; render(); return; }
    if (!validUrl(url)) { manualError = 'A valid http:// or https:// product URL is required.'; render(); return; }
    if (image && !validUrl(image)) { manualError = 'The image URL must be a valid http:// or https:// URL.'; render(); return; }
    selected.push({
      title, url, price: manualDraft.price.trim(), image,
      productType: manualDraft.type.trim(), notes: manualDraft.notes.trim(), handle: '', source: 'manual'
    });
    Object.keys(manualDraft).forEach(k => { manualDraft[k] = ''; });
    manualError = '';
    render();
  }

  // ── Rendering ──────────────────────────────────────────────────
  function renderSelected() {
    if (!selected.length) {
      return '<p class="muted">No products confirmed yet. Gift guides only write about products confirmed here.</p>';
    }
    return '<ol class="chosen-list">' + selected.map((p, i) => `
      <li>
        <div class="chosen-main">
          <span class="chosen-title">${esc(p.title)}</span>
          ${p.price ? `<span class="chosen-price">${esc(p.price)}</span>` : ''}
          <span class="chosen-tag src-${esc(p.source)}">${p.source === 'manual' ? 'manual' : p.source === 'live-gift-catalog' ? 'gift catalog' : p.source === 'live-plant-catalog' ? 'live plant' : 'offline plant list'}</span>
          <div class="chosen-url">${esc(p.url)}</div>
          ${notesOpen.has(i)
            ? `<textarea class="chosen-notes-input" rows="2" data-notes="${i}" placeholder="Confirmed facts only: what is in the box, pot size, confirmed pet safety, materials.">${esc(p.notes || '')}</textarea>`
            : (p.notes
                ? `<div class="chosen-notes">${esc(p.notes)} <button type="button" class="link-btn" onclick="ProductPicker.toggleNotes(${i})">edit</button></div>`
                : `<button type="button" class="link-btn" onclick="ProductPicker.toggleNotes(${i})">+ add factual notes</button>`)}
        </div>
        <div class="chosen-actions">
          <button type="button" class="mini-btn" ${i === 0 ? 'disabled' : ''} onclick="ProductPicker.moveUp(${i})" title="Move up">↑</button>
          <button type="button" class="mini-btn danger" onclick="ProductPicker.remove(${i})" title="Remove">✕</button>
        </div>
      </li>`).join('') + '</ol>';
  }

  function giftMatches(p, term) {
    if (!term) return true;
    const hay = [p.title, p.productType, (p.tags || []).join(' '), p.sourceCollection].join(' ').toLowerCase();
    return hay.includes(term);
  }

  function renderGiftTab() {
    const collectionSelect = `
      <div class="picker-controls">
        <label for="giftCollection">Gift collection</label>
        <select id="giftCollection">
          ${GIFT_COLLECTIONS.map(c => `<option value="${esc(c.handle)}"${gift.collection === c.handle ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}
        </select>
        <button type="button" class="secondary-btn" onclick="ProductPicker.reload()">↻ Reload</button>
      </div>`;

    if (gift.status === 'loading') {
      return collectionSelect + '<div class="picker-state">Loading gift products from SucculentsBox.com…</div>';
    }
    if (gift.status === 'error') {
      return collectionSelect + `<div class="picker-state error">
        <strong>Gift products could not be loaded.</strong>
        <div>${esc(gift.error)}</div>
        <div class="picker-state-actions">
          <button type="button" class="secondary-btn primary" onclick="ProductPicker.reload()">Try again</button>
        </div>
        <div class="hint">You can also switch to Live Plants or add products manually. Nothing you have already confirmed was lost.</div>
      </div>`;
    }
    if (!gift.products.length) {
      return collectionSelect + '<div class="picker-state">That collection returned no products. Try another collection, use Live Plants, or add the product manually.</div>';
    }
    const term = search.gift.trim().toLowerCase();
    const matches = gift.products.filter(p => giftMatches(p, term));
    const rows = matches.slice(0, RENDER_LIMIT);
    return collectionSelect + `
      <div class="field"><label>Search gift products</label>
        <input type="text" id="giftSearch" placeholder="Search by product name, type, tag or collection" value="${esc(search.gift)}"></div>
      <div class="catalog-grid">
        ${rows.map(p => {
          const on = isSelected(fromLive(p));
          return `<label class="catalog-item${on ? ' on' : ''}">
            <input type="checkbox" ${on ? 'checked' : ''} onchange="ProductPicker.toggleLive('${esc(p.handle)}')">
            <span class="ci-title">${esc(p.title)}</span>
            <span class="ci-meta">${esc(p.price || '')}${p.productType ? ' · ' + esc(p.productType) : ''}</span>
          </label>`;
        }).join('') || '<p class="muted">No gift products match that search. Try another word, or add the product manually.</p>'}
      </div>
      <div class="hint">Showing ${rows.length} of ${matches.length} matching products, ${gift.products.length} loaded.${gift.truncated ? ' The storefront time limit was reached, so search may be incomplete.' : ''}</div>`;
  }

  function renderPlantsTab() {
    const collectionSelect = `
      <div class="picker-controls">
        <label for="plantCollection">Plant collection</label>
        <select id="plantCollection">
          ${LIVE_PLANT_COLLECTIONS.map(c => `<option value="${esc(c.handle)}"${plants.collection === c.handle ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}
        </select>
        <button type="button" class="secondary-btn" onclick="ProductPicker.reloadPlants()">↻ Reload</button>
      </div>`;
    if (plants.status === 'loading') return collectionSelect + '<div class="picker-state">Loading live plants from SucculentsBox.com…</div>';
    if (plants.status === 'error' && !plants.useFallback) return collectionSelect + `<div class="picker-state error">
      <strong>Live plants could not be loaded.</strong><div>${esc(plants.error)}</div>
      <div class="picker-state-actions"><button type="button" class="secondary-btn primary" onclick="ProductPicker.reloadPlants()">Try again</button>
      <button type="button" class="secondary-btn" onclick="ProductPicker.useOfflinePlants()">Use offline plant list</button></div>
      <div class="hint">The offline list may be incomplete or out of date. Existing selections are preserved.</div></div>`;
    const term = search.plants.trim().toLowerCase();
    const sourceRows = plants.useFallback ? CATALOG.map(fromCatalog) : plants.products.map(fromLive);
    const rows = sourceRows.filter(p => giftMatches(p, term)).slice(0, 80);
    return collectionSelect + `
      ${plants.useFallback ? '<div class="picker-state"><strong>Offline plant list in use.</strong> It is a fallback and may not match the current store.</div>' : ''}
      <div class="field"><label>Search live plants</label>
        <input type="text" id="plantSearch" placeholder="Search by product title or category" value="${esc(search.plants)}"></div>
      <div class="catalog-grid">
        ${rows.map(p => {
          const on = isSelected(p);
          return `<label class="catalog-item${on ? ' on' : ''}">
            <input type="checkbox" ${on ? 'checked' : ''} onchange="ProductPicker.togglePlant('${esc(p.handle)}')">
            <span class="ci-title">${esc(p.title)}</span>
            <span class="ci-meta">${esc(p.price || '')}${p.productType ? ' · ' + esc(p.productType) : ''}</span>
          </label>`;
        }).join('') || '<p class="muted">No live plants match that search. Try another collection or add the product manually.</p>'}
      </div>`;
  }

  function renderManualTab() {
    return `<div class="manual-box">
      <div class="row2">
        <div class="field"><label>Product title *</label><input type="text" id="mp-title" data-draft="title" placeholder="e.g. Succulent Gift Box, 6 plants" value="${esc(manualDraft.title)}"></div>
        <div class="field"><label>Product URL *</label><input type="url" id="mp-url" data-draft="url" placeholder="https://succulentsbox.com/products/..." value="${esc(manualDraft.url)}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Price (optional)</label><input type="text" id="mp-price" data-draft="price" placeholder="$45.00" value="${esc(manualDraft.price)}"></div>
        <div class="field"><label>Product type (optional)</label><input type="text" id="mp-type" data-draft="type" placeholder="Gift box" value="${esc(manualDraft.type)}"></div>
      </div>
      <div class="field"><label>Image URL (optional)</label><input type="url" id="mp-image" data-draft="image" placeholder="https://cdn.shopify.com/..." value="${esc(manualDraft.image)}"></div>
      <div class="field"><label>Factual product notes (optional)</label><textarea id="mp-notes" data-draft="notes" rows="2" placeholder="Only confirmed facts. What ships in the box, pot size, confirmed pet safety, confirmed materials.">${esc(manualDraft.notes)}</textarea></div>
      ${manualError ? `<div class="inline-error">${esc(manualError)}</div>` : ''}
      <div class="manual-actions">
        <button type="button" class="secondary-btn primary" onclick="ProductPicker.addManual()">Add product</button>
      </div>
    </div>`;
  }

  const TABS = [
    { id: 'gift', label: '🎁 Gift Products' },
    { id: 'plants', label: '🌿 Live Plants' },
    { id: 'manual', label: '✏️ Add Manually' }
  ];

  function render() {
    if (!container) return;
    container.innerHTML = `
      <div class="picker-head">
        <span class="picker-count">${selected.length} product${selected.length === 1 ? '' : 's'} confirmed</span>
        <span class="picker-note">Gift products and live plants are loaded from SucculentsBox.com. You can also add a missing product manually.</span>
      </div>
      <div class="chosen">${renderSelected()}</div>
      <div class="picker-tabs">
        ${TABS.map(t => `<button type="button" class="picker-tab${activeTab === t.id ? ' on' : ''}" data-tab="${t.id}" onclick="ProductPicker.setTab('${t.id}')">${t.label}</button>`).join('')}
      </div>
      <div class="picker-body">
        ${activeTab === 'gift' ? renderGiftTab() : activeTab === 'plants' ? renderPlantsTab() : renderManualTab()}
      </div>`;

    bindSearch('giftSearch', 'gift');
    bindSearch('plantSearch', 'plants');

    const collection = document.getElementById('giftCollection');
    if (collection) collection.addEventListener('change', e => {
      collectionChosenByUser = true;
      loadGiftCatalog(e.target.value, false);
    });
    const plantCollection = document.getElementById('plantCollection');
    if (plantCollection) plantCollection.addEventListener('change', e => loadPlantCatalog(e.target.value, false));

    container.querySelectorAll('[data-draft]').forEach(el => {
      el.addEventListener('input', e => { manualDraft[e.target.dataset.draft] = e.target.value; });
    });

    container.querySelectorAll('[data-notes]').forEach(el => {
      el.addEventListener('input', e => { selected[Number(e.target.dataset.notes)].notes = e.target.value; });
    });

    onChange(selected);
  }

  function bindSearch(id, bucket) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', e => {
      search[bucket] = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const again = document.getElementById(id);
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    });
  }

  return {
    mount(el, context, changeHandler) {
      container = el;
      getContext = context || getContext;
      onChange = changeHandler || (() => {});
      render();
      if (activeTab === 'gift') ensureGiftLoaded();
    },
    getSelected() { return selected.map(p => Object.assign({}, p)); },
    count() { return selected.length; },
    setTab(tab) {
      activeTab = tab;           // selections are never touched by a tab switch
      manualError = '';
      render();
      if (tab === 'gift') ensureGiftLoaded();
      if (tab === 'plants') ensurePlantsLoaded();
    },
    reload() {
      const chosen = document.getElementById('giftCollection');
      loadGiftCatalog(chosen ? chosen.value : '', true);
    },
    reloadPlants() { loadPlantCatalog(plants.collection || 'all', true); },
    useOfflinePlants() { plants.useFallback = true; plants.status = 'ready'; render(); },
    togglePlant(handle) {
      const rows = plants.useFallback ? CATALOG.map(fromCatalog) : plants.products.map(fromLive);
      const row = rows.find(p => p.handle === handle);
      if (row) toggle(row);
    },
    toggleLive(handle) {
      const row = gift.products.find(p => p.handle === handle);
      if (row) toggle(fromLive(row));
    },
    toggleNotes(index) {
      if (notesOpen.has(index)) notesOpen.delete(index); else notesOpen.add(index);
      render();
    },
    remove(index) { selected.splice(index, 1); notesOpen.delete(index); render(); },
    moveUp(index) {
      if (index <= 0) return;
      [selected[index - 1], selected[index]] = [selected[index], selected[index - 1]];
      render();
    },
    addManual,
    contextChanged,
    _state() { return { activeTab, giftStatus: gift.status, giftCollection: gift.collection, plantStatus: plants.status, plantCollection: plants.collection, plantFallback: plants.useFallback }; }
  };
})();
