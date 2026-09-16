// Confirmed-product selection. Gift-guide list articles may only use products a
// person has confirmed here: catalog picks, or manual entries for gift boxes,
// arrangements, subscriptions and collections that are not in CATALOG yet.

const ProductPicker = (function () {
  let selected = [];       // array of confirmed product records
  let searchTerm = '';
  let manualOpen = false;
  let container = null;
  let onChange = () => {};

  // A catalog row becomes a confirmed product record. Gift metadata fields
  // (giftTypes, occasions, recipients, careLevel, lightLevel, petSafety,
  // priceBand, giftReady, ecoAttributes, active) can be added to CATALOG later
  // and carried through here. They are deliberately left unset for now.
  function fromCatalog(p) {
    return {
      title: p.t,
      handle: p.h,
      price: p.p || '',
      image: p.i || '',
      url: 'https://succulentsbox.com/products/' + p.h,
      productType: p.cat || '',
      notes: '',
      source: 'catalog'
    };
  }

  function key(p) { return (p.handle || '') + '|' + p.url; }

  function isSelected(p) { return selected.some(s => key(s) === key(p)); }

  function toggleCatalog(handle) {
    const row = CATALOG.find(p => p.h === handle);
    if (!row) return;
    const rec = fromCatalog(row);
    if (isSelected(rec)) selected = selected.filter(s => key(s) !== key(rec));
    else selected.push(rec);
    render();
  }

  function remove(index) {
    selected.splice(index, 1);
    render();
  }

  function moveUp(index) {
    if (index <= 0) return;
    [selected[index - 1], selected[index]] = [selected[index], selected[index - 1]];
    render();
  }

  function validUrl(v) {
    try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch { return false; }
  }

  function addManual() {
    const title = document.getElementById('mp-title').value.trim();
    const url = document.getElementById('mp-url').value.trim();
    const err = document.getElementById('mp-error');
    if (!title) { err.textContent = 'A product title is required.'; return; }
    if (!validUrl(url)) { err.textContent = 'A valid http:// or https:// product URL is required.'; return; }
    const image = document.getElementById('mp-image').value.trim();
    if (image && !validUrl(image)) { err.textContent = 'The image URL must be a valid http:// or https:// URL.'; return; }
    selected.push({
      title,
      url,
      price: document.getElementById('mp-price').value.trim(),
      image,
      productType: document.getElementById('mp-type').value.trim(),
      notes: document.getElementById('mp-notes').value.trim(),
      handle: '',
      source: 'manual'
    });
    manualOpen = false;
    render();
  }

  function catalogResults() {
    const term = searchTerm.toLowerCase();
    const rows = term
      ? CATALOG.filter(p => (p.t + ' ' + (p.cat || '')).toLowerCase().includes(term))
      : CATALOG.slice(0, 24);
    return rows.slice(0, 60);
  }

  function renderSelected() {
    if (!selected.length) {
      return '<p class="muted">No products confirmed yet. Gift guides only write about products confirmed here.</p>';
    }
    return '<ol class="chosen-list">' + selected.map((p, i) => `
      <li>
        <div class="chosen-main">
          <span class="chosen-title">${esc(p.title)}</span>
          ${p.price ? `<span class="chosen-price">${esc(p.price)}</span>` : ''}
          ${p.source === 'manual' ? '<span class="chosen-tag">manual</span>' : ''}
          <div class="chosen-url">${esc(p.url)}</div>
          ${p.notes ? `<div class="chosen-notes">${esc(p.notes)}</div>` : ''}
        </div>
        <div class="chosen-actions">
          <button type="button" class="mini-btn" ${i === 0 ? 'disabled' : ''} onclick="ProductPicker.moveUp(${i})" title="Move up">↑</button>
          <button type="button" class="mini-btn danger" onclick="ProductPicker.remove(${i})" title="Remove">✕</button>
        </div>
      </li>`).join('') + '</ol>';
  }

  function renderManual() {
    if (!manualOpen) {
      return '<button type="button" class="secondary-btn" onclick="ProductPicker.openManual()">➕ Add a product that is not in the catalog</button>';
    }
    return `<div class="manual-box">
      <div class="ref-label">Manual product</div>
      <div class="row2">
        <div class="field"><label>Product title *</label><input type="text" id="mp-title" placeholder="e.g. Succulent Gift Box, 6 plants"></div>
        <div class="field"><label>Product URL *</label><input type="url" id="mp-url" placeholder="https://succulentsbox.com/products/..."></div>
      </div>
      <div class="row2">
        <div class="field"><label>Price (optional)</label><input type="text" id="mp-price" placeholder="$45.00"></div>
        <div class="field"><label>Product type (optional)</label><input type="text" id="mp-type" placeholder="Gift box"></div>
      </div>
      <div class="field"><label>Image URL (optional)</label><input type="url" id="mp-image" placeholder="https://cdn.shopify.com/..."></div>
      <div class="field"><label>Factual product notes (optional)</label><textarea id="mp-notes" rows="2" placeholder="Only confirmed facts. What ships in the box, pot size, confirmed pet safety, confirmed materials."></textarea></div>
      <div class="inline-error" id="mp-error"></div>
      <div class="manual-actions">
        <button type="button" class="secondary-btn primary" onclick="ProductPicker.addManual()">Add product</button>
        <button type="button" class="secondary-btn" onclick="ProductPicker.closeManual()">Cancel</button>
      </div>
    </div>`;
  }

  function render() {
    if (!container) return;
    const rows = catalogResults();
    container.innerHTML = `
      <div class="picker-head">
        <span class="picker-count">${selected.length} product${selected.length === 1 ? '' : 's'} confirmed</span>
        <span class="picker-note">The catalog below is a working list, not the full Shopify catalog. Add anything missing manually.</span>
      </div>
      <div class="chosen">${renderSelected()}</div>
      <div class="field" style="margin-top:14px;">
        <label>Search the catalog</label>
        <input type="text" id="productSearch" placeholder="Search by product title or category" value="${esc(searchTerm)}">
      </div>
      <div class="catalog-grid">
        ${rows.map(p => {
          const on = isSelected(fromCatalog(p));
          return `<label class="catalog-item${on ? ' on' : ''}">
            <input type="checkbox" ${on ? 'checked' : ''} onchange="ProductPicker.toggleCatalog('${esc(p.h)}')">
            <span class="ci-title">${esc(p.t)}</span>
            <span class="ci-meta">${esc(p.p || '')} ${p.cat ? '· ' + esc(p.cat) : ''}</span>
          </label>`;
        }).join('') || '<p class="muted">No catalog products match that search. Add the product manually instead.</p>'}
      </div>
      <div class="manual-wrap">${renderManual()}</div>`;

    const search = document.getElementById('productSearch');
    if (search) {
      search.addEventListener('input', e => {
        searchTerm = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const again = document.getElementById('productSearch');
        again.focus();
        again.setSelectionRange(pos, pos);
      });
    }
    onChange(selected);
  }

  return {
    mount(el, changeHandler) {
      container = el;
      onChange = changeHandler || (() => {});
      render();
    },
    getSelected() { return selected.slice(); },
    count() { return selected.length; },
    toggleCatalog,
    remove,
    moveUp,
    addManual,
    openManual() { manualOpen = true; render(); },
    closeManual() { manualOpen = false; render(); }
  };
})();
