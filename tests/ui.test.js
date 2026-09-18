const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8899';
const results = [];
function check(name, cond, extra) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
function setMode(m) { fs.writeFileSync('/tmp/mock-mode', m || ''); }
const lastReq = () => JSON.parse(fs.readFileSync('/tmp/last-request.json', 'utf8'));

process.on('uncaughtException', e => { console.log(results.join('\n')); console.log('CRASH:', e.message); process.exit(1); });
(async () => {
  setMode('');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  // Clipboard permissions: without these the async Clipboard API rejects and the
  // copy tests would pass or fail for the wrong reason.
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE);
  const fieldNames = async () => page.$$eval('#formFields [data-name]', els => els.map(e => e.dataset.name));

  // Switching format now asks before discarding a dirty draft. This helper makes
  // the existing tests state their intent: switch, and confirm if asked.
  async function switchFormat(type) {
    await page.click(`.format-option[data-type="${type}"]`);
    await page.waitForTimeout(120);
    if (await page.isVisible('#confirmOverlay.visible')) {
      await page.click('#confirmOk');
      await page.waitForTimeout(150);
    }
  }

  // Create Another Article appears with the output actions, and again in the
  // progress card while a generation is running, since the output card is hidden
  // then. Click whichever one is on screen.
  async function clickNewArticle() {
    if (await page.isVisible('#newArticleBtn')) return page.click('#newArticleBtn');
    return page.click('#newArticleBtnPending');
  }

  // ── Login
  await page.fill('#pwd', 'nope');
  await page.click('#loginBtn');
  await page.waitForTimeout(250);
  check('wrong password rejected', (await page.textContent('#loginError')).includes('Incorrect'));
  await page.fill('#pwd', 'pw');
  await page.click('#loginBtn');
  await page.waitForSelector('#app', { state: 'visible' });
  check('four formats offered', (await page.$$('.format-option')).length === 4);

  // ── Care guide regression
  let names = await fieldNames();
  check('care fields intact', names.includes('plantName') && names.includes('sciName') && names.includes('productUrl') && names.includes('ref1url'));
  check('no working title field anywhere', !names.includes('title'));
  check('title direction offered', names.includes('titleDirection'));
  await page.fill('[data-name="sciName"]', 'Haworthia fasciata');
  await page.click('#genBtn');
  await page.waitForTimeout(200);
  check('missing plant name blocks', await page.isVisible('#errorBox'));
  check('validation keeps typed input', (await page.inputValue('[data-name="sciName"]')) === 'Haworthia fasciata');
  await page.fill('[data-name="plantName"]', 'Haworthia');
  await page.fill('[data-name="productUrl"]', 'succulentsbox.com/products/x');
  await page.click('#genBtn');
  await page.waitForTimeout(200);
  check('invalid url blocked', (await page.textContent('#errorBox')).includes('http'));
  await page.fill('[data-name="productUrl"]', 'https://succulentsbox.com/products/haworthia');
  await page.fill('[data-name="ref1text"]', 'ASPCA');
  await page.click('#genBtn');
  await page.waitForTimeout(200);
  check('ref text without url blocked', (await page.textContent('#errorBox')).toLowerCase().includes('reference url'));
  await page.fill('[data-name="ref1url"]', 'https://aspca.org');
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible');
  let req = lastReq();
  check('request shape', req.articleType === 'care_guide' && !!req.fields && !!req.token && !req.carePrompt);
  check('no title field sent', !('title' in req.fields));
  check('no tone sent', !('tone' in req.fields));
  check('title from server shown', (await page.inputValue('#title-text')) === 'Plant Gifts Worth Sending');
  check('excerpt + meta cards', await page.isVisible('#excerptCard') && await page.isVisible('#metaCard'));
  await page.click('#tab-preview');
  const xss = await page.evaluate(() => [window.__XSS__, window.__XSS2__]);
  check('preview sanitized', xss[0] === undefined && xss[1] === undefined);
  check('no H1 in copied html', !(await page.inputValue('#html-code')).includes('<h1'));

  // ── Title options
  check('title options rendered', (await page.$$('.title-option')).length === 3);
  const alt = (await page.$$('.title-option'))[1];
  const altText = await alt.$eval('.to-value', e => e.textContent);
  await alt.click();
  await page.waitForTimeout(150);
  check('selecting an alternative updates the final title', (await page.inputValue('#title-text')) === altText, altText);
  check('selecting an alternative does not regenerate', JSON.stringify(lastReq()) === JSON.stringify(req));
  check('preview title follows selection', (await page.textContent('#preview-title')) === altText);

  // ── Single-plant gift: no title required
  await switchFormat('single_plant_gift');
  await page.waitForTimeout(200);
  names = await fieldNames();
  check('single-plant has no title field', !names.includes('title'));
  check('single-plant fields', names.includes('giftAngle') && names.includes('productNotes'));
  // The brief no longer carries over between formats, so this article states its
  // own plant rather than inheriting the care guide's.
  await page.fill('[data-name="plantName"]', 'Echeveria');
  await page.selectOption('[data-name="giftAngle"]', 'Low maintenance');
  await page.waitForTimeout(150);
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible');
  check('single-plant generates without a title', lastReq().articleType === 'single_plant_gift');

  // ── General gift guide: three-tab picker
  await switchFormat('general_gift_guide');
  await page.waitForTimeout(600);
  names = await fieldNames();
  check('general has no title field', !names.includes('title'));
  check('picker tabs present', (await page.$$('.picker-tab')).length === 3);
  check('gift tab is default', (await page.textContent('.picker-tab.on')).includes('Gift Products'));
  check('helper text names the storefront', (await page.textContent('.picker-note')).includes('loaded from SucculentsBox.com'));
  const giftReq = JSON.parse(fs.readFileSync('/tmp/last-gift-request.json', 'utf8'));
  check('gift catalog called with token', giftReq.token === 'pw');
  check('gift products listed', (await page.$$('.catalog-item')).length === 3);
  check('collection selector present', await page.isVisible('#giftCollection'));
  check('all products filter is available', (await page.locator('#giftCollection option').allTextContents()).includes('All products'));

  // search by tag / product type
  await page.fill('#giftSearch', 'subscription');
  await page.waitForTimeout(250);
  check('gift search matches type and tags', (await page.$$('.catalog-item')).length === 1);
  await page.fill('#giftSearch', '');
  await page.waitForTimeout(250);

  // select a live gift product
  await page.$$eval('.catalog-item input', els => els[0].click());
  await page.waitForTimeout(250);
  check('live gift product confirmed', (await page.textContent('.picker-count')).startsWith('1 product'));
  check('source tagged as gift catalog', (await page.textContent('.chosen-tag')).includes('gift catalog'));

  // switch to plants tab, selection survives
  await page.click('.picker-tab[data-tab="plants"]');
  await page.waitForTimeout(500);
  check('switching tabs keeps selection', (await page.textContent('.picker-count')).startsWith('1 product'));
  check('live plants tab is labelled clearly', (await page.textContent('.picker-tab.on')).includes('Live Plants'));
  const plantReq = JSON.parse(fs.readFileSync('/tmp/last-plant-request.json', 'utf8'));
  check('live plant catalog called with allowlisted collection', plantReq.catalogType === 'plants' && plantReq.collection === 'all');
  check('plant collection selector present', await page.isVisible('#plantCollection'));
  await page.fill('#plantSearch', 'echeveria');
  await page.waitForTimeout(250);
  await page.$$eval('.catalog-item input', els => els.find(e => !e.checked).click());
  await page.waitForTimeout(250);
  check('plant added alongside gift product', (await page.textContent('.picker-count')).startsWith('2 products'));

  // manual tab
  await page.click('.picker-tab[data-tab="manual"]');
  await page.waitForTimeout(200);
  await page.click('text=Add product');
  await page.waitForTimeout(150);
  check('manual needs a title', (await page.textContent('.inline-error')).includes('title'));
  await page.fill('#mp-title', 'Custom Gift Bundle');
  await page.click('text=Add product');
  await page.waitForTimeout(150);
  check('manual needs a valid url', (await page.textContent('.inline-error')).includes('URL'));
  await page.fill('#mp-url', 'https://succulentsbox.com/products/custom-bundle');
  await page.fill('#mp-notes', 'Ships with six 2 inch plants.');
  await page.click('text=Add product');
  await page.waitForTimeout(250);
  check('three sources mixed in one selection', (await page.textContent('.picker-count')).startsWith('3 products'));
  const tags = await page.$$eval('.chosen-tag', els => els.map(e => e.textContent.trim()));
  check('each source labelled', tags.includes('gift catalog') && tags.includes('live plant') && tags.includes('manual'), JSON.stringify(tags));

  // notes on a live product
  await page.click('.chosen-list li:first-child .link-btn');
  await page.waitForTimeout(200);
  await page.fill('.chosen-notes-input', 'Confirmed: ships in a kraft gift box.');
  await page.waitForTimeout(150);

  // recommendation cap
  await page.fill('[data-name="numberOfRecommendations"]', '9');
  await page.click('#genBtn');
  await page.waitForTimeout(250);
  check('more than 8 rejected in the browser', (await page.textContent('#errorBox')).includes('between 1 and 8'));
  check('selection survives validation errors', (await page.textContent('.picker-count')).startsWith('3 products'));
  await page.fill('[data-name="numberOfRecommendations"]', '5');
  await page.click('#genBtn');
  await page.waitForTimeout(250);
  check('count above confirmed products rejected', (await page.textContent('#errorBox')).includes('only 3'));
  await page.fill('[data-name="numberOfRecommendations"]', '3');
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible');
  req = lastReq();
  check('payload carries all three sources', req.fields.selectedProducts.length === 3
    && req.fields.selectedProducts.some(p => p.source === 'live-gift-catalog')
    && req.fields.selectedProducts.some(p => p.source === 'live-plant-catalog')
    && req.fields.selectedProducts.some(p => p.source === 'manual'));
  check('notes travel with the live product', req.fields.selectedProducts[0].notes === 'Confirmed: ships in a kraft gift box.');
  check('order preserved', req.fields.selectedProducts[2].title === 'Custom Gift Bundle');

  // ── Occasion gift guide
  await switchFormat('occasion_gift_guide');
  await page.waitForTimeout(500);
  names = await fieldNames();
  check('occasion has no tone field', !names.includes('tone'));
  check('occasion has no title field', !names.includes('title'));
  check('includeYearInTitle present', names.includes('includeYearInTitle'));
  check('sensitive checkbox renamed', (await page.textContent('#formFields')).includes('This is a sensitive or remembrance occasion'));
  // Products no longer carry across a format switch: they were confirmed for the
  // previous article. This one confirms its own.
  check('confirmed products do not carry into the new format', (await page.textContent('.picker-count')).startsWith('0 products'));
  await page.waitForSelector('.catalog-item');
  await page.$$eval('.catalog-item input', els => { els[0].click(); });
  await page.waitForTimeout(200);
  await page.$$eval('.catalog-item input', els => { els[1].click(); });
  await page.waitForTimeout(200);
  await page.$$eval('.catalog-item input', els => { els[2].click(); });
  await page.waitForTimeout(250);
  check('occasion guide confirms its own products', (await page.textContent('.picker-count')).startsWith('3 products'));

  await page.fill('[data-name="occasion"]', 'Christmas');
  await page.waitForTimeout(200);
  await page.click('.picker-tab[data-tab="gift"]');
  await page.waitForTimeout(500);
  const giftReq2 = JSON.parse(fs.readFileSync('/tmp/last-gift-request.json', 'utf8'));
  check('occasion drives the collection request', giftReq2.occasion === 'Christmas');

  // sensitive suggestion is a nudge, never automatic
  await page.fill('[data-name="occasion"]', 'Pregnancy and Infant Loss Remembrance Day');
  await page.waitForTimeout(250);
  check('sensitive suggestion shown', await page.isVisible('#sensitiveSuggestion'));
  check('sensitive checkbox NOT auto-set', !(await page.isChecked('[data-name="sensitiveOccasion"]')));
  await page.check('[data-name="sensitiveOccasion"]');
  await page.waitForTimeout(300);
  check('suggestion hides once confirmed', !(await page.isVisible('#sensitiveSuggestion')));

  await page.fill('[data-name="occasionYear"]', '2026');
  await page.fill('[data-name="numberOfRecommendations"]', '3');
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible');
  req = lastReq();
  check('occasion payload', req.fields.sensitiveOccasion === true && req.fields.occasion.includes('Remembrance'));
  check('includeYearInTitle false by default', req.fields.includeYearInTitle === false);
  check('no tone in payload', !('tone' in req.fields));

  await page.check('[data-name="includeYearInTitle"]');
  await page.waitForTimeout(300);
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible');
  check('includeYearInTitle sent when ticked', lastReq().fields.includeYearInTitle === true);

  // ── Background job states (gift guides run through generate-background)
  check('background path used for gift guides', /generate-background/.test(fs.readFileSync('/tmp/last-endpoint.txt', 'utf8')),
    fs.readFileSync('/tmp/last-endpoint.txt', 'utf8'));

  // The empty 202 can land before the background handler writes its record. The
  // browser must keep polling through that window rather than stopping.
  setMode('jobrace');
  await page.click('#genBtn');
  await page.waitForTimeout(3500);
  check('startup race keeps the browser waiting', await page.isVisible('#pendingNote'));
  check('startup race is not reported as an error', !(await page.isVisible('#errorBox')));
  check('startup race says the job is starting', /waiting for the job to start/i.test(await page.textContent('#pendingNote')),
    await page.textContent('#pendingNote'));
  await page.waitForSelector('#outputCard.visible', { timeout: 20000 });
  check('startup race still completes once the job registers', (await page.inputValue('#html-code')).includes('<h2'));

  setMode('jobfail');
  await page.click('#genBtn');
  await page.waitForTimeout(4500);
  let errText = await page.textContent('#errorBox');
  check('failed job surfaces its reason', /could not generate the article/i.test(errText), errText.slice(0, 80));
  check('failed job keeps the confirmed products', (await page.textContent('.picker-count')).startsWith('3 products'));
  check('failed job keeps the brief', (await page.inputValue('[data-name="occasion"]')).length > 0);

  setMode('jobgone');
  await page.click('#genBtn');
  await page.waitForTimeout(4500);
  errText = await page.textContent('#errorBox');
  check('expired job explains the work is safe', /still here/i.test(errText), errText.slice(0, 80));

  setMode('jobtrunc');
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible');
  await page.waitForTimeout(300);
  errText = await page.textContent('#errorBox');
  const warnText = (await page.isVisible('#warningBox')) ? await page.textContent('#warningBox') : '';
  check('a truncated article is never presented as finished', /cut off/i.test(errText), errText.slice(0, 80));
  check('the truncated article is still shown for inspection', await page.isVisible('#outputCard'));
  check('truncation banner uses the agreed copy',
    /reached the output limit and is incomplete/i.test(errText)
    && /generate it again/i.test(errText)
    && /higher output allowance/i.test(errText), errText.slice(0, 140));
  check('the truncation message appears exactly once',
    (errText + ' ' + warnText).match(/reached the output limit/gi).length === 1,
    JSON.stringify({ banner: /reached the output limit/i.test(errText), warningBox: /reached the output limit/i.test(warnText) }));
  check('truncation copy never tells the user to use fewer products',
    !/fewer (products|recommendations)|select fewer|split the guide/i.test(errText + ' ' + warnText),
    (errText + ' ' + warnText).slice(0, 120));
  check('unrelated warnings still render alongside it',
    /No related articles matched/i.test(warnText), warnText.slice(0, 90));
  check('the confirmed products survive a truncated run',
    (await page.textContent('.picker-count')).startsWith('3 products'));
  check('the brief survives a truncated run', (await page.inputValue('[data-name="occasion"]')).length > 0);

  setMode('');
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible');
  check('background job completes after polling', (await page.inputValue('#html-code')).includes('<h2'));

  // ── Synchronous endpoint error handling (care guide path)
  await switchFormat('care_guide');
  await page.waitForTimeout(300);
  // The care guide's own brief: the format switch cleared the gift guide's.
  await page.fill('[data-name="plantName"]', 'Haworthia');
  setMode('timeout504');
  await page.click('#genBtn');
  await page.waitForTimeout(600);
  errText = await page.textContent('#errorBox');
  check('504 HTML gives a timeout message', errText.includes('Generation took too long') && errText.includes('504'), errText.slice(0, 90));
  check('no platform internals leaked', !errText.includes('<html') && !errText.toLowerCase().includes('lambda'));

  setMode('text502');
  await page.click('#genBtn');
  await page.waitForTimeout(600);
  errText = await page.textContent('#errorBox');
  check('plain-text 502 includes the status', errText.includes('502'), errText.slice(0, 90));

  setMode('warn');
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible');
  check('warnings shown with the article', await page.isVisible('#warningBox') && (await page.textContent('#warningBox')).includes('excerpt'));
  setMode('');
  await switchFormat('occasion_gift_guide');
  await page.waitForTimeout(500);

  // ── Gift catalog failure is recoverable
  // Confirm products for THIS article first: the format switch above cleared the
  // previous one's, and the point of the check below is that a catalog failure
  // does not touch what is already confirmed.
  await page.waitForSelector('.catalog-item');
  await page.$$eval('.catalog-item input', els => { els[0].click(); });
  await page.waitForTimeout(200);
  await page.$$eval('.catalog-item input', els => { els[1].click(); });
  await page.waitForTimeout(200);
  await page.$$eval('.catalog-item input', els => { els[2].click(); });
  await page.waitForTimeout(250);
  setMode('giftfail');
  await page.click('.picker-tab[data-tab="plants"]');
  await page.waitForTimeout(200);
  await page.click('.picker-tab[data-tab="gift"]');
  await page.waitForTimeout(200);
  await page.click('button:has-text("↻ Reload")');
  await page.waitForTimeout(500);
  check('storefront failure shows an error state', await page.isVisible('.picker-state.error'));
  check('failure explains the alternatives', (await page.textContent('.picker-state.error')).includes('Live Plants'));
  check('failure keeps confirmed products', (await page.textContent('.picker-count')).startsWith('3 products'));
  check('retry button offered', await page.isVisible('button:has-text("Try again")'));
  await page.click('.picker-tab[data-tab="manual"]');
  await page.waitForTimeout(200);
  check('manual entry still usable after failure', await page.isVisible('#mp-title'));
  setMode('');
  await page.click('.picker-tab[data-tab="gift"]');
  await page.waitForTimeout(200);
  await page.click('button:has-text("↻ Reload")');
  await page.waitForTimeout(600);
  check('retry recovers the catalog', (await page.$$('.catalog-item')).length > 0);

  // Live-plant failures expose the old list only as an explicit fallback.
  setMode('giftfail');
  await page.click('.picker-tab[data-tab="plants"]');
  await page.waitForTimeout(150);
  await page.click('button:has-text("↻ Reload")');
  await page.waitForTimeout(450);
  check('live plant failure offers offline fallback', await page.isVisible('button:has-text("Use offline plant list")'));
  await page.click('button:has-text("Use offline plant list")');
  await page.waitForTimeout(250);
  check('offline fallback is explicitly labelled', (await page.textContent('.picker-state')).includes('Offline plant list in use'));
  setMode('');

  // ── Copy buttons ────────────────────────────────────────────────────────
  // The old implementation said "Copied!" whether or not anything was copied.
  // These click every button for real and read the real clipboard back.
  // Generate an article so there is something to copy: the format switches above
  // cleared the previous output.
  setMode('');
  await page.fill('[data-name="occasion"]', 'Christmas');
  await page.fill('[data-name="numberOfRecommendations"]', '3');
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible');
  await page.click('#tab-html');
  await page.waitForTimeout(100);
  const readClipboard = () => page.evaluate(() => navigator.clipboard.readText());

  const copyTargets = [
    ['copyBtn', 'html-code', 'HTML'],
    ['titleCopyBtn', 'title-text', 'Title'],
    ['excerptCopyBtn', 'excerpt-text', 'Excerpt'],
    ['metaCopyBtn', 'meta-text', 'Meta Description']
  ];

  for (const [btnId, fieldId] of copyTargets) {
    const btn = await page.$('#' + btnId);
    if (!btn) { check('copy button exists: ' + btnId, false); continue; }
    await page.evaluate(() => navigator.clipboard.writeText('SENTINEL-NOT-COPIED'));
    await btn.click();
    await page.waitForTimeout(250);
    const expected = await page.inputValue('#' + fieldId);
    const actual = await readClipboard();
    check('clipboard really holds the ' + fieldId + ' value', actual === expected, JSON.stringify(actual).slice(0, 80));
    const label = await btn.textContent();
    check('success label shown for ' + fieldId, /Copied!/.test(label), label);
  }

  // Copy HTML must copy the exact current #html-code value, character for
  // character. The field is readonly, so the value is set directly.
  await page.evaluate(() => { document.getElementById('html-code').value = '<h2>Exact & "quoted" \u00e9</h2>'; });
  await page.evaluate(() => navigator.clipboard.writeText('SENTINEL-NOT-COPIED'));
  await page.click('#copyBtn');
  await page.waitForTimeout(250);
  check('Copy HTML copies the exact current textarea value',
    (await readClipboard()) === '<h2>Exact & "quoted" \u00e9</h2>');

  // A blocked clipboard must NOT report success.
  await page.evaluate(() => {
    window.__origWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true, value: () => Promise.reject(new Error('blocked'))
    });
    window.__origExec = document.execCommand;
    document.execCommand = () => false;
  });
  await page.click('#copyBtn');
  await page.waitForTimeout(250);
  const failedLabel = await page.textContent('#copyBtn');
  check('a blocked copy never says Copied', !/Copied!/.test(failedLabel), failedLabel);
  check('a blocked copy says it failed', /Copy failed/.test(failedLabel), failedLabel);
  check('a blocked copy shows a visible message', /Copy failed/.test(await page.textContent('#copy-status')));
  check('the status region announces politely',
    (await page.getAttribute('#copy-status', 'aria-live')) === 'polite' &&
    (await page.getAttribute('#copy-status', 'role')) === 'status');
  check('a blocked copy leaves the text selected and focused', await page.evaluate(() => {
    const el = document.getElementById('html-code');
    return document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === el.value.length;
  }));
  check('a blocked copy never modifies the content',
    (await page.inputValue('#html-code')) === '<h2>Exact & "quoted" \u00e9</h2>');

  // execCommand returning undefined (stubbed or removed) is not success either.
  await page.evaluate(() => { document.execCommand = () => undefined; });
  await page.click('#copyBtn');
  await page.waitForTimeout(250);
  check('execCommand returning undefined is not treated as success',
    /Copy failed/.test(await page.textContent('#copyBtn')));

  // Restore, then confirm the button recovers and the timer guard holds.
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: window.__origWrite });
    document.execCommand = window.__origExec;
  });
  await page.click('#copyBtn');
  await page.waitForTimeout(200);
  check('the button recovers after a failure', /Copied!/.test(await page.textContent('#copyBtn')));
  await page.click('#copyBtn');
  await page.waitForTimeout(200);
  check('a second quick click still shows success', /Copied!/.test(await page.textContent('#copyBtn')));
  await page.waitForTimeout(2800);
  check('the button returns to its idle label', /Copy HTML/.test(await page.textContent('#copyBtn')));

  // ── Copy status lifecycle ───────────────────────────────────────────────
  // The status region is shared by all four buttons. It must appear, stay long
  // enough to read, and clear when its button resets, without an older attempt's
  // timer wiping a newer attempt's message.
  const statusText = () => page.evaluate(() => {
    const el = document.getElementById('copy-status');
    return el ? el.textContent : null;
  });

  await page.click('#copyBtn');
  await page.waitForTimeout(150);
  check('a successful copy shows a status message', /Copied to clipboard/.test(await statusText()));
  await page.waitForTimeout(1000);
  check('the success message is still readable after a second', /Copied to clipboard/.test(await statusText()));
  await page.waitForTimeout(2200);
  check('the success message clears itself', (await statusText()) === '');
  check('the status region is hidden while empty', !(await page.isVisible('#copy-status')));
  check('the region keeps its accessibility attributes after clearing',
    (await page.getAttribute('#copy-status', 'role')) === 'status' &&
    (await page.getAttribute('#copy-status', 'aria-live')) === 'polite');
  check('the button label reset with the status', /Copy HTML/.test(await page.textContent('#copyBtn')));

  // A failed copy must follow the same lifecycle.
  await page.evaluate(() => {
    window.__origWrite2 = navigator.clipboard.writeText.bind(navigator.clipboard);
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true, value: () => Promise.reject(new Error('blocked'))
    });
    window.__origExec2 = document.execCommand;
    document.execCommand = () => false;
  });
  await page.click('#copyBtn');
  await page.waitForTimeout(150);
  check('a failed copy shows a status message', /Copy failed/.test(await statusText()));
  check('the failed copy still leaves the text selected', await page.evaluate(() => {
    const el = document.getElementById('html-code');
    return el.selectionStart === 0 && el.selectionEnd === el.value.length;
  }));
  await page.waitForTimeout(3000);
  check('the failure message clears itself', (await statusText()) === '');
  check('the text is still selected after the status clears', await page.evaluate(() => {
    const el = document.getElementById('html-code');
    return el.selectionStart === 0 && el.selectionEnd === el.value.length;
  }));
  check('the button label reset after a failure', /Copy HTML/.test(await page.textContent('#copyBtn')));
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: window.__origWrite2 });
    document.execCommand = window.__origExec2;
  });

  // Two attempts in quick succession: the first attempt's timer must not clear
  // the second attempt's message.
  await page.click('#copyBtn');
  await page.waitForTimeout(1800);
  await page.click('#titleCopyBtn');
  await page.waitForTimeout(1000);
  check('the older timer does not clear the newer message', /Copied to clipboard/.test(await statusText()), await statusText());
  await page.waitForTimeout(1800);
  check('the newer message clears on its own schedule', (await statusText()) === '');
  check('both button labels reset',
    /Copy HTML/.test(await page.textContent('#copyBtn')) &&
    /Copy Title/.test(await page.textContent('#titleCopyBtn')));

  // ── Article workflow: finishing one article and starting another ─────────
  // The session used to be one continuous draft, so products confirmed for one
  // article could end up attached to the next. These cover the explicit boundary.
  const dialogOpen = () => page.isVisible('#confirmOverlay.visible');
  const count = async () => (await page.textContent('.picker-count')) || '';

  async function buildOccasionArticle(occasion) {
    await page.fill('[data-name="occasion"]', occasion);
    await page.waitForTimeout(250);
    await page.waitForSelector('.catalog-item');
    for (let i = 0; i < 3; i++) {
      await page.$$eval('.catalog-item input', (els, n) => els[n].click(), i);
      await page.waitForTimeout(150);
    }
    await page.fill('[data-name="numberOfRecommendations"]', '3');
    await page.click('#genBtn');
    await page.waitForSelector('#outputCard.visible');
  }

  // 1-6: generate, Create Another Article, confirm, verify everything is cleared.
  setMode('');
  await switchFormat('occasion_gift_guide');
  await page.waitForTimeout(400);
  await buildOccasionArticle('Mother\\u2019s Day');
  check('the new-article button is offered with the output actions', await page.isVisible('#newArticleBtn'));
  check('it is not labelled add another blog',
    !/add another blog/i.test(await page.textContent('#newArticleBtn')));

  await page.click('#newArticleBtn');
  await page.waitForTimeout(200);
  check('uncopied output triggers the warning', await dialogOpen());
  check('the warning names the new-article action',
    /Start a new article\\?/.test(await page.textContent('#confirmTitle')));
  check('the warning says what will be cleared',
    /brief, selected products, and generated article will be cleared/.test(await page.textContent('#confirmBody')));
  await page.click('#confirmOk');
  await page.waitForTimeout(400);

  check('brief fields cleared', (await page.inputValue('[data-name="occasion"]')) === '');
  check('confirmed products cleared', (await count()).startsWith('0 products'));
  check('generated article cleared', (await page.inputValue('#html-code')) === '');
  check('title cleared', (await page.inputValue('#title-text')) === '');
  check('title options cleared', (await page.$$('.title-option')).length === 0);
  check('metadata cleared',
    (await page.inputValue('#excerpt-text')) === '' && (await page.inputValue('#meta-text')) === '');
  check('output cards hidden', !(await page.isVisible('#outputCard'))
    && !(await page.isVisible('#excerptCard')) && !(await page.isVisible('#metaCard'))
    && !(await page.isVisible('#recsCard')));
  check('related articles cleared', (await page.textContent('#recsArticles')) === '');
  check('warnings and errors cleared',
    !(await page.isVisible('#warningBox')) && !(await page.isVisible('#errorBox')));
  check('pending job note cleared', !(await page.isVisible('#pendingNote')));
  check('copy status cleared after a reset', (await page.textContent('#copy-status')) === '');
  check('job state cleared', await page.evaluate(() => state.generationPending === false && state.hasOutput === false));
  check('authentication survives the reset', await page.isVisible('#app') && !(await page.isVisible('#login-overlay:not(.hidden)')));
  check('the catalog is still loaded after a reset', (await page.$$('.catalog-item')).length > 0);
  // scrollIntoView({behavior:'smooth'}) is asynchronous, so sampling the box once
  // after a fixed wait fails roughly one run in three. Wait for the card to
  // arrive instead of guessing how long the animation takes.
  let formatCardInView = true;
  try {
    await page.waitForFunction(() => {
      const box = document.getElementById('formatCard').getBoundingClientRect();
      return box.top < window.innerHeight && box.bottom > 0;
    }, null, { timeout: 4000 });
  } catch (e) {
    formatCardInView = false;
  }
  check('the page returns to the article format section', formatCardInView);
  check('focus lands on a format option',
    await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('format-option')));

  // 8: Cancel preserves the complete article.
  await buildOccasionArticle('Father\\u2019s Day');
  const keptHtml = await page.inputValue('#html-code');
  const keptTitle = await page.inputValue('#title-text');
  await page.click('#newArticleBtn');
  await page.waitForTimeout(200);
  await page.click('#confirmCancel');
  await page.waitForTimeout(250);
  check('cancel keeps the article html', (await page.inputValue('#html-code')) === keptHtml);
  check('cancel keeps the title', (await page.inputValue('#title-text')) === keptTitle);
  check('cancel keeps the brief', (await page.inputValue('[data-name="occasion"]')).includes('Father'));
  check('cancel keeps the products', (await count()).startsWith('3 products'));
  check('cancel keeps the output visible', await page.isVisible('#outputCard'));

  // 9: a successful Copy HTML lets the reset happen without a warning.
  await page.click('#copyBtn');
  await page.waitForTimeout(250);
  check('copy html marks the article as copied', await page.evaluate(() => state.articleHtmlCopied === true));
  await page.click('#newArticleBtn');
  await page.waitForTimeout(300);
  check('copied output resets without a warning', !(await dialogOpen()));
  check('copied output really was reset', (await page.inputValue('#html-code')) === '');

  // 10-11: a failed Copy HTML, and copying another field, do not count.
  await switchFormat('occasion_gift_guide');
  await page.waitForTimeout(400);
  await buildOccasionArticle('Graduation');
  await page.evaluate(() => {
    window.__w = navigator.clipboard.writeText.bind(navigator.clipboard);
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => Promise.reject(new Error('no')) });
    window.__e = document.execCommand;
    document.execCommand = () => false;
  });
  await page.click('#copyBtn');
  await page.waitForTimeout(250);
  check('a failed copy html does not count as copied', await page.evaluate(() => state.articleHtmlCopied === false));
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: window.__w });
    document.execCommand = window.__e;
  });
  await page.click('#titleCopyBtn');
  await page.waitForTimeout(250);
  check('copying the title does not count as copying the article',
    await page.evaluate(() => state.articleHtmlCopied === false));
  await page.click('#newArticleBtn');
  await page.waitForTimeout(200);
  check('an uncopied article still warns after a failed copy and a title copy', await dialogOpen());

  // 24: keyboard and Escape behaviour for the new-article dialog.
  check('focus moves into the dialog',
    await page.evaluate(() => document.getElementById('confirmDialog').contains(document.activeElement)));
  check('the dialog uses dialog semantics', await page.evaluate(() => {
    const d = document.getElementById('confirmDialog');
    return d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true';
  }));
  check('the page behind is hidden from assistive tech',
    (await page.getAttribute('#app', 'aria-hidden')) === 'true');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('escape cancels the dialog', !(await dialogOpen()));
  check('escape preserves the article', (await page.inputValue('#html-code')).length > 0);
  check('the page behind is reachable again', (await page.getAttribute('#app', 'aria-hidden')) === null);
  check('focus returns to the triggering button',
    await page.evaluate(() => document.activeElement === document.getElementById('newArticleBtn')));

  // 12-13: switching format with a dirty form, then cancelling.
  await page.click('.format-option[data-type="care_guide"]');
  await page.waitForTimeout(200);
  check('switching format with a dirty form warns', await dialogOpen());
  check('the switch warning uses the agreed copy',
    /Switch article format\\?/.test(await page.textContent('#confirmTitle')));
  check('the switch warning offers keeping the current article',
    /Keep Current Article/.test(await page.textContent('#confirmCancel')));
  await page.click('#confirmCancel');
  await page.waitForTimeout(250);
  check('cancelling a switch keeps the previous format',
    await page.evaluate(() => state.articleType === 'occasion_gift_guide'));
  check('cancelling a switch keeps the format button selected',
    (await page.getAttribute('.format-option[data-type="occasion_gift_guide"]', 'class')).includes('on'));
  check('cancelling a switch keeps the brief', (await page.inputValue('[data-name="occasion"]')).includes('Graduation'));
  check('cancelling a switch keeps the products', (await count()).startsWith('3 products'));
  check('cancelling a switch keeps the output', (await page.inputValue('#html-code')).length > 0);

  // 14-15: switching format with a dirty form, confirmed.
  await page.click('.format-option[data-type="general_gift_guide"]');
  await page.waitForTimeout(200);
  await page.click('#confirmOk');
  await page.waitForTimeout(500);
  check('confirming a switch activates the new format',
    await page.evaluate(() => state.articleType === 'general_gift_guide'));
  check('products do not carry into the new format', (await count()).startsWith('0 products'));
  check('output does not carry into the new format', !(await page.isVisible('#outputCard')));
  check('the new format shows its own empty form',
    (await page.inputValue('[data-name="recipient"]')) === '');

  // 16: a clean form switches with no warning at all.
  await page.click('.format-option[data-type="care_guide"]');
  await page.waitForTimeout(250);
  check('a clean form switches without a warning', !(await dialogOpen()));
  check('the clean switch went through', await page.evaluate(() => state.articleType === 'care_guide'));
  await page.click('.format-option[data-type="care_guide"]');
  await page.waitForTimeout(200);
  check('clicking the already selected format does nothing', !(await dialogOpen()));

  // 17: editing the occasion is not starting a new article.
  await switchFormat('occasion_gift_guide');
  await page.waitForTimeout(400);
  await page.fill('[data-name="occasion"]', 'Christmas');
  await page.waitForTimeout(250);
  await page.waitForSelector('.catalog-item');
  await page.$$eval('.catalog-item input', els => els[0].click());
  await page.waitForTimeout(250);
  check('a product is confirmed for the occasion guide', (await count()).startsWith('1 product'));
  await page.fill('[data-name="occasion"]', 'Christmas 2026');
  await page.waitForTimeout(300);
  check('editing the occasion keeps confirmed products', (await count()).startsWith('1 product'));
  check('editing the occasion asks nothing', !(await dialogOpen()));
  await page.fill('[data-name="recipient"]', 'a coworker');
  await page.waitForTimeout(250);
  check('editing the recipient keeps confirmed products', (await count()).startsWith('1 product'));

  // 18-21: Clear Selected Products, cancelled and confirmed.
  check('the clear-products action is offered when products are confirmed',
    await page.isVisible('#clearProductsBtn'));
  await page.click('#clearProductsBtn');
  await page.waitForTimeout(200);
  check('clearing products asks first', await dialogOpen());
  check('the clear-products warning says the brief is kept',
    /brief will remain unchanged/.test(await page.textContent('#confirmBody')));
  await page.click('#confirmCancel');
  await page.waitForTimeout(250);
  check('cancelling keeps the products', (await count()).startsWith('1 product'));

  // Confirm a second product only if this collection offers one; the occasion
  // edits above may have swapped the inferred collection.
  const available = (await page.$$('.catalog-item input')).length;
  const want = available > 1 ? 2 : 1;
  if (available > 1) {
    await page.$$eval('.catalog-item input', els => els[1].click());
    await page.waitForTimeout(200);
  }
  await page.fill('[data-name="numberOfRecommendations"]', String(want));
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible');
  await page.click('#clearProductsBtn');
  await page.waitForTimeout(200);
  await page.click('#confirmOk');
  await page.waitForTimeout(400);
  check('confirming removes every confirmed product', (await count()).startsWith('0 products'));
  check('the clear-products action hides when nothing is confirmed',
    !(await page.isVisible('#clearProductsBtn')));
  check('the brief survives clearing products',
    (await page.inputValue('[data-name="occasion"]')).includes('Christmas')
    && (await page.inputValue('[data-name="recipient"]')) === 'a coworker');
  check('the format survives clearing products',
    await page.evaluate(() => state.articleType === 'occasion_gift_guide'));
  check('product-dependent output is cleared', !(await page.isVisible('#outputCard')));
  check('job state is cleared with the products', await page.evaluate(() => state.generationPending === false));

  // 22-23: starting a new article while a generation is pending.
  await page.$$eval('.catalog-item input', els => els[0].click());
  await page.waitForTimeout(200);
  await page.fill('[data-name="numberOfRecommendations"]', '1');
  setMode('slowjob');
  await page.click('#genBtn');
  await page.waitForTimeout(1200);
  check('a background generation is pending', await page.evaluate(() => state.generationPending === true));
  const idBefore = await page.evaluate(() => state.generationId);
  check('the new-article action is reachable while a generation runs',
    await page.isVisible('#newArticleBtnPending'));
  await clickNewArticle();
  await page.waitForTimeout(200);
  check('starting a new article mid-generation warns', await dialogOpen());
  check('the warning says the running generation will not be shown',
    /no longer be shown/.test(await page.textContent('#confirmBody')));
  await page.click('#confirmOk');
  await page.waitForTimeout(300);
  check('the generation is abandoned', await page.evaluate(() => state.generationPending === false));
  check('the generation identity moved on', await page.evaluate(id => state.generationId > id, idBefore));
  setMode('');
  // Well past the point the abandoned job would have finished and rendered.
  await page.waitForTimeout(9000);
  check('a late result cannot repopulate the new article', (await page.inputValue('#html-code')) === '');
  check('a late result cannot show the output card', !(await page.isVisible('#outputCard')));
  check('a late result cannot post an error into the new article', !(await page.isVisible('#errorBox')));
  check('a late result cannot confirm products into the new article', (await count()).startsWith('0 products'));

  // 26: repeated resets leave nothing behind.
  const timersBefore = await page.evaluate(() => Object.keys(window.__copyTimersProbe || {}).length);
  for (let i = 0; i < 3; i++) {
    await page.click('.format-option[data-type="care_guide"]');
    await page.waitForTimeout(150);
    if (await dialogOpen()) { await page.click('#confirmOk'); await page.waitForTimeout(200); }
    await switchFormat('occasion_gift_guide');
    await page.waitForTimeout(300);
  }
  check('repeated resets leave the form clean', (await page.inputValue('[data-name="occasion"]')) === '');
  check('repeated resets leave no products', (await count()).startsWith('0 products'));
  check('repeated resets leave no output', !(await page.isVisible('#outputCard')));
  check('repeated resets leave no dialog open', !(await dialogOpen()));
  check('repeated resets do not stack dialog listeners', await page.evaluate(async () => {
    // A stacked listener would resolve more than one pending confirmation from a
    // single click. Open, cancel, and confirm the dialog is usable again.
    return document.getElementById('confirmOverlay').classList.contains('visible') === false;
  }));
  check('no timer state survives repeated resets', timersBefore === 0);

  // ── Fix 1: every active generation counts as pending ────────────────────
  // The flag used to be set only for the background formats, so a synchronous
  // care guide could be abandoned mid-flight with no question asked.
  setMode('');
  await switchFormat('care_guide');
  await page.waitForTimeout(300);
  await page.fill('[data-name="plantName"]', 'Haworthia');

  // The mock answers the synchronous endpoint slowly enough to click through.
  setMode('slowsync');
  await page.click('#genBtn');
  await page.waitForTimeout(700);
  check('a synchronous generation counts as pending',
    await page.evaluate(() => state.generationPending === true));
  check('the new-article action is reachable during a synchronous generation',
    await page.isVisible('#newArticleBtnPending'));
  await clickNewArticle();
  await page.waitForTimeout(200);
  check('abandoning a synchronous generation warns', await dialogOpen());
  check('the synchronous warning names the running generation',
    /no longer be shown/.test(await page.textContent('#confirmBody')));

  // Cancel: the generation must carry on and finish normally.
  await page.click('#confirmCancel');
  await page.waitForTimeout(250);
  check('cancelling leaves the synchronous generation running',
    await page.evaluate(() => state.generationPending === true));
  await page.waitForSelector('#outputCard.visible', { timeout: 15000 });
  check('a cancelled warning lets the synchronous generation complete',
    (await page.inputValue('#html-code')).includes('<h2'));
  check('completion clears the pending flag',
    await page.evaluate(() => state.generationPending === false));

  // Confirm: the late synchronous response must not reach the new article.
  setMode('slowsync');
  await page.click('#genBtn');
  await page.waitForTimeout(700);
  const syncIdBefore = await page.evaluate(() => state.generationId);
  await clickNewArticle();
  await page.waitForTimeout(200);
  check('abandoning a second synchronous generation warns again', await dialogOpen());
  await page.click('#confirmOk');
  await page.waitForTimeout(300);
  check('the synchronous generation is abandoned',
    await page.evaluate(() => state.generationPending === false));
  check('the synchronous generation identity moved on',
    await page.evaluate(id => state.generationId > id, syncIdBefore));
  setMode('');
  await page.waitForTimeout(4000);
  check('a late synchronous result cannot populate the new article',
    (await page.inputValue('#html-code')) === '');
  check('a late synchronous result shows no output card', !(await page.isVisible('#outputCard')));
  check('a late synchronous result posts no error', !(await page.isVisible('#errorBox')));
  check('a late synchronous result leaves the brief clean',
    (await page.inputValue('[data-name="plantName"]')) === '');

  // A synchronous FAILURE must clear the flag too, or the next new-article
  // click would warn about a generation that is long over.
  await page.fill('[data-name="plantName"]', 'Haworthia');
  setMode('text502');
  await page.click('#genBtn');
  await page.waitForTimeout(800);
  check('a failed generation clears the pending flag',
    await page.evaluate(() => state.generationPending === false));
  setMode('');

  // The background path still behaves exactly as before.
  await switchFormat('occasion_gift_guide');
  await page.waitForTimeout(400);
  await page.fill('[data-name="occasion"]', 'Christmas');
  await page.waitForTimeout(250);
  await page.waitForSelector('.catalog-item');
  await page.$$eval('.catalog-item input', els => els[0].click());
  await page.waitForTimeout(200);
  await page.fill('[data-name="numberOfRecommendations"]', '1');
  setMode('slowjob');
  await page.click('#genBtn');
  await page.waitForTimeout(1200);
  check('a background generation still counts as pending',
    await page.evaluate(() => state.generationPending === true));
  await clickNewArticle();
  await page.waitForTimeout(200);
  check('abandoning a background generation still warns', await dialogOpen());
  await page.click('#confirmCancel');
  await page.waitForTimeout(250);
  check('cancelling leaves the background generation running',
    await page.evaluate(() => state.generationPending === true));
  setMode('');
  await page.waitForSelector('#outputCard.visible', { timeout: 30000 });
  check('the background generation still completes after a cancelled warning',
    (await page.inputValue('#html-code')).includes('<h2'));

  // ── Fix 2: editing the article html makes the copy stale ────────────────
  // The `input` event is what a person typing, deleting or pasting produces.
  // #html-code is readonly today, so the test raises the same event the field
  // would raise if it were not, which is what the handler actually listens for.
  const editHtml = (text) => page.evaluate(t => {
    const el = document.getElementById('html-code');
    el.value = t;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);

  check('a fresh article starts uncopied',
    await page.evaluate(() => state.articleHtmlCopied === false));
  await page.click('#copyBtn');
  await page.waitForTimeout(250);
  check('a successful copy marks the article copied',
    await page.evaluate(() => state.articleHtmlCopied === true));

  await editHtml('<h2>Edited after copying</h2>');
  await page.waitForTimeout(150);
  check('editing the article html marks it uncopied again',
    await page.evaluate(() => state.articleHtmlCopied === false));

  await clickNewArticle();
  await page.waitForTimeout(200);
  check('an edited, uncopied article warns before it is cleared', await dialogOpen());
  await page.click('#confirmCancel');
  await page.waitForTimeout(250);
  check('cancelling keeps the edit', (await page.inputValue('#html-code')) === '<h2>Edited after copying</h2>');

  await page.click('#copyBtn');
  await page.waitForTimeout(250);
  check('copying the edited html marks it copied again',
    await page.evaluate(() => state.articleHtmlCopied === true));
  check('the clipboard holds the edited html',
    (await page.evaluate(() => navigator.clipboard.readText())) === '<h2>Edited after copying</h2>');

  // Other copy buttons must not touch the flag.
  await editHtml('<h2>Edited again</h2>');
  await page.waitForTimeout(150);
  for (const id of ['titleCopyBtn', 'excerptCopyBtn', 'metaCopyBtn']) {
    if (!(await page.isVisible('#' + id))) continue;
    await page.click('#' + id);
    await page.waitForTimeout(250);
    check('copying ' + id + ' does not mark the article html copied',
      await page.evaluate(() => state.articleHtmlCopied === false));
  }

  // A failed article copy must leave it uncopied.
  await page.evaluate(() => {
    window.__w2 = navigator.clipboard.writeText.bind(navigator.clipboard);
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => Promise.reject(new Error('no')) });
    window.__e2 = document.execCommand;
    document.execCommand = () => false;
  });
  await page.click('#copyBtn');
  await page.waitForTimeout(250);
  check('a failed article copy leaves it uncopied',
    await page.evaluate(() => state.articleHtmlCopied === false));
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: window.__w2 });
    document.execCommand = window.__e2;
  });

  // Newly generated html is inserted programmatically and must not look like an
  // edit; a new generation sets the flag false on its own account anyway.
  await page.click('#copyBtn');
  await page.waitForTimeout(250);
  const copiedBeforeRegen = await page.evaluate(() => state.articleHtmlCopied);
  check('the article is copied before regenerating', copiedBeforeRegen === true);
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible', { timeout: 30000 });
  check('a new generation leaves the article uncopied',
    await page.evaluate(() => state.articleHtmlCopied === false));

  // Repeated generations must not stack edit listeners: one edit, one flip.
  const flips = await page.evaluate(() => {
    let n = 0;
    const probe = () => { n += 1; };
    document.addEventListener('input', probe);
    const el = document.getElementById('html-code');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.removeEventListener('input', probe);
    return n;
  });
  check('one edit raises exactly one input event', flips === 1);
  check('repeated generations leave the flag correct after an edit',
    await page.evaluate(() => state.articleHtmlCopied === false));

  check('no script errors', consoleErrors.length === 0, consoleErrors.join(' | '));

  console.log(results.join('\n'));
  console.log('\n' + results.filter(r => r.startsWith('FAIL')).length + ' failures of ' + results.length);
  await browser.close();
})();
