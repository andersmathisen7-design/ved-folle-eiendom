// Tester bestillingsskjemaet i nettleseren, med kalenderen, FormSubmit og GoatCounter mocket.
// Ingen ekte bestilling sendes. Kjør lokalt (aldri i GitHub Actions):
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
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, accept",
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

// Én bestilling fra /ved-as/ med gitt oppførsel for kalenderen og FormSubmit.
async function order(browser, opts) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const seen = { calendar: [], formsubmit: [], formsubmitAttempts: 0 };
  await ctx.route("**/gc.zgo.at/**", (r) => r.abort());
  await ctx.route("**/script.google.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ booked: {}, fullDays: [] }) });
    let body = {};
    try { body = JSON.parse(req.postData() || "{}"); } catch (e) {}
    if (body.action === "ledig") return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ ok: true, fits: {} }) });
    seen.calendar.push(body);
    if (opts.calendar === "nede") return route.abort("failed");
    return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(opts.calendar) });
  });
  await ctx.route("**/formsubmit.co/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    seen.formsubmitAttempts++;
    try { seen.formsubmit.push(JSON.parse(req.postData() || "{}")); } catch (e) { seen.formsubmit.push({}); }
    if (opts.formsubmitDelayMs) await new Promise((r) => setTimeout(r, opts.formsubmitDelayMs));
    try {
      if (opts.formsubmit === 522) return await route.fulfill({ status: 522, headers: CORS, contentType: "text/html", body: "<h1>522</h1>" });
      return await route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ success: "true", message: "ok" }) });
    } catch (e) { /* forespørselen ble avbrutt av siden (tidsgrense) */ }
  });
  await ctx.addInitScript(() => {
    const push = (p) => { const a = JSON.parse(sessionStorage.getItem("__events") || "[]"); a.push(p); sessionStorage.setItem("__events", JSON.stringify(a)); };
    window.goatcounter = { count: (o) => push(o.path) };
  });
  await page.goto(BASE + "/ved-as/");
  await page.fill("#f-adresse", "Storgata 1");
  await page.$eval("#f-dager button:not([disabled])", (b) => b.click());
  await page.fill("#f-tlf", "48993900");
  await page.fill("#f-epost", "kunde@example.com");
  const t0 = Date.now();
  await page.click("#order-form button[type=submit]");
  await Promise.race([
    page.waitForURL("**/takk/", { timeout: opts.waitMs || 20000 }),
    page.waitForSelector("#form-msg.err", { state: "visible", timeout: opts.waitMs || 20000 }),
  ]);
  const out = {
    ms: Date.now() - t0, url: page.url(), seen,
    error: page.url().endsWith("/takk/") ? "" : await page.$eval("#form-msg", (el) => el.innerHTML),
    events: await page.evaluate(() => JSON.parse(sessionStorage.getItem("__events") || "[]")),
  };
  await ctx.close();
  return out;
}

// Kunden skriver adressen og trykker rett på en dag, slik man gjør på mobil. Et ekte trykk, ikke et JS-klikk.
async function dagKlikkRettEtterAdresse(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await ctx.route("**/gc.zgo.at/**", (r) => r.abort());
  await ctx.route("**/script.google.com/**", (route) => {
    const body = route.request().method() === "GET" ? { booked: {}, fullDays: [] } : { ok: true, fits: {} };
    return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(BASE + "/ved-as/");
  await page.fill("#f-adresse", "Storgata 1");
  await page.click("#f-dager button:not([disabled])");
  const out = {
    dag: await page.$eval("#f-leveringsdag", (el) => el.value),
    valgt: await page.$eval("#f-dager", (el) => (el.querySelector(".on") || { dataset: {} }).dataset.date || ""),
  };
  await ctx.close();
  return out;
}

const tests = [
  ["Et ekte trykk på dagen rett etter at adressen er skrevet, velger dagen (knappene må ikke byttes ut mens fingeren er nede)", async (b) => {
    const r = await dagKlikkRettEtterAdresse(b);
    assert.ok(r.dag, "ingen dag valgt etter trykk");
    assert.strictEqual(r.valgt, r.dag, "knappen er ikke markert som valgt");
  }],
  ["Kalenderen sender e-posten: FormSubmit brukes ikke, kunden kommer til takkesiden", async (b) => {
    const r = await order(b, { calendar: { ok: true, id: "abc12345", mailed: true } });
    assert.ok(r.url.endsWith("/takk/"), "kom ikke til /takk/: " + r.url + " " + r.error);
    assert.strictEqual(r.seen.formsubmitAttempts, 0, "FormSubmit ble kalt selv om kalenderen sendte e-posten");
    assert.strictEqual(r.seen.calendar.length, 1);
    const c = r.seen.calendar[0];
    assert.strictEqual(c.phone, "48993900");
    assert.strictEqual(c.frequency, "", "engangskjøp skal ha tom hyppighet");
    assert.ok(r.events.includes("generate_lead"), "generate_lead mangler: " + r.events);
    assert.ok(r.events.includes("bestilt_via:kalender"), "bestilt_via:kalender mangler: " + r.events);
  }],
  ["Gammel kalender uten e-post: bestillingen går via FormSubmit som før", async (b) => {
    const r = await order(b, { calendar: { ok: true, id: "abc12345" } });
    assert.ok(r.url.endsWith("/takk/"), "kom ikke til /takk/: " + r.error);
    assert.strictEqual(r.seen.formsubmitAttempts, 1);
    assert.strictEqual(r.seen.formsubmit[0]["Telefon"], "48993900");
    assert.ok(r.seen.formsubmit[0]._autoresponse, "kunden får ingen bekreftelse");
    assert.ok(r.events.includes("bestilt_via:formsubmit"), "bestilt_via:formsubmit mangler: " + r.events);
  }],
  ["Kalenderen er nede: FormSubmit brukes, med merknad om at dagen ikke er registrert", async (b) => {
    const r = await order(b, { calendar: "nede" });
    assert.ok(r.url.endsWith("/takk/"), "kom ikke til /takk/: " + r.error);
    assert.strictEqual(r.seen.formsubmitAttempts, 1);
    assert.ok(/ikke registrert i kalenderen/.test(r.seen.formsubmit[0]["Leveringsdag"]), r.seen.formsubmit[0]["Leveringsdag"]);
  }],
  ["FormSubmit svarer 522: tre forsøk, så feilmelding med e-postlenke", async (b) => {
    const r = await order(b, { calendar: { ok: true, id: "abc12345" }, formsubmit: 522 });
    assert.ok(!r.url.endsWith("/takk/"), "havnet på takkesiden selv om alt feilet");
    assert.strictEqual(r.seen.formsubmitAttempts, 3);
    assert.ok(/mailto:/.test(r.error), "ingen e-postlenke i feilmeldingen");
    assert.ok(r.events.some((e) => e.indexOf("order_error:") === 0), "order_error mangler: " + r.events);
  }],
  ["FormSubmit henger (som ved 522 fra Cloudflare): hvert forsøk avbrytes etter 10 s, feilmelding innen 40 s", async (b) => {
    const r = await order(b, { calendar: { ok: true, id: "abc12345" }, formsubmit: 522, formsubmitDelayMs: 15000, waitMs: 45000 });
    assert.ok(!r.url.endsWith("/takk/"));
    assert.strictEqual(r.seen.formsubmitAttempts, 3);
    assert.ok(r.ms < 40000, "kunden ventet " + Math.round(r.ms / 1000) + " s");
    assert.ok(/mailto:/.test(r.error));
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
