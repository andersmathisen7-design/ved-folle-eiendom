// Tester e-posten kalenderskriptet (Apps Script) lager for en nettbestilling. Kjøres med Node, uten Google:
//   node tests/kalender.test.js
"use strict";
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "kalender", "kalender.gs"), "utf8");
const sent = [];
const sandbox = {
  Utilities: { formatDate: (d) => d.toISOString().slice(0, 10), getUuid: () => "abc12345-0000" },
  MailApp: { sendEmail: (o) => { if (sandbox.__mailFails) throw new Error("quota"); sent.push(o); } },
  console,
};
vm.createContext(sandbox);
vm.runInContext(src + "\n;this.__fn = { bestillingEpost_: bestillingEpost_, sendBestillingEpost_: sendBestillingEpost_, " +
  "BESTILLING_TIL: BESTILLING_TIL, BESTILLING_KOPI: BESTILLING_KOPI, FIRMA: FIRMA, TELEFON: TELEFON };", sandbox);
const F = sandbox.__fn;

const basis = { date: "2026-11-10", sacks: 20, address: "Storgata 1", area: "Ås",
  phone: "48993900", email: "kunde@example.com", carry: "Til 2. etasje (+20 kr/sekk)", total: "2 679 kr",
  message: "Sett dem ved døra", minutes: 70, frequency: "" };

const tests = [
  ["Vanlig bestilling: emne og innhold til eieren", () => {
    const m = F.bestillingEpost_(basis, "abc12345");
    assert.strictEqual(m.subject, "Ny vedbestilling: 20 sekker – Storgata 1, Ås – tirsdag 10. november");
    for (const s of ["Leveringsdag: Tirsdag 10. november", "Antall sekker: 20", "Bæring: Til 2. etasje (+20 kr/sekk)",
      "Adresse: Storgata 1, Ås", "Telefon: 48993900", "E-post: kunde@example.com", "Totalpris: 2 679 kr",
      "Melding: Sett dem ved døra", "ID: abc12345"]) assert.ok(m.body.includes(s), "mangler «" + s + "» i:\n" + m.body);
  }],
  ["Bekreftelsen til kunden sier at veden kommer på valgt dag, og lover ikke at vi ringer", () => {
    const m = F.bestillingEpost_(basis, "abc12345");
    assert.ok(m.customerSubject.includes("Follo Bjørkeved"));
    for (const s of ["20 sekker", "tirsdag 10. november", "48 99 39 00"]) assert.ok(m.customerBody.includes(s), "mangler «" + s + "»");
    assert.ok(!/ringer/i.test(m.customerBody), "lover at vi ringer");
  }],
  ["Kunden får aldri fritekst fra skjemaet (ellers kunne kontoen brukes til falske e-poster)", () => {
    const b = Object.assign({}, basis, { address: "Klikk her: https://evil.example", area: "LOGG INN NÅ", carry: "Send kode til 123",
      total: "0 kr, betal via https://evil.example", message: "hemmelig", frequency: "Din konto er sperret", day_label: "Mandag 10. november" });
    const m = F.bestillingEpost_(b, "id1");
    for (const s of ["evil", "LOGG INN", "Send kode", "hemmelig", "sperret"]) assert.ok(!m.customerBody.includes(s), "fritekst lekket: " + s);
    assert.ok(m.customerBody.includes("Ønsket leveringsdag: tirsdag 10. november"), m.customerBody);
    // Eieren får alt, slik at bestillingen kan behandles.
    assert.ok(m.body.includes("Klikk her: https://evil.example") && m.body.includes("Melding: hemmelig"));
  }],
  ["Leveringsdagen regnes ut fra datoen, på norsk", () => {
    assert.ok(F.bestillingEpost_(Object.assign({}, basis, { date: "2026-12-01" }), "x").customerBody.includes("tirsdag 1. desember"));
    assert.ok(F.bestillingEpost_(Object.assign({}, basis, { date: "tull" }), "x").customerBody.includes("tull"));
  }],
  ["Vedabonnement: eget emne og «Første leveringsdag»", () => {
    const m = F.bestillingEpost_(Object.assign({}, basis, { frequency: "Fast levering hver 2. uke" }), "abc12345");
    assert.strictEqual(m.subject, "Nytt vedabonnement: 20 sekker hver 2. uke – Storgata 1, Ås – tirsdag 10. november");
    assert.ok(m.body.includes("Hyppighet: Fast levering hver 2. uke"));
    assert.ok(m.customerBody.includes("Første leveringsdag: tirsdag 10. november"));
    assert.ok(m.customerBody.includes("fast levering hver 2. uke"));
  }],
  ["Tekst fra nettsiden kan ikke bli formler eller ekstra e-posthoder", () => {
    const m = F.bestillingEpost_(Object.assign({}, basis, { message: "=HYPERLINK(\"x\")", address: "Storgata 1\r\nBcc: x@y.no" }), "id1");
    assert.ok(m.body.includes("Melding: '=HYPERLINK"), m.body);
    assert.ok(!/[\r\n]/.test(m.subject), "linjeskift i emnet: " + JSON.stringify(m.subject));
  }],
  ["Sender til eieren med kopi, og bekreftelse til kunden", () => {
    sent.length = 0;
    assert.strictEqual(F.sendBestillingEpost_(basis, "abc12345"), true);
    assert.strictEqual(sent.length, 2);
    assert.strictEqual(sent[0].to, F.BESTILLING_TIL);
    assert.strictEqual(sent[0].cc, F.BESTILLING_KOPI);
    assert.strictEqual(sent[0].replyTo, "kunde@example.com");
    assert.strictEqual(sent[0].name, F.FIRMA);
    assert.strictEqual(sent[1].to, "kunde@example.com");
    assert.strictEqual(sent[1].name, F.FIRMA);
  }],
  ["Ugyldig kunde-e-post: bare eieren får e-post", () => {
    sent.length = 0;
    assert.strictEqual(F.sendBestillingEpost_(Object.assign({}, basis, { email: "ikke en adresse" }), "id1"), true);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].replyTo, undefined);
  }],
  ["Feiler e-posten (kvote, tilgang), svarer skriptet false uten å kaste", () => {
    sent.length = 0; sandbox.__mailFails = true;
    assert.strictEqual(F.sendBestillingEpost_(basis, "id1"), false);
    sandbox.__mailFails = false;
  }],
];

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log("OK   " + name); }
  catch (e) { failed++; console.log("FEIL " + name + "\n     " + String(e.message || e).split("\n")[0]); }
}
console.log(failed ? failed + " test(er) feilet" : "Alle " + tests.length + " tester OK");
process.exit(failed ? 1 : 0);
