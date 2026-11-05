// Scenarier mot den PUBLISERTE nettsiden (follobjorkeved.no). Kalenderen, FormSubmit og GoatCounter fanges opp,
// så ingen ekte bestilling sendes og ingen besøk telles. Kjør lokalt, aldri i GitHub Actions:
//   curl -s https://follobjorkeved.no/sitemap.xml | grep -o "<loc>[^<]*" | sed "s/<loc>//" > /tmp/sider.txt
//   NODE_PATH=~/pwtest/node_modules node tests/live-scenarier.js /tmp/sider.txt
// Dekker feilene fra uke 44–45 2026: innsending som feilet når FormSubmit var nede, dagvalg som mistet trykket
// rett etter adressen, og løfter om oppringing.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const EXE = process.env.PW_CHROME || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const PAGES = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean);
const results = [];
function ok(name, cond, detail) { results.push({ name, ok: !!cond, detail: detail || '' }); }

async function ctxWith(browser, o) {
  const ctx = await browser.newContext(o.pc ? { viewport: { width: 1280, height: 900 } } : { ...devices['iPhone 13'] });
  const seen = { cal: [], fs: 0 };
  await ctx.route(/gc\.zgo\.at|goatcounter/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.route(/script\.google/, r => {
    const req = r.request();
    if (req.method() === 'GET') return r.fulfill({ json: { booked: {}, fullDays: [] } });
    let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
    if (b.action === 'ledig') return r.fulfill({ json: { ok: true, fits: {} } });
    seen.cal.push(b);
    if (o.cal === 'nede') return r.abort('failed');
    return r.fulfill({ json: o.cal });
  });
  await ctx.route(/formsubmit\.co/, r => { seen.fs++; if (o.fs === 'nede') return r.abort('failed'); return r.fulfill({ json: { success: 'true' } }); });
  const page = await ctx.newPage();
  page.on('pageerror', e => results.push({ name: 'JS-feil på ' + page.url(), ok: false, detail: e.message }));
  return { ctx, page, seen };
}
async function fill(page, o) {
  o = o || {};
  if (o.qtyType) await page.fill('#f-antall', String(o.qtyType)); else await page.click('#order-form button[data-qty="20"]');
  if (!o.skipArea) await page.selectOption('#f-sted', { index: 1 });
  if (!o.skipAddr) await page.fill('#f-adresse', 'Storgata 1');
  if (o.freq) await page.selectOption('#f-hyppighet', { index: 1 });
  if (!o.skipDay) await page.locator('#f-dager button:not([disabled])').first().click();
  await page.fill('#f-tlf', '48993900');
  await page.fill('#f-epost', o.email || 'kunde@example.com');
}
async function submitAndWait(page, ms) {
  const t0 = Date.now();
  await page.click('#order-form button[type="submit"]');
  await Promise.race([page.waitForURL('**/takk/', { timeout: ms || 20000 }), page.waitForSelector('#form-msg.err', { timeout: ms || 20000 })]).catch(() => {});
  return { s: (Date.now() - t0) / 1000, takk: /takk/.test(page.url()), msg: /takk/.test(page.url()) ? '' : await page.$eval('#form-msg', e => e.innerHTML).catch(() => '') };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  // 1. Alle sider med skjema: adresse, så ekte trykk på dag, så bestill → takk
  for (const u of PAGES) {
    const { ctx, page, seen } = await ctxWith(browser, { cal: { ok: true, id: 'x', mailed: true } });
    try {
      await page.goto(u, { waitUntil: 'networkidle' });
      if (!(await page.$('#order-form'))) { await ctx.close(); continue; }
      await fill(page);
      const dag = await page.$eval('#f-leveringsdag', e => e.value);
      const r = await submitAndWait(page);
      ok('Side ' + u.replace('https://follobjorkeved.no', ''), dag && r.takk && seen.fs === 0, dag ? (r.takk ? 'takk ' + r.s + 's' : 'FEIL: ' + r.msg.slice(0, 80)) : 'dag ikke valgt');
    } catch (e) { ok('Side ' + u, false, e.message.split('\n')[0]); }
    await ctx.close();
  }
  const home = 'https://follobjorkeved.no/';
  // 2. Antall skrevet inn for hånd, så dag rett etterpå
  { const { ctx, page } = await ctxWith(browser, { cal: { ok: true, id: 'x', mailed: true } });
    await page.goto(home, { waitUntil: 'networkidle' });
    await page.selectOption('#f-sted', { index: 1 }); await page.fill('#f-adresse', 'Storgata 1'); await page.click('h1');
    await page.fill('#f-antall', '15'); await page.locator('#f-dager button:not([disabled])').first().click();
    ok('Antall skrevet inn, så trykk på dag', await page.$eval('#f-leveringsdag', e => e.value));
    await ctx.close(); }
  // 3. Område valgt, så dag rett etterpå
  { const { ctx, page } = await ctxWith(browser, { cal: { ok: true, id: 'x', mailed: true } });
    await page.goto(home, { waitUntil: 'networkidle' });
    await page.fill('#f-adresse', 'Storgata 1'); await page.selectOption('#f-sted', { index: 2 });
    await page.locator('#f-dager button:not([disabled])').first().click();
    ok('Område valgt, så trykk på dag', await page.$eval('#f-leveringsdag', e => e.value));
    await ctx.close(); }
  // 4. Dagen er full når kunden sender
  { const { ctx, page, seen } = await ctxWith(browser, { cal: { ok: false, full: true, booked: {}, fullDays: [] } });
    await page.goto(home, { waitUntil: 'networkidle' }); await fill(page);
    const r = await submitAndWait(page);
    const msg = await page.$eval('#f-dag-msg', e => e.textContent).catch(() => '');
    ok('Dagen full ved innsending: beskjed, ingen FormSubmit', !r.takk && seen.fs === 0 && /full|plass|annen dag/i.test(msg + r.msg), (msg || r.msg).slice(0, 90));
    await ctx.close(); }
  // 5. Kalender nede + FormSubmit nede: feilmelding med e-postlenke og telefon
  { const { ctx, page, seen } = await ctxWith(browser, { cal: 'nede', fs: 'nede' });
    await page.goto(home, { waitUntil: 'networkidle' }); await fill(page);
    const r = await submitAndWait(page, 45000);
    ok('Alt nede: feilmelding med e-postlenke og telefon, 3 forsøk', !r.takk && /mailto:/.test(r.msg) && /tel:/.test(r.msg) && seen.fs === 3, 'forsøk=' + seen.fs + ' ' + r.s + 's');
    await ctx.close(); }
  // 6. Gammel kalender (uten mailed) + FormSubmit oppe → takk via FormSubmit
  { const { ctx, page, seen } = await ctxWith(browser, { cal: { ok: true, id: 'x' } });
    await page.goto(home, { waitUntil: 'networkidle' }); await fill(page);
    const r = await submitAndWait(page);
    ok('Kalender uten e-post, FormSubmit oppe: takk via FormSubmit', r.takk && seen.fs === 1, 'forsøk=' + seen.fs);
    await ctx.close(); }
  // 7. Kalender sender e-post + FormSubmit nede → takk, FormSubmit aldri kalt
  { const { ctx, page, seen } = await ctxWith(browser, { cal: { ok: true, id: 'x', mailed: true }, fs: 'nede' });
    await page.goto(home, { waitUntil: 'networkidle' }); await fill(page);
    const r = await submitAndWait(page);
    ok('Kalender sender e-post, FormSubmit nede: takk uten FormSubmit', r.takk && seen.fs === 0, r.s + 's');
    await ctx.close(); }
  // 8. Kalender nede + FormSubmit oppe → takk via FormSubmit med merknad
  { const { ctx, page, seen } = await ctxWith(browser, { cal: 'nede' });
    await page.goto(home, { waitUntil: 'networkidle' }); await fill(page);
    const r = await submitAndWait(page);
    ok('Kalender nede, FormSubmit oppe: takk via FormSubmit', r.takk && seen.fs === 1);
    await ctx.close(); }
  // 9. Uten dag → valideringsfeil, ingen sending
  { const { ctx, page, seen } = await ctxWith(browser, { cal: { ok: true, id: 'x', mailed: true } });
    await page.goto(home, { waitUntil: 'networkidle' }); await fill(page, { skipDay: true });
    const r = await submitAndWait(page, 5000);
    const inv = await page.$eval('#f-dag', e => e.classList.contains('invalid'));
    ok('Uten dag: rød markering, ingenting sendt', !r.takk && inv && seen.cal.length === 0 && seen.fs === 0, r.msg.slice(0, 60));
    await ctx.close(); }
  // 10. Ugyldig e-post → valideringsfeil
  { const { ctx, page, seen } = await ctxWith(browser, { cal: { ok: true, id: 'x', mailed: true } });
    await page.goto(home, { waitUntil: 'networkidle' }); await fill(page, { email: 'feil' });
    const r = await submitAndWait(page, 5000);
    ok('Ugyldig e-post: stoppes før sending', !r.takk && seen.cal.length === 0, r.msg.slice(0, 60));
    await ctx.close(); }
  // 11. Vedabonnement
  { const { ctx, page, seen } = await ctxWith(browser, { cal: { ok: true, id: 'x', mailed: true } });
    await page.goto('https://follobjorkeved.no/vedabonnement/', { waitUntil: 'networkidle' }); await fill(page, { freq: true });
    const r = await submitAndWait(page);
    const txt = r.takk ? (await page.textContent('main')).replace(/\s+/g, ' ') : '';
    ok('Vedabonnement: hyppighet sendes til kalenderen og vises på takkesiden', r.takk && seen.cal[0] && seen.cal[0].frequency && /fast levering/i.test(txt), (seen.cal[0] || {}).frequency);
    await ctx.close(); }
  // 12. PC-visning, full flyt
  { const { ctx, page, seen } = await ctxWith(browser, { cal: { ok: true, id: 'x', mailed: true }, pc: true });
    await page.goto(home, { waitUntil: 'networkidle' }); await fill(page);
    const r = await submitAndWait(page);
    ok('PC: full flyt til takkesiden', r.takk && seen.fs === 0);
    await ctx.close(); }
  // 13. Takkesiden og bekreftelsen lover ikke oppringing
  { const { ctx, page } = await ctxWith(browser, { cal: { ok: true, id: 'x', mailed: true } });
    await page.goto(home, { waitUntil: 'networkidle' }); await fill(page); await submitAndWait(page);
    const txt = (await page.textContent('body')).toLowerCase();
    ok('Takkesiden lover ikke at dere ringer', !/vi ringer|ringer deg/.test(txt));
    await ctx.close(); }
  await browser.close();
  for (const r of results) console.log((r.ok ? 'OK   ' : 'FEIL ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
  const f = results.filter(r => !r.ok).length;
  console.log(f ? f + ' FEILET av ' + results.length : 'Alle ' + results.length + ' scenarier OK');
})();
