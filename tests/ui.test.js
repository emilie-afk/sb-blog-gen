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
  await page.click('.format-option[data-type="single_plant_gift"]');
  await page.waitForTimeout(200);
  names = await fieldNames();
  check('single-plant has no title field', !names.includes('title'));
  check('single-plant fields', names.includes('giftAngle') && names.includes('productNotes'));
  await page.selectOption('[data-name="giftAngle"]', 'Low maintenance');
  await page.waitForTimeout(150);
  await page.click('#genBtn');
  await page.waitForSelector('#outputCard.visible');
  check('single-plant generates without a title', lastReq().articleType === 'single_plant_gift');

  // ── General gift guide: three-tab picker
  await page.click('.format-option[data-type="general_gift_guide"]');
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
  await page.click('.format-option[data-type="occasion_gift_guide"]');
  await page.waitForTimeout(500);
  names = await fieldNames();
  check('occasion has no tone field', !names.includes('tone'));
  check('occasion has no title field', !names.includes('title'));
  check('includeYearInTitle present', names.includes('includeYearInTitle'));
  check('sensitive checkbox renamed', (await page.textContent('#formFields')).includes('This is a sensitive or remembrance occasion'));
  check('occasion keeps confirmed products', (await page.textContent('.picker-count')).startsWith('3 products'));

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
  await page.click('.format-option[data-type="care_guide"]');
  await page.waitForTimeout(300);
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
  await page.click('.format-option[data-type="occasion_gift_guide"]');
  await page.waitForTimeout(500);

  // ── Gift catalog failure is recoverable
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

  check('no script errors', consoleErrors.length === 0, consoleErrors.join(' | '));

  console.log(results.join('\n'));
  console.log('\n' + results.filter(r => r.startsWith('FAIL')).length + ' failures of ' + results.length);
  await browser.close();
})();
