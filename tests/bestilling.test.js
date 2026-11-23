// Tester bestillingsskjemaet i nettleseren, med appen Nettsideferdig (APP_URL) og GoatCounter mocket.
// Ingen ekte bestilling sendes: alle kall til appen fanges opp i testen. Kjør lokalt (aldri i GitHub Actions):
//   python3 build.py && node tests/bestilling.test.js
// Trenger Playwright: `npm i playwright` et sted, og NODE_PATH dit, eller kjør fra en mappe som har den.
// PW_CHROME kan peke på en installert Chromium hvis Playwright ikke har lastet ned sin egen.
"use strict";
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const PORT = 8765;
const BASE = "http://127.0.0.1:" + PORT;
const APP = "**/folloes.app.nettsideferdig.no/**";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };

function serve() {
  const p = spawn("python3", ["-m", "http.server", String(PORT), "--directory", path.join(ROOT, "public")], { stdio: "ignore" });
  return new Promise((resolve, reject) => {
    let tries = 0;
    (function ping() {
      http.get(BASE + "/", (r) => { r.resume(); resolve(p); }).on("error", () => {
        if (++tries > 50) reject(new Error("fikk ikke startet http.server")); else setTimeout(ping, 100);
      });
    })();
  });
}

// De neste mandagene og fredagene etter i morgen, som appen ville gitt dem.
function nesteDager(n) {
  const out = [], d = new Date();
  d.setDate(d.getDate() + 2);
  while (out.length < n) {
    if (d.getDay() === 1 || d.getDay() === 5)
      out.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
const DAGER = nesteDager(6);
const OPPSETT = {
  test: true,
  varer: [{ id: 7, navn: "Bjørkeved 40 L", beskrivelse: "", pris_ore: 8900, utsolgt: false }],
  levering: {
    gebyr_ore: 49900, frist_klokke: "18:00", fast_uker: [2, 4, 6],
    tillegg: [{ id: 11, navn: "Utendørs 0–15 meter", beskrivelse: "", pris_ore: 1200, per: "enhet" },
      { id: 12, navn: "Til 2. etasje", beskrivelse: "", pris_ore: 2000, per: "enhet" }],
  },
};

// Mocker appen. opts.bestill: funksjon (nr, body) → [status, json]; opts.dager: funksjon (url) → [status, json].
async function mockApp(ctx, opts) {
  const seen = { oppsett: 0, dager: [], bestill: [], henvendelse: [] };
  await ctx.route("**/gc.zgo.at/**", (r) => r.abort());
  await ctx.route("**/*.nettsideferdig.workers.dev/**", (r) => r.abort()); // Nettsideferdigs besøkstelling: ikke tell testbesøk
  await ctx.route(APP, async (route) => {
    const req = route.request(), url = new URL(req.url());
    const svar = (status, j) => route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(j) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === "/api/oppsett") { seen.oppsett++; return svar(200, OPPSETT); }
    if (url.pathname === "/api/leveringsdager") {
      if (!url.searchParams.get("adresse")) return svar(200, { ok: true, dager: DAGER.map((d) => ({ dato: d, ledig: null })) });
      seen.dager.push(url.search);
      const [s, j] = opts.dager ? opts.dager(url) : [200, { ok: true, adresse: "Storgata 1, 1430 ÅS", sum_ore: 227900,
        dager: DAGER.map((d, i) => ({ dato: d, ledig: i !== 0 })) }];
      return svar(s, j);
    }
    if (url.pathname === "/api/bestill-levering" && req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      seen.bestill.push(body);
      if (opts.bestill === "nede") return route.abort("failed");
      const [s, j] = opts.bestill ? opts.bestill(seen.bestill.length, body) : [200, { ok: true, id: "abc12345", status: "bekreftet" }];
      return svar(s, j);
    }
    if (url.pathname === "/api/henvendelse" && req.method() === "POST") {
      seen.henvendelse.push(JSON.parse(req.postData() || "{}"));
      const [s, j] = opts.henvendelse || [200, { ok: true }];
      return svar(s, j);
    }
    return svar(404, { ok: false, feil: ["finnes ikke"] });
  });
  await ctx.addInitScript(() => {
    const push = (p) => { const a = JSON.parse(sessionStorage.getItem("__events") || "[]"); a.push(p); sessionStorage.setItem("__events", JSON.stringify(a)); };
    window.goatcounter = { count: (o) => push(o.path) };
  });
  // Ingen forespørsler til FormSubmit eller Google-regnearket.
  await ctx.route(/formsubmit\.co|script\.google/, (r) => { seen.gammel = true; return r.abort(); });
  return seen;
}

const events = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("__events") || "[]"));

// Fyller ut vedbestillingen på /ved-as/ og venter til dagene fra appen er der.
async function fyllUt(page, opts) {
  await page.goto(BASE + (opts.side || "/ved-as/"));
  if (opts.antall) await page.fill("#f-antall", String(opts.antall));
  if (opts.baering) {
    await page.check('[name="_baering"][value="inn"]');
    await page.selectOption("#f-baering", opts.baering);
  }
  if (opts.hyppighet) await page.selectOption("#f-hyppighet", { label: opts.hyppighet });
  await page.fill("#f-adresse", "Storgata 1");
  await page.waitForFunction(() => document.querySelector("#f-dager button[disabled]"), null, { timeout: 5000 });
  await page.fill("#f-navn", "Kari Nordmann");
  await page.fill("#f-tlf", "48 99 39 00");
  await page.fill("#f-epost", "kunde@example.com");
}

async function send(page, waitMs) {
  await page.click("#order-form button[type=submit]");
  await Promise.race([
    page.waitForURL("**/takk/", { timeout: waitMs || 15000 }),
    page.waitForSelector("#form-msg.err", { state: "visible", timeout: waitMs || 15000 }),
  ]);
  return page.url().endsWith("/takk/") ? "" : await page.$eval("#form-msg", (el) => el.textContent);
}

const tests = [
  ["Et ekte trykk på dagen rett etter at adressen er skrevet, velger dagen (knappene må ikke byttes ut mens fingeren er nede)", async (b) => {
    const ctx = await b.newContext(), page = await ctx.newPage();
    // Alle dagene er ledige her: blir dagen kunden trykker på full idet svaret kommer, er det en annen sak (409-testen).
    await mockApp(ctx, { dager: () => [200, { ok: true, adresse: "Storgata 1, 1430 ÅS", sum_ore: 0, dager: DAGER.map((d) => ({ dato: d, ledig: true })) }] });
    await page.goto(BASE + "/ved-as/");
    await page.fill("#f-adresse", "Storgata 1");
    await page.click("#f-dager button:not([disabled])");
    await page.waitForTimeout(1200); // svaret fra appen kommer etter trykket og skal ikke ta bort valget
    const dag = await page.$eval("#f-leveringsdag", (el) => el.value);
    const valgt = await page.$eval("#f-dager", (el) => (el.querySelector(".on") || { dataset: {} }).dataset.date || "");
    await ctx.close();
    assert.ok(dag, "ingen dag valgt etter trykk");
    assert.strictEqual(valgt, dag, "knappen er ikke markert som valgt");
  }],
  ["Dagene kommer fra appen: første dag er «Fullt», adressen sendes med kommunen, sekker og bæring som linjer og tillegg", async (b) => {
    const ctx = await b.newContext(), page = await ctx.newPage();
    const seen = await mockApp(ctx, {});
    await fyllUt(page, { antall: 25, baering: "etg-2" });
    await page.waitForTimeout(1200);
    const knapper = await page.$$eval("#f-dager button", (bs) => bs.map((x) => [x.dataset.date, x.disabled, x.lastChild.textContent]));
    await ctx.close();
    assert.deepStrictEqual(knapper.map((k) => k[0]), DAGER);
    assert.deepStrictEqual(knapper[0].slice(1), [true, "Fullt"]);
    assert.deepStrictEqual(knapper[1].slice(1), [false, "Ledig"]);
    const q = new URLSearchParams(seen.dager[seen.dager.length - 1]);
    assert.strictEqual(q.get("adresse"), "Storgata 1, Ås");
    assert.strictEqual(q.get("linjer"), "7:25");
    assert.strictEqual(q.get("tillegg"), "12");
  }],
  ["Vellykket bestilling: riktig JSON til appen (uten beløp), hendelser og takkeside med oppsummering", async (b) => {
    const ctx = await b.newContext(), page = await ctx.newPage();
    const seen = await mockApp(ctx, {});
    await fyllUt(page, { antall: 20, baering: "ute-15" });
    await page.click("#f-dager button:not([disabled])");
    const feil = await send(page);
    assert.strictEqual(feil, "", feil);
    assert.strictEqual(seen.bestill.length, 1);
    const body = seen.bestill[0];
    assert.deepStrictEqual(body.linjer, [{ vare_id: 7, antall: 20 }]);
    assert.deepStrictEqual(body.tillegg, [11]);
    assert.strictEqual(body.adresse, "Storgata 1, 1430 ÅS", "adressen fra Kartverket skal sendes");
    assert.strictEqual(body.dato, DAGER[1]);
    assert.strictEqual(body.navn, "Kari Nordmann");
    assert.strictEqual(body.telefon, "48 99 39 00");
    assert.strictEqual(body.epost, "kunde@example.com");
    assert.ok(!("fast_uker" in body), "engangskjøp skal ikke ha fast_uker");
    for (const k of Object.keys(body)) assert.ok(!/belop|sum|pris|total/i.test(k), "beløp sendt: " + k);
    const ev = await events(page);
    assert.ok(ev.includes("generate_lead"), "generate_lead mangler: " + ev);
    assert.ok(ev.includes("bestilt_via:app"), "bestilt_via:app mangler: " + ev);
    assert.ok(ev.includes("purchase_lead_view"), "takkesiden viste ikke oppsummeringen: " + ev);
    const takk = await page.$eval("#takk-summary", (el) => el.textContent);
    assert.ok(/20 sekker/.test(takk) && /Storgata 1/.test(takk), takk);
    assert.ok(!seen.gammel, "skjemaet kontaktet FormSubmit eller Google");
    await ctx.close();
  }],
  ["Vedabonnement: hyppigheten sendes som fast_uker når appen tilbyr det", async (b) => {
    const ctx = await b.newContext(), page = await ctx.newPage();
    const seen = await mockApp(ctx, {});
    await fyllUt(page, { hyppighet: "Fast levering hver 4. uke" });
    await page.click("#f-dager button:not([disabled])");
    assert.strictEqual(await send(page), "");
    assert.strictEqual(seen.bestill[0].fast_uker, 4);
    assert.ok(!/Vedabonnement/.test(seen.bestill[0].melding));
    await ctx.close();
  }],
  ["409: «dagen ble akkurat full», dagen blir Fullt, ny dag går gjennom", async (b) => {
    const ctx = await b.newContext(), page = await ctx.newPage();
    const seen = await mockApp(ctx, { bestill: (n) => n === 1 ? [409, { ok: false, feil: ["dagen er full; velg en annen dag"] }] : [200, { ok: true, id: "x" }] });
    await fyllUt(page, {});
    await page.click("#f-dager button:not([disabled])");
    const feil = await send(page);
    assert.ok(/akkurat full/.test(feil), feil);
    assert.strictEqual(await page.$eval("#f-leveringsdag", (el) => el.value), "");
    assert.ok(await page.$eval(`#f-dager button[data-date="${DAGER[1]}"]`, (x) => x.disabled), "den fulle dagen kan fortsatt velges");
    await page.click("#f-dager button:not([disabled])");
    assert.strictEqual(await send(page), "");
    assert.strictEqual(seen.bestill.length, 2);
    assert.strictEqual(seen.bestill[1].dato, DAGER[2]);
    await ctx.close();
  }],
  ["Appen er nede: feilmelding med telefonnummeret, ingen takkeside", async (b) => {
    const ctx = await b.newContext(), page = await ctx.newPage();
    await mockApp(ctx, { bestill: "nede" });
    await fyllUt(page, {});
    await page.click("#f-dager button:not([disabled])");
    const feil = await send(page);
    assert.ok(/48 99 39 00/.test(feil), feil);
    const ev = await events(page);
    assert.ok(ev.some((e) => e.indexOf("order_error:") === 0), "order_error mangler: " + ev);
    await ctx.close();
  }],
  ["Ukjent adresse (400 fra leveringsdager): ingen dag kan velges, og appens feil vises", async (b) => {
    const ctx = await b.newContext(), page = await ctx.newPage();
    await mockApp(ctx, { dager: () => [400, { ok: false, feil: ["fant ikke adressen; skriv gate, nummer og poststed"] }] });
    await page.goto(BASE + "/ved-as/");
    await page.fill("#f-adresse", "Finnesikkeveien 99");
    await page.waitForFunction(() => /adressen/i.test(document.querySelector("#f-dag-msg").textContent), null, { timeout: 5000 });
    const ledige = await page.$$eval("#f-dager button:not([disabled])", (bs) => bs.length);
    await ctx.close();
    assert.strictEqual(ledige, 0);
  }],
  ["Appen svarer ikke på leveringsdagene: bare mandager og fredager vises (lokal beregning)", async (b) => {
    const ctx = await b.newContext(), page = await ctx.newPage();
    await ctx.route("**/gc.zgo.at/**", (r) => r.abort());
  await ctx.route("**/*.nettsideferdig.workers.dev/**", (r) => r.abort()); // Nettsideferdigs besøkstelling: ikke tell testbesøk
    await ctx.route(APP, (r) => r.abort("failed"));
    await page.goto(BASE + "/ved-as/");
    await page.waitForTimeout(500);
    const dates = await page.$$eval("#f-dager button[data-date]", (bs) => bs.map((x) => x.dataset.date));
    await ctx.close();
    assert.ok(dates.length > 0, "ingen leveringsdager");
    const wd = new Set(dates.map((d) => new Date(d + "T12:00:00Z").getUTCDay()));
    assert.ok([...wd].every((d) => d === 1 || d === 5), "andre dager enn mandag og fredag: " + dates);
    assert.ok(wd.has(5), "ingen fredager: " + dates);
  }],
  ["Navn mangler: skjemaet sendes ikke, og feltet markeres", async (b) => {
    const ctx = await b.newContext(), page = await ctx.newPage();
    const seen = await mockApp(ctx, {});
    await fyllUt(page, {});
    await page.fill("#f-navn", "");
    await page.click("#f-dager button:not([disabled])");
    await page.click("#order-form button[type=submit]");
    await page.waitForSelector("#form-msg.err", { timeout: 5000 });
    assert.ok(await page.$eval("#f-navn", (el) => el.classList.contains("invalid")), "navnefeltet er ikke markert");
    assert.strictEqual(seen.bestill.length, 0);
    assert.ok((await events(page)).includes("form_invalid:Navn"));
    await ctx.close();
  }],
  ["Bestillingsskriptet kjører ikke (gammelt eller ødelagt app.js): kunden får beskjed, og ingenting sendes", async (b) => {
    const ctx = await b.newContext(), page = await ctx.newPage();
    const seen = await mockApp(ctx, {});
    await ctx.route(/\/assets\/app\.js/, (r) => r.fulfill({ contentType: "application/javascript", body: "document.querySelector('[name=\"Side\"]').value = 1;" }));
    await page.goto(BASE + "/ved-as/");
    await page.fill("#f-adresse", "Storgata 1");
    await page.fill("#f-navn", "Kari Nordmann");
    await page.click("#order-form button[type=submit]");
    await page.waitForSelector("#form-msg.err", { state: "visible", timeout: 5000 });
    const tekst = await page.$eval("#form-msg", (el) => el.textContent);
    assert.ok(/kunne ikke sendes/.test(tekst) && /48 99 39 00/.test(tekst), "feil melding: " + tekst);
    assert.ok(!page.url().includes("?"), "skjemaet ble sendt av nettleseren: " + page.url());
    assert.strictEqual(seen.bestill.length, 0);
    assert.ok((await events(page)).includes("order_error:skriptet kjorte ikke"));
    await ctx.close();
  }],
  ["Noe krasjer under sendingen: kunden får beskjed, og knappen kan brukes igjen", async (b) => {
    const ctx = await b.newContext(), page = await ctx.newPage();
    await mockApp(ctx, {});
    await fyllUt(page, {});
    await page.click("#f-dager button:not([disabled])");
    await page.evaluate(() => document.querySelector("#order-form .btn-label").remove()); // setBtn kaster
    const tekst = await send(page, 5000);
    assert.ok(/noe gikk galt/i.test(tekst), "feil melding: " + tekst);
    assert.ok(!(await page.$eval("#order-form button[type=submit]", (el) => el.disabled)), "knappen er låst");
    assert.ok((await events(page)).some((e) => e.startsWith("order_error:js ")));
    await ctx.close();
  }],
  ["/admin/ sender videre til appens admin, og ingen side nevner FormSubmit eller Google-regnearket", async () => {
    const fs = require("fs");
    const admin = fs.readFileSync(path.join(ROOT, "public", "admin", "index.html"), "utf8");
    assert.ok(/url=https:\/\/folloes\.app\.nettsideferdig\.no\/admin\//.test(admin), "ingen omdirigering til appen");
    const filer = [];
    (function gaa(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) gaa(p); else if (/\.(html|js|txt)$/.test(f.name)) filer.push(p);
    } })(path.join(ROOT, "public"));
    for (const f of filer) assert.ok(!/formsubmit|script\.google/i.test(fs.readFileSync(f, "utf8")), "gammel tjeneste i " + path.relative(ROOT, f));
    const pv = fs.readFileSync(path.join(ROOT, "public", "personvern", "index.html"), "utf8");
    assert.ok(/Nettsideferdig/.test(pv) && /Kartverket/.test(pv) && /OSRM/.test(pv), "personvernet nevner ikke appen");
  }],
];

(async () => {
  const server = await serve();
  const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(browser); console.log("OK   " + name); }
    catch (e) { failed++; console.log("FEIL " + name + "\n     " + String(e.message || e).split("\n")[0]); }
  }
  await browser.close();
  server.kill();
  console.log(failed ? failed + " test(er) feilet" : "Alle " + tests.length + " tester OK");
  process.exit(failed ? 1 : 0);
})();
