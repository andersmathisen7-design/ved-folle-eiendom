/**
 * Follo Bjørkeved – leveringskalender.
 * Lagrer bestillingene i arket «Bestillinger», teller hvor mye tid som er bestilt per leveringsdag,
 * og gir eiersiden (follobjorkeved.no/admin/) oversikten over bestillingene.
 * Limes inn i Utvidelser → Apps Script i et Google Regneark. Se kalender/README.md.
 */

// Passordet til eiersiden. Bytt til noe langt og hemmelig før du implementerer (minst 12 tegn).
var ADMIN_NOKKEL = "bytt-meg";

var ARK = "Bestillinger";
var TIDSSONE = "Europe/Oslo";
var KOLONNER = ["ID", "Leveringsdag", "Minutter", "Status", "Navn", "Telefon", "Adresse", "Område", "Sekker",
                "Bæring", "Totalpris", "E-post", "Melding", "Registrert"];
var STATUSER = ["Ny", "Bekreftet", "Levert", "Avbestilt"];

function ark_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ARK);
  if (!sh) {
    sh = ss.insertSheet(ARK);
    sh.appendRow(KOLONNER);
    sh.setFrozenRows(1);
  }
  return sh;
}

function idag_() { return Utilities.formatDate(new Date(), TIDSSONE, "yyyy-MM-dd"); }

function dato_(v) {
  return v instanceof Date ? Utilities.formatDate(v, TIDSSONE, "yyyy-MM-dd") : String(v).trim();
}

// Alle rader som objekter. Kolonnene finnes etter navn, så rekkefølgen i arket kan endres.
// Rader uten ID (f.eks. lagt inn for hånd) får «rad-<nummer>».
function bestillinger_() {
  var rows = ark_().getDataRange().getValues(), head = rows[0], out = [];
  var col = function (r, navn) { var i = head.indexOf(navn); return i < 0 ? "" : r[i]; };
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i], dag = dato_(col(r, "Leveringsdag"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dag)) continue;
    var reg = col(r, "Registrert");
    out.push({
      id: String(col(r, "ID") || "rad-" + (i + 1)), date: dag, minutes: Number(col(r, "Minutter")) || 0,
      status: String(col(r, "Status") || "Ny"), name: String(col(r, "Navn")), phone: String(col(r, "Telefon")),
      address: String(col(r, "Adresse")), area: String(col(r, "Område")), sacks: Number(col(r, "Sekker")) || 0,
      carry: String(col(r, "Bæring")), total: String(col(r, "Totalpris")), email: String(col(r, "E-post")),
      message: String(col(r, "Melding")),
      registered: reg instanceof Date ? Utilities.formatDate(reg, TIDSSONE, "yyyy-MM-dd HH:mm") : String(reg)
    });
  }
  return out;
}

// Summen av minutter per dag fra i dag og framover. Avbestilte teller ikke.
function bestilt_() {
  var idag = idag_(), out = {};
  bestillinger_().forEach(function (b) {
    if (b.date >= idag && b.minutes > 0 && b.status !== "Avbestilt") out[b.date] = (out[b.date] || 0) + b.minutes;
  });
  return out;
}

function svar_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function eier_(nokkel) {
  return ADMIN_NOKKEL !== "bytt-meg" && ADMIN_NOKKEL.length >= 12 && String(nokkel || "") === ADMIN_NOKKEL;
}

function tekst_(v, max) { return String(v == null ? "" : v).slice(0, max); }

function leggTil_(b, status) {
  var id = Utilities.getUuid().slice(0, 8);
  var verdier = {
    "ID": id, "Leveringsdag": "'" + b.date, "Minutter": Math.round(Number(b.minutes)), "Status": status,
    "Navn": tekst_(b.name, 80), "Telefon": tekst_(b.phone, 30), "Adresse": tekst_(b.address, 120),
    "Område": tekst_(b.area, 60), "Sekker": Number(b.sacks) || "", "Bæring": tekst_(b.carry, 80),
    "Totalpris": tekst_(b.total, 40), "E-post": tekst_(b.email, 100), "Melding": tekst_(b.message, 1000),
    "Registrert": new Date()
  };
  var sh = ark_(), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(head.map(function (h) { return h in verdier ? verdier[h] : ""; }));
  return id;
}

// GET uten nøkkel: bestilt tid per dag (brukes av bestillingsskjemaet).
// GET med ?key=…: alle bestillinger (brukes av eiersiden).
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.key !== undefined) {
    if (!eier_(p.key)) return svar_({ ok: false, error: "nokkel" });
    return svar_({ ok: true, orders: bestillinger_(), today: idag_() });
  }
  return svar_({ booked: bestilt_() });
}

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return svar_({ ok: false, error: "ugyldig" }); }

  // Eiersiden: endre status, eller legge inn en telefonbestilling.
  if (b.action === "status" || b.action === "add") {
    if (!eier_(b.key)) return svar_({ ok: false, error: "nokkel" });
    if (b.action === "status") return endreStatus_(String(b.id || ""), String(b.status || ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) || !(Number(b.minutes) >= 0))
      return svar_({ ok: false, error: "ugyldig" });
    return svar_({ ok: true, id: leggTil_(b, "Bekreftet") });
  }

  // Bestilling fra nettsiden.
  var dag = String(b.date || ""), min = Math.round(Number(b.minutes)), kap = Number(b.capacity) || 300;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dag) || !(min > 0 && min <= 24 * 60)) return svar_({ ok: false, error: "ugyldig" });
  // Ingen levering samme dag (eller bakover i tid).
  if (dag <= idag_()) return svar_({ ok: false, error: "dato", booked: bestilt_() });

  // Lås, så to kunder som sender samtidig ikke begge får den siste plassen.
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var bk = bestilt_(), brukt = bk[dag] || 0;
    // En tom dag tar alltid imot, også en stor bestilling som alene er over grensen.
    if (brukt > 0 && brukt + min > kap) return svar_({ ok: false, full: true, booked: bk });
    b.minutes = min;
    return svar_({ ok: true, id: leggTil_(b, "Ny") });
  } finally {
    lock.releaseLock();
  }
}

function endreStatus_(id, status) {
  if (STATUSER.indexOf(status) < 0) return svar_({ ok: false, error: "ugyldig" });
  var sh = ark_(), rows = sh.getDataRange().getValues(), head = rows[0];
  var iId = head.indexOf("ID"), iStatus = head.indexOf("Status");
  if (iStatus < 0) return svar_({ ok: false, error: "mangler Status-kolonne" });
  for (var i = 1; i < rows.length; i++) {
    var radId = String((iId >= 0 && rows[i][iId]) || "rad-" + (i + 1));
    if (radId === id) {
      sh.getRange(i + 1, iStatus + 1).setValue(status);
      return svar_({ ok: true });
    }
  }
  return svar_({ ok: false, error: "fant ikke bestillingen" });
}
