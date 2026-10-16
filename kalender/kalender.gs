/**
 * Follo Bjørkeved – leveringskalender.
 * Lagrer bestillingene i arket «Bestillinger», teller hvor mye tid som er bestilt per leveringsdag,
 * og gir eiersiden (follobjorkeved.no/admin/) oversikten over bestillingene.
 * Limes inn i Utvidelser → Apps Script i regnearket. Se kalender/README.md.
 *
 * Sikkerhet:
 *  - Passordet til eiersiden lages av skriptet (menyen «Vedlevering» i regnearket) og lagres bare som
 *    en saltet SHA-256-sjekksum i skriptegenskapene. Det står aldri i koden eller i GitHub.
 *  - Eiersiden får en tilfeldig innloggingsbillett som utløper (12 timer, eller 30 dager med «husk meg»).
 *    Nytt passord eller «Logg ut alle enheter» gjør alle billetter ugyldige.
 *  - Maks 10 feil passord per 15 minutter, deretter stengt i 15 minutter.
 *  - All tekst fra nettsiden lagres som ren tekst, så den aldri kan bli en formel i arket.
 *  - Nettbestillinger godtas bare for leveringsdager de neste ukene, og maks 30 per time.
 *  - Uten innlogging kan man bare se hvor mange minutter som er bestilt per dag – ingen kundedata.
 */

var ARK = "Bestillinger";
var TIDSSONE = "Europe/Oslo";
var KOLONNER = ["ID", "Leveringsdag", "Minutter", "Status", "Navn", "Telefon", "Adresse", "Område", "Sekker",
                "Bæring", "Totalpris", "E-post", "Melding", "Registrert"];
var STATUSER = ["Ny", "Bekreftet", "Levert", "Avbestilt"];
var LEVERINGSDAGER = [1, 2];          // 1 = mandag, 2 = tirsdag
var MAKS_DAGER_FRAM = 42;             // nettbestillinger maks 6 uker fram
var MAKS_NETTBESTILLINGER_PER_TIME = 30;
var MAKS_FEIL_PASSORD = 10;           // per 15 minutter
var BILLETT_TIMER = 12, BILLETT_HUSK_DAGER = 30;

// ------------------------------------------------------------------ meny i regnearket

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Vedlevering")
    .addItem("Lag nytt passord til eiersiden", "lagNyttPassord")
    .addItem("Logg ut alle enheter", "loggUtAlle")
    .addToUi();
}

// Lager et nytt, tilfeldig passord, viser det én gang, og logger ut alle enheter.
function lagNyttPassord() {
  ark_();
  var tegn = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789", pw = "";
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
  for (var i = 0; i < 20; i++) pw += tegn.charAt((bytes[i] + 256) % tegn.length);
  pw = pw.replace(/(.{5})(?!$)/g, "$1-");   // f.eks. abcde-fghij-kmnpq-rstuv
  var salt = Utilities.getUuid();
  var props = PropertiesService.getScriptProperties();
  props.setProperty("pw_salt", salt);
  props.setProperty("pw_hash", sha_(salt + pw));
  slettBilletter_();
  var tekst = "Nytt passord til eiersiden (follobjorkeved.no/admin/):\n\n" + pw +
    "\n\nSkriv det ned eller lagre det i en passordbehandler. Det vises ikke igjen. Alle enheter er logget ut.";
  try { SpreadsheetApp.getUi().alert(tekst); } catch (e) { Logger.log(tekst); }
}

function loggUtAlle() {
  slettBilletter_();
  try { SpreadsheetApp.getUi().alert("Alle enheter er logget ut av eiersiden."); } catch (e) { Logger.log("Alle enheter er logget ut."); }
}

// ------------------------------------------------------------------ hjelpere

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

function sha_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ("0" + ((b + 256) % 256).toString(16)).slice(-2); }).join("");
}

// Sammenligning som tar like lang tid uansett hvor tidlig strengene er ulike.
function likt_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function idag_() { return Utilities.formatDate(new Date(), TIDSSONE, "yyyy-MM-dd"); }

function leggTilDager_(iso, n) {
  var d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dato_(v) {
  return v instanceof Date ? Utilities.formatDate(v, TIDSSONE, "yyyy-MM-dd") : String(v).trim();
}

// Tekst fra nettsiden: kortes ned, og lagres som ren tekst (et ' foran gjør at Sheets aldri tolker den som formel).
function tekst_(v, max) {
  var s = String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function svar_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------ innlogging

function loggInn_(passord, husk) {
  var props = PropertiesService.getScriptProperties(), cache = CacheService.getScriptCache();
  var salt = props.getProperty("pw_salt"), hash = props.getProperty("pw_hash");
  if (!salt || !hash) return { ok: false, error: "ikke-satt-opp" };
  var feil = Number(cache.get("feil_passord")) || 0;
  if (feil >= MAKS_FEIL_PASSORD) return { ok: false, error: "sperret" };
  if (!likt_(sha_(salt + String(passord || "")), hash)) {
    cache.put("feil_passord", String(feil + 1), 15 * 60);
    return { ok: false, error: "passord" };
  }
  ryddBilletter_();
  var billett = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  var utloper = Date.now() + (husk ? BILLETT_HUSK_DAGER * 864e5 : BILLETT_TIMER * 36e5);
  props.setProperty("billett_" + sha_(billett), String(utloper));
  return { ok: true, token: billett, expires: utloper };
}

function gyldigBillett_(billett) {
  if (!billett || String(billett).length < 40) return false;
  var utloper = Number(PropertiesService.getScriptProperties().getProperty("billett_" + sha_(String(billett))));
  return utloper > Date.now();
}

function loggUt_(billett) {
  if (billett) PropertiesService.getScriptProperties().deleteProperty("billett_" + sha_(String(billett)));
}

function ryddBilletter_() {
  var props = PropertiesService.getScriptProperties(), alle = props.getProperties(), na = Date.now();
  Object.keys(alle).forEach(function (k) {
    if (k.indexOf("billett_") === 0 && Number(alle[k]) < na) props.deleteProperty(k);
  });
}

function slettBilletter_() {
  var props = PropertiesService.getScriptProperties(), alle = props.getProperties();
  Object.keys(alle).forEach(function (k) { if (k.indexOf("billett_") === 0) props.deleteProperty(k); });
}

// ------------------------------------------------------------------ bestillinger

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

function leggTil_(b, status) {
  var id = Utilities.getUuid().slice(0, 8);
  var verdier = {
    "ID": id, "Leveringsdag": "'" + b.date, "Minutter": Math.round(Number(b.minutes)) || 0, "Status": status,
    "Navn": tekst_(b.name, 80), "Telefon": tekst_(b.phone, 30), "Adresse": tekst_(b.address, 120),
    "Område": tekst_(b.area, 60), "Sekker": Math.max(0, Math.min(1000, Math.round(Number(b.sacks)) || 0)),
    "Bæring": tekst_(b.carry, 80), "Totalpris": tekst_(b.total, 40), "E-post": tekst_(b.email, 100),
    "Melding": tekst_(b.message, 1000), "Registrert": new Date()
  };
  var sh = ark_(), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(head.map(function (h) { return h in verdier ? verdier[h] : ""; }));
  return id;
}

function endreStatus_(id, status) {
  if (STATUSER.indexOf(status) < 0) return { ok: false, error: "ugyldig" };
  var sh = ark_(), rows = sh.getDataRange().getValues(), head = rows[0];
  var iId = head.indexOf("ID"), iStatus = head.indexOf("Status");
  if (iStatus < 0) return { ok: false, error: "mangler Status-kolonne" };
  for (var i = 1; i < rows.length; i++) {
    var radId = String((iId >= 0 && rows[i][iId]) || "rad-" + (i + 1));
    if (radId === id) {
      sh.getRange(i + 1, iStatus + 1).setValue(status);
      return { ok: true };
    }
  }
  return { ok: false, error: "fant ikke bestillingen" };
}

// ------------------------------------------------------------------ nettadressen

// GET: bare bestilt tid per dag (brukes av bestillingsskjemaet). Ingen kundedata.
function doGet() {
  return svar_({ booked: bestilt_() });
}

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return svar_({ ok: false, error: "ugyldig" }); }
  if (!b || typeof b !== "object") return svar_({ ok: false, error: "ugyldig" });

  // Eiersiden.
  if (b.action === "login") return svar_(loggInn_(b.password, b.remember === true));
  if (b.action === "logout") { loggUt_(b.token); return svar_({ ok: true }); }
  if (b.action === "list" || b.action === "status" || b.action === "add") {
    if (!gyldigBillett_(b.token)) return svar_({ ok: false, error: "token" });
    if (b.action === "list") return svar_({ ok: true, orders: bestillinger_(), today: idag_() });
    if (b.action === "status") return svar_(endreStatus_(String(b.id || ""), String(b.status || "")));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) || !(Number(b.minutes) >= 0 && Number(b.minutes) <= 24 * 60))
      return svar_({ ok: false, error: "ugyldig" });
    return svar_({ ok: true, id: leggTil_(b, "Bekreftet") });
  }
  if (b.action) return svar_({ ok: false, error: "ugyldig" });

  // Bestilling fra nettsiden.
  var dag = String(b.date || ""), min = Math.round(Number(b.minutes)), kap = Number(b.capacity) || 300;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dag) || !(min > 0 && min <= 24 * 60) || !(kap > 0 && kap <= 24 * 60))
    return svar_({ ok: false, error: "ugyldig" });
  // Ingen levering samme dag eller bakover i tid, bare leveringsdager, og ikke for langt fram.
  var idag = idag_();
  if (dag <= idag || dag > leggTilDager_(idag, MAKS_DAGER_FRAM) ||
      LEVERINGSDAGER.indexOf(new Date(dag + "T12:00:00Z").getUTCDay()) < 0)
    return svar_({ ok: false, error: "dato", booked: bestilt_() });

  // Lås, så to kunder som sender samtidig ikke begge får den siste plassen.
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    // Vern mot at noen fyller kalenderen med falske bestillinger.
    var cache = CacheService.getScriptCache(), n = Number(cache.get("nettbestillinger")) || 0;
    if (n >= MAKS_NETTBESTILLINGER_PER_TIME) return svar_({ ok: false, error: "travelt" });
    var bk = bestilt_(), brukt = bk[dag] || 0;
    // En tom dag tar alltid imot, også en stor bestilling som alene er over grensen.
    if (brukt > 0 && brukt + min > kap) return svar_({ ok: false, full: true, booked: bk });
    b.minutes = min;
    b.name = "";
    var id = leggTil_(b, "Ny");
    cache.put("nettbestillinger", String(n + 1), 3600);
    return svar_({ ok: true, id: id });
  } finally {
    lock.releaseLock();
  }
}
