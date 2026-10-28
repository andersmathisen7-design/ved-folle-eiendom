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
 *
 * Kjøretid:
 *  - Adressen slås opp hos Kartverket (gratis, uten nøkkel), og kjøretiden mellom alle stoppene hentes fra
 *    OSRM (gratis ruteberegning på OpenStreetMap). Kartverket får adressen, OSRM bare koordinater.
 *  - En dag fylles av den raskeste runden fra lageret innom alle stoppene og tilbake, pluss lossing og bæring.
 *    To bestillinger i samme gate koster derfor nesten bare lossetiden for den andre.
 *  - Finner vi ikke adressen, eller svarer ikke tjenestene, brukes de faste minuttene per område som før.
 */

var ARK = "Bestillinger";
var TIDSSONE = "Europe/Oslo";
var KOLONNER = ["ID", "Leveringsdag", "Minutter", "Status", "Navn", "Telefon", "Adresse", "Område", "Sekker",
                "Bæring", "Totalpris", "E-post", "Melding", "Registrert", "Lossetid", "Lat", "Lon", "Fast tid", "Betalt",
                "Duett kunde", "Duett ordre", "Duett merknad"];
var STATUSER = ["Ny", "Bekreftet", "Levert", "Avbestilt"];
var LEVERINGSDAGER = [1, 2];          // 1 = mandag, 2 = tirsdag
var MAKS_DAGER_FRAM = 42;             // nettbestillinger maks 6 uker fram
var MAKS_NETTBESTILLINGER_PER_TIME = 30;
var MAKS_FEIL_PASSORD = 10;           // per 15 minutter
var BILLETT_TIMER = 12, BILLETT_HUSK_DAGER = 30;

// Ruteberegning.
var LAGER = { lat: 59.68112, lon: 10.74194 };   // Smebølveien 3, 1433 Ås
var RUTE_TILLEGG = 1.2;                        // OSRM regner med personbil og tom vei; lastebil med ved går saktere
var LOSSING = 10, BAERING_PER_SEKK = 0.5;      // brukes bare for gamle rader uten «Lossetid» (samme tall som config.py)
var KOMMUNE = { "Ås": "3218", "Ski og Langhus": "3207", "Kolbotn og Oppegård": "3207", "Vestby og Son": "3216",
                "Drøbak": "3214", "Nesodden": "3212", "Enebakk": "3220" };
var FOLLO = ["3207", "3212", "3214", "3216", "3218", "3220"];
var MAKS_LEDIG_SJEKK_PER_TIME = 600;
var MAKS_PUNKTER = 100;                         // OSRM tar maks 100 punkter per oppslag

// Duett. «Bare levert» lager en kladd (startet ordre) i Duett for FOLLO EIENDOMSSERVICE AS. Ingenting faktureres
// eller sendes herfra. Se docs/plans/levert-til-duett.md. Nøklene ligger bare i skriptegenskapene.
var DUETT_URL = "https://api.duett.no";
var DUETT_SELSKAP = "FOLLO EIENDOMSSERVICE AS";
var DUETT_VARER = { ved: 189, levering: 190, baering: 172 };   // interne varer: Ved (40l), Hjemlevering, Tjeneste
var DUETT_PROSJEKT_VED = 247;                                 // bæreren for prosjekt 198 «Ved»
var PRIS_SEKK = 89, PRIS_LEVERING = 499;                       // kr inkl. mva, samme tall som config.py
var BAERING_TILLEGG = [12, 15, 16, 20, 24, 28, 34, 36];        // kr per sekk inkl. mva, CARRY_OPTIONS i config.py

// ------------------------------------------------------------------ meny i regnearket

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Vedlevering")
    .addItem("Lag nytt passord til eiersiden", "lagNyttPassord")
    .addItem("Logg ut alle enheter", "loggUtAlle")
    .addSeparator()
    .addItem("Koble til Duett", "kobleTilDuett")
    .addItem("Slå Duett-kladd av eller på", "duettAvPa")
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
  // Nye kolonner legges til bakerst i ark som ble laget før de fantes.
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var mangler = KOLONNER.filter(function (k) { return head.indexOf(k) < 0; });
  if (mangler.length) sh.getRange(1, head.length + 1, 1, mangler.length).setValues([mangler]);
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
      message: String(col(r, "Melding")), service: num_(col(r, "Lossetid")), lat: num_(col(r, "Lat")), lon: num_(col(r, "Lon")),
      // Faste minutter: eieren har skrevet inn tiden selv (telefonbestilling eller rad lagt inn for hånd uten ID).
      fixed: !col(r, "ID") || /^(ja|x|1)$/i.test(String(col(r, "Fast tid")).trim()),
      paid: /^(ja|x|1)$/i.test(String(col(r, "Betalt")).trim()),
      duettCustomer: String(col(r, "Duett kunde")).trim(), duettOrder: String(col(r, "Duett ordre")).trim(),
      duettNote: String(col(r, "Duett merknad")).trim(),
      registered: reg instanceof Date ? Utilities.formatDate(reg, TIDSSONE, "yyyy-MM-dd HH:mm") : String(reg)
    });
  }
  return out;
}

function num_(v) { return v === "" || v == null || isNaN(Number(v)) ? null : Number(v); }

// Kommende bestillinger som tar tid, gruppert per dag. Avbestilte teller ikke.
function perDag_(alle) {
  var idag = idag_(), out = {};
  (alle || bestillinger_()).forEach(function (b) {
    if (b.date >= idag && b.minutes > 0 && b.status !== "Avbestilt") (out[b.date] = out[b.date] || []).push(b);
  });
  return out;
}

// Brukt tid per dag fra i dag og framover (kjøring langs ruten + lossing og bæring).
function bestilt_(planer) {
  planer = planer || planer_(perDag_());
  var out = {};
  Object.keys(planer).forEach(function (d) { out[d] = planer[d].minutter; });
  return out;
}

function leggTil_(b, status) {
  var id = Utilities.getUuid().slice(0, 8);
  var verdier = {
    "ID": id, "Leveringsdag": "'" + b.date, "Minutter": Math.round(Number(b.minutes)) || 0, "Status": status,
    "Navn": tekst_(b.name, 80), "Telefon": tekst_(b.phone, 30), "Adresse": tekst_(b.address, 120),
    "Område": tekst_(b.area, 60), "Sekker": Math.max(0, Math.min(1000, Math.round(Number(b.sacks)) || 0)),
    "Bæring": tekst_(b.carry, 80), "Totalpris": tekst_(b.total, 40), "E-post": tekst_(b.email, 100),
    "Melding": tekst_(b.message, 1000), "Registrert": new Date(),
    "Lossetid": b.service == null ? "" : b.service, "Lat": b.lat == null ? "" : b.lat, "Lon": b.lon == null ? "" : b.lon,
    "Fast tid": b.fixed ? "ja" : ""
  };
  var sh = ark_(), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(head.map(function (h) { return h in verdier ? verdier[h] : ""; }));
  return id;
}

// Betalt kan bare være ja for leverte bestillinger. «Angre» (status Ny) fjerner også betalt.
// «Bare levert» lager en kladd i Duett etter at statusen er lagret. «Betalt og levert» og «Marker som betalt»
// gjør ingenting i Duett. Feiler Duett, er statusen likevel lagret, og feilen står i «Duett merknad».
function endreStatus_(id, status, betalt) {
  if (STATUSER.indexOf(status) < 0) return { ok: false, error: "ugyldig" };
  var sh = ark_(), rows = sh.getDataRange().getValues(), head = rows[0];
  var iId = head.indexOf("ID"), iStatus = head.indexOf("Status"), iBetalt = head.indexOf("Betalt");
  if (iStatus < 0) return { ok: false, error: "mangler Status-kolonne" };
  for (var i = 1; i < rows.length; i++) {
    var radId = String((iId >= 0 && rows[i][iId]) || "rad-" + (i + 1));
    if (radId === id) {
      var forrige = String(rows[i][iStatus]);
      sh.getRange(i + 1, iStatus + 1).setValue(status);
      if (iBetalt >= 0) sh.getRange(i + 1, iBetalt + 1).setValue(status === "Levert" && betalt ? "ja" : "");
      var svar = { ok: true };
      if (status === "Levert" && !betalt && forrige !== "Levert") {
        SpreadsheetApp.flush();
        svar.duett = duettKladd_(id);
      }
      return svar;
    }
  }
  return { ok: false, error: "fant ikke bestillingen" };
}

// ------------------------------------------------------------------ fulle dager

// Dager eieren har satt som fulle på eiersiden. Lagres i skriptegenskapene; passerte dager ryddes bort.
function fulleDager_() {
  var idag = idag_(), liste = [];
  try { liste = JSON.parse(PropertiesService.getScriptProperties().getProperty("fulle_dager") || "[]"); } catch (e) {}
  return liste.filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= idag; }).sort();
}

function settFull_(dato, full) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dato)) return { ok: false, error: "ugyldig" };
  var liste = fulleDager_().filter(function (d) { return d !== dato; });
  if (full && dato >= idag_()) liste.push(dato);
  PropertiesService.getScriptProperties().setProperty("fulle_dager", JSON.stringify(liste.sort()));
  return { ok: true, fullDays: liste };
}

// ------------------------------------------------------------------ ruter

// Slår opp en adresse i Follo hos Kartverket. Gir { lat, lon, postnr, poststed }, eller null. Svaret huskes i 6 timer.
function geokod_(adresse, omrade) {
  var a = String(adresse || "").replace(/\s+/g, " ").trim();
  if (a.length < 3) return null;
  var cache = CacheService.getScriptCache(), nokkel = "geo2_" + sha_(a.toLowerCase() + "|" + omrade).slice(0, 32);
  var husket = cache.get(nokkel);
  if (husket) return husket === "-" ? null : JSON.parse(husket);
  // Først bare gatenavn og nummer i kommunen for området, så hele teksten i hele landet (men bare treff i Follo).
  var gate = a.split(",")[0].trim(), kn = KOMMUNE[omrade], forsok = [];
  if (kn) forsok.push({ sok: gate, kommunenummer: kn }, { sok: gate, kommunenummer: kn, fuzzy: "true" });
  forsok.push({ sok: a.replace(/,/g, " ") });
  // Søket finner også «Kirkeveien 10» for «Kirkeveien 1», så riktig husnummer foretrekkes.
  var nr = (gate.match(/(\d+)\s*([a-zæøå])?\s*$/i) || []), treff = null, svarte = true;
  var riktigNr = function (x) { return !nr[1] || (x.nummer === Number(nr[1]) && (!nr[2] || String(x.bokstav).toLowerCase() === nr[2].toLowerCase())); };
  for (var i = 0; i < forsok.length && !treff; i++) {
    var q = forsok[i], url = "https://ws.geonorge.no/adresser/v1/sok?treffPerSide=20&utkoordsys=4258&" +
      Object.keys(q).map(function (k) { return k + "=" + encodeURIComponent(q[k]); }).join("&");
    try {
      var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) { svarte = false; continue; }
      var liste = (JSON.parse(r.getContentText()).adresser || [])
        .filter(function (x) { return FOLLO.indexOf(x.kommunenummer) >= 0 && x.representasjonspunkt; });
      var adr = liste.filter(riktigNr)[0] || liste[0];
      if (adr) treff = { lat: +adr.representasjonspunkt.lat.toFixed(6), lon: +adr.representasjonspunkt.lon.toFixed(6),
                         postnr: String(adr.postnummer || ""), poststed: String(adr.poststed || "") };
    } catch (e) { svarte = false; }
  }
  // «Fant ikke» huskes bare når Kartverket faktisk svarte, så et kort brudd ikke henger igjen.
  if (treff || svarte) cache.put(nokkel, treff ? JSON.stringify(treff) : "-", 6 * 3600);
  return treff;
}

// Kjøretid i sekunder mellom alle punktene, fra OSRM. Gir null hvis tjenesten ikke svarer.
function matrise_(pkt) {
  if (pkt.length < 2 || pkt.length > 100) return null;
  var koord = pkt.map(function (p) { return p.lon.toFixed(5) + "," + p.lat.toFixed(5); }).join(";");
  var cache = CacheService.getScriptCache(), nokkel = "osrm_" + sha_(koord).slice(0, 32), husket = cache.get(nokkel);
  if (husket) return JSON.parse(husket);
  try {
    var r = UrlFetchApp.fetch("https://router.project-osrm.org/table/v1/driving/" + koord + "?annotations=duration",
      { muteHttpExceptions: true });
    var j = JSON.parse(r.getContentText());
    if (j.code !== "Ok" || !j.durations) return null;
    var m = j.durations.map(function (rad) { return rad.map(function (s) { return s == null ? null : Math.round(s); }); });
    var tekst = JSON.stringify(m);
    if (tekst.length < 90000) cache.put(nokkel, tekst, 6 * 3600);
    return m;
  } catch (e) {
    return null;
  }
}

// Raskeste runde fra lageret (punkt 0) innom alle stoppene og tilbake. Eksakt for opptil 10 stopp,
// ellers nærmeste nabo forbedret med 2-opt. Gir { rekke: [plass i stopp], ben: [sekunder per etappe], sek }, eller null.
function rute_(m, stopp) {
  var n = stopp.length, i, j, k, mask;
  if (!n) return { rekke: [], ben: [], sek: 0 };
  var d = function (a, b) { var v = m[a][b]; return v == null ? Infinity : v; };
  var lengde = function (r) {
    var s = d(0, stopp[r[0]]) + d(stopp[r[r.length - 1]], 0);
    for (var x = 1; x < r.length; x++) s += d(stopp[r[x - 1]], stopp[r[x]]);
    return s;
  };
  var rekke = [];
  if (n <= 10) {
    var FULL = (1 << n) - 1, dp = [], fra = [];
    for (mask = 0; mask <= FULL; mask++) { dp.push(new Array(n).fill(Infinity)); fra.push(new Array(n).fill(-1)); }
    for (j = 0; j < n; j++) dp[1 << j][j] = d(0, stopp[j]);
    for (mask = 1; mask <= FULL; mask++) {
      for (j = 0; j < n; j++) {
        if (!(mask & (1 << j)) || dp[mask][j] === Infinity) continue;
        for (k = 0; k < n; k++) {
          if (mask & (1 << k)) continue;
          var nm = mask | (1 << k), v = dp[mask][j] + d(stopp[j], stopp[k]);
          if (v < dp[nm][k]) { dp[nm][k] = v; fra[nm][k] = j; }
        }
      }
    }
    var best = Infinity, sist = -1;
    for (j = 0; j < n; j++) { var t = dp[FULL][j] + d(stopp[j], 0); if (t < best) { best = t; sist = j; } }
    if (sist < 0) return null;
    mask = FULL;
    while (sist >= 0) { rekke.unshift(sist); var f = fra[mask][sist]; mask &= ~(1 << sist); sist = f; }
  } else {
    var igjen = stopp.map(function (_, x) { return x; }), her = 0;
    while (igjen.length) {
      var bi = 0;
      for (i = 1; i < igjen.length; i++) if (d(her, stopp[igjen[i]]) < d(her, stopp[igjen[bi]])) bi = i;
      var neste = igjen.splice(bi, 1)[0];
      rekke.push(neste); her = stopp[neste];
    }
    for (var bedre = true; bedre;) {
      bedre = false;
      for (i = 0; i < n - 1; i++) for (k = i + 1; k < n; k++) {
        var ny = rekke.slice(0, i).concat(rekke.slice(i, k + 1).reverse(), rekke.slice(k + 1));
        if (lengde(ny) < lengde(rekke) - 1) { rekke = ny; bedre = true; }
      }
    }
  }
  var punkter = [0].concat(rekke.map(function (x) { return stopp[x]; }), [0]), ben = [];
  for (i = 1; i < punkter.length; i++) ben.push(d(punkter[i - 1], punkter[i]));
  var sek = ben.reduce(function (s, x) { return s + x; }, 0);
  return isFinite(sek) ? { rekke: rekke, ben: ben, sek: sek } : null;
}

// Bestillinger med faste minutter tas ikke med i ruten, selv om de har koordinater.
function harKoord_(b) { return !!b && !b.fixed && b.lat != null && b.lon != null; }

// Lossing og bæring for én bestilling. Gamle rader uten «Lossetid» regnes ut fra sekker og bæring.
function lossetid_(b) {
  if (b.service != null) return b.service;
  return LOSSING + (/^\s*(ingen|$)/i.test(b.carry || "") ? 0 : (b.sacks || 0) * BAERING_PER_SEKK);
}

// Plan per dag: { minutter, kjoring, ruteOk, rute: [{ id, ben }], tilbake }.
// Bestillinger med koordinater kjøres i beste rekkefølge; de uten koordinater teller med de faste minuttene sine.
// ekstra (valgfri) er en ny bestilling som prøves på hver dag; da får hver plan også «med» = minutter med den.
// Kjøretidene hentes i ett oppslag for alle dagene når det er plass til det (maks 100 punkter), ellers ett per dag.
function planer_(perDag, ekstra) {
  var dager = Object.keys(perDag), alle = [];
  dager.forEach(function (d) { alle = alle.concat(perDag[d]); });
  var felles = nett_(ekstra ? alle.concat([ekstra]) : alle, true);
  var sum = function (liste, f) { return liste.reduce(function (s, b) { return s + f(b); }, 0); };
  var plan = function (liste, n) {
    var med = liste.filter(harKoord_), uten = liste.filter(function (b) { return !harKoord_(b); });
    var r = n.m && med.length ? rute_(n.m, med.map(n.nr)) : null;
    if (med.length && !r) return { minutter: sum(liste, function (b) { return b.minutes; }), kjoring: null, ruteOk: false, rute: [] };
    var min = function (sek) { return Math.round(sek / 60 * RUTE_TILLEGG); };
    var kjoring = r ? min(r.sek) : 0;
    return {
      minutter: Math.round(kjoring + sum(med, lossetid_) + sum(uten, function (b) { return b.minutes; })),
      kjoring: kjoring, ruteOk: !!r,
      rute: r ? r.rekke.map(function (x, n) { return { id: med[x].id, ben: min(r.ben[n]) }; }) : [],
      tilbake: r ? min(r.ben[r.ben.length - 1]) : 0
    };
  };
  var out = {};
  dager.forEach(function (d) {
    var n = felles || nett_(ekstra ? perDag[d].concat([ekstra]) : perDag[d]);
    out[d] = plan(perDag[d], n);
    if (ekstra) out[d].med = plan(perDag[d].concat([ekstra]), n).minutter;
  });
  return out;
}

// Punktene (lageret først) for bestillingene med koordinater, og kjøretidene mellom dem.
// Med kunHvisPlass gir den null når det er for mange punkter for ett oppslag, så planer_ kan dele opp per dag.
function nett_(liste, kunHvisPlass) {
  var pkt = [LAGER], plass = {};
  var nokkel = function (b) { return b.lat.toFixed(5) + "," + b.lon.toFixed(5); };
  liste.forEach(function (b) {
    if (harKoord_(b) && !(nokkel(b) in plass)) { plass[nokkel(b)] = pkt.length; pkt.push(b); }
  });
  if (kunHvisPlass && pkt.length > MAKS_PUNKTER) return null;
  return { m: pkt.length > MAKS_PUNKTER ? null : matrise_(pkt), nr: function (b) { return plass[nokkel(b)]; } };
}

// Gamle bestillinger uten koordinater slås opp når eiersiden henter listen (maks 15 om gangen).
// Bestillinger med faste minutter hoppes over, så tiden eieren har skrevet inn, blir stående.
function fyllKoordinater_(alle) {
  var idag = idag_();
  var mangler = alle.filter(function (b) {
    return b.date >= idag && b.status !== "Avbestilt" && !b.fixed && !harKoord_(b) && b.address;
  }).slice(0, 15);
  if (!mangler.length) return;
  var sh = ark_(), rows = sh.getDataRange().getValues(), head = rows[0];
  var iId = head.indexOf("ID"), iLat = head.indexOf("Lat"), iLon = head.indexOf("Lon");
  mangler.forEach(function (b) {
    var p = geokod_(b.address, b.area);
    if (!p) return;
    for (var i = 1; i < rows.length; i++) {
      if (String((iId >= 0 && rows[i][iId]) || "rad-" + (i + 1)) !== b.id) continue;
      sh.getRange(i + 1, iLat + 1).setValue(p.lat);
      sh.getRange(i + 1, iLon + 1).setValue(p.lon);
      b.lat = p.lat; b.lon = p.lon;
      break;
    }
  });
}

// Lossing og bæring fra nettsiden, kontrollert.
function service_(v) {
  var n = Number(v);
  return v === undefined || v === null || v === "" || !(n >= 0 && n <= 600) ? null : Math.round(n * 10) / 10;
}

// ------------------------------------------------------------------ nettadressen

// Slår opp adressen i en bestilling og legger på koordinater og lossetid. Verdiene fra nettsiden brukes ikke direkte.
function medKoord_(b) {
  var p = geokod_(b.address, String(b.area || ""));
  b.lat = p ? p.lat : null; b.lon = p ? p.lon : null;
  b.service = service_(b.service);
  if (b.service == null) b.lat = b.lon = null;   // uten lossetid kan ikke ruten regnes, så de faste minuttene brukes
}

// Bestillingsskjemaet spør hvilke dager en bestilling til denne adressen får plass. Svarer bare ja/nei per dag.
function ledig_(b) {
  var cache = CacheService.getScriptCache(), n = Number(cache.get("ledigsjekk")) || 0;
  if (n >= MAKS_LEDIG_SJEKK_PER_TIME) return { ok: false, error: "travelt" };
  cache.put("ledigsjekk", String(n + 1), 3600);
  var min = Math.round(Number(b.minutes)), kap = Number(b.capacity) || 300;
  if (!(min > 0 && min <= 24 * 60) || !(kap > 0 && kap <= 24 * 60)) return { ok: false, error: "ugyldig" };
  var ny = { address: String(b.address || "").slice(0, 120), area: String(b.area || "").slice(0, 60), service: b.service, minutes: min };
  medKoord_(ny);
  var planer = planer_(perDag_(), ny), fits = {}, fulle = fulleDager_();
  Object.keys(planer).forEach(function (d) { fits[d] = !(planer[d].minutter > 0) || planer[d].med <= kap; });
  fulle.forEach(function (d) { fits[d] = false; });
  return { ok: true, found: harKoord_(ny), fits: fits, booked: bestilt_(planer), fullDays: fulle };
}

// GET: bare bestilt tid per dag og dagene som er satt som fulle (brukes av bestillingsskjemaet). Ingen kundedata.
function doGet() {
  return svar_({ booked: bestilt_(), fullDays: fulleDager_() });
}

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return svar_({ ok: false, error: "ugyldig" }); }
  if (!b || typeof b !== "object") return svar_({ ok: false, error: "ugyldig" });

  // Eiersiden.
  if (b.action === "login") return svar_(loggInn_(b.password, b.remember === true));
  if (b.action === "logout") { loggUt_(b.token); return svar_({ ok: true }); }
  if (b.action === "list" || b.action === "status" || b.action === "add" || b.action === "full" || b.action === "duett") {
    if (!gyldigBillett_(b.token)) return svar_({ ok: false, error: "token" });
    if (b.action === "list") {
      var alle = bestillinger_();
      fyllKoordinater_(alle);
      return svar_({ ok: true, orders: alle, today: idag_(), plans: planer_(perDag_(alle)), depot: LAGER, fullDays: fulleDager_() });
    }
    if (b.action === "status") return svar_(endreStatus_(String(b.id || ""), String(b.status || ""), b.paid === true));
    if (b.action === "full") return svar_(settFull_(String(b.date || ""), b.full === true));
    if (b.action === "duett") return svar_(provDuettIgjen_(String(b.id || "")));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) || !(Number(b.minutes) >= 0 && Number(b.minutes) <= 24 * 60))
      return svar_({ ok: false, error: "ugyldig" });
    // Har eieren skrevet inn minuttene selv, kommer ingen lossetid. Da brukes minuttene som de er.
    b.fixed = service_(b.service) == null;
    if (b.fixed) b.service = b.lat = b.lon = null; else medKoord_(b);
    return svar_({ ok: true, id: leggTil_(b, "Bekreftet") });
  }
  if (b.action === "ledig") return svar_(ledig_(b));
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
  medKoord_(b);   // utenfor låsen, siden oppslaget kan ta litt tid

  // Lås, så to kunder som sender samtidig ikke begge får den siste plassen.
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    // Vern mot at noen fyller kalenderen med falske bestillinger.
    var cache = CacheService.getScriptCache(), n = Number(cache.get("nettbestillinger")) || 0;
    if (n >= MAKS_NETTBESTILLINGER_PER_TIME) return svar_({ ok: false, error: "travelt" });
    b.minutes = min;
    var dager = perDag_(), enDag = {};
    if (dager[dag]) enDag[dag] = dager[dag];
    if (fulleDager_().indexOf(dag) >= 0) return svar_({ ok: false, full: true, booked: bestilt_(planer_(dager)), fullDays: fulleDager_() });
    var plan = planer_(enDag, b)[dag];
    // En tom dag tar alltid imot, også en stor bestilling som alene er over grensen.
    if (plan && plan.minutter > 0 && plan.med > kap) return svar_({ ok: false, full: true, booked: bestilt_(planer_(dager)) });
    b.fixed = false;   // bare eieren kan sette faste minutter
    var id = leggTil_(b, "Ny");
    cache.put("nettbestillinger", String(n + 1), 3600);
    return svar_({ ok: true, id: id });
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------------ Duett

// Menyvalg: spør etter nøklene, tester dem, og lagrer dem i skriptegenskapene. Nøklene vises aldri igjen.
function kobleTilDuett() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties();
  var spor = function (tekst) {
    var r = ui.prompt("Koble til Duett", tekst, ui.ButtonSet.OK_CANCEL);
    return r.getSelectedButton() === ui.Button.OK ? r.getResponseText().trim() : null;
  };
  var ik = spor("Integrasjonsnøkkel (X-Api-Integration-Key):");
  if (!ik) return;
  var ck = spor("Klientnøkkel (X-Api-Client-Key):");
  if (!ck) return;
  var ref = spor("«Vår referanse» på ordrene, f.eks. navnet ditt:");
  if (ref === null) return;
  var test = duettIntegrasjon_({ integrasjon: ik, klient: ck });
  if (!test.ok) return ui.alert("Fikk ikke koblet til Duett: " + test.feil + "\n\nNøklene er ikke lagret.");
  props.setProperties({ DUETT_INTEGRATION_KEY: ik, DUETT_CLIENT_KEY: ck, duett_var_referanse: ref || "Follo Bjørkeved" });
  CacheService.getScriptCache().remove("duett_ok");
  ui.alert("Koblet til " + test.selskap + ".\nTilgang: " + test.roller.join(", ") + "\n\n" +
    (test.kanSkrive ? "Nøkkelen kan lage ordrer." : "Nøkkelen kan IKKE lage ordrer ennå (mangler OrderWrite). Be Duett om tilgang.") +
    "\nDuett-kladd er " + (duettPa_() ? "på." : "av. Slå den på med «Slå Duett-kladd av eller på»."));
}

// Menyvalg: bryteren duett_på = ja/nei. Av betyr at «levert» bare endrer arket.
function duettAvPa() {
  var ui = SpreadsheetApp.getUi(), pa = !duettPa_();
  if (ui.alert("Duett-kladd er " + (pa ? "av" : "på") + ".", (pa ? "Slå på" : "Slå av") + " nå?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty("duett_på", pa ? "ja" : "nei");
  ui.alert("Duett-kladd er " + (pa ? "på. «Bare levert» lager nå en kladd i Duett." : "av."));
}

function duettPa_() { return PropertiesService.getScriptProperties().getProperty("duett_på") === "ja"; }

function duettNokler_() {
  var p = PropertiesService.getScriptProperties();
  var ik = p.getProperty("DUETT_INTEGRATION_KEY"), ck = p.getProperty("DUETT_CLIENT_KEY");
  return ik && ck ? { integrasjon: ik, klient: ck } : null;
}

// Ett kall mot Duett. Gir { ok, kode, data } eller { ok: false, feil }. Feilteksten har aldri nøkler, headere eller adressen.
function duettKall_(metode, sti, body, nokler) {
  nokler = nokler || duettNokler_();
  if (!nokler) return { ok: false, feil: "Duett er ikke koblet til (Vedlevering → Koble til Duett)" };
  var opt = { method: metode, muteHttpExceptions: true,
    headers: { "X-Api-Integration-Key": nokler.integrasjon, "X-Api-Client-Key": nokler.klient, Accept: "application/json" } };
  if (body) { opt.contentType = "application/json"; opt.payload = JSON.stringify(body); }
  var r;
  try { r = UrlFetchApp.fetch(DUETT_URL + sti, opt); }
  catch (e) { return { ok: false, feil: "fikk ikke kontakt med Duett" }; }   // feilteksten kan inneholde adressen med kundedata
  var kode = r.getResponseCode(), data = null;
  try { data = JSON.parse(r.getContentText()); } catch (e) {}
  if (kode >= 200 && kode < 300) return { ok: true, kode: kode, data: data };
  return { ok: false, kode: kode, feil: duettFeiltekst_(kode, data) };
}

function duettFeiltekst_(kode, data) {
  var kjent = { 401: "nøklene ble ikke godtatt", 403: "nøkkelen har ikke tilgang til dette", 429: "for mange kall, prøv igjen om litt" };
  var deler = [];
  if (data && typeof data === "object") {
    ["title", "detail", "message"].forEach(function (k) { if (typeof data[k] === "string" && data[k]) deler.push(data[k]); });
    if (data.errors && typeof data.errors === "object") Object.keys(data.errors).forEach(function (k) { deler.push(k + ": " + data.errors[k]); });
  }
  return ("Duett svarte " + kode + (kjent[kode] ? " (" + kjent[kode] + ")" : "") + (deler.length ? ": " + deler.join(" – ") : "")).slice(0, 200);
}

// GET-adresse med filter. Duett vil ha filter[felt][OP]=verdi.
function duettSti_(base, par) {
  return base + "?" + par.map(function (p) { return encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1]); }).join("&");
}

// Hvilket selskap og hvilke roller nøklene gir. Bare FOLLO EIENDOMSSERVICE AS godtas.
function duettIntegrasjon_(nokler) {
  var r = duettKall_("get", "/System/v2/integration", null, nokler);
  if (!r.ok) return r;
  var d = r.data || {}, selskap = String((d.clientAccess || {}).name || ""), roller = d.grantedAccess || [];
  if (selskap.toUpperCase() !== DUETT_SELSKAP) return { ok: false, feil: "nøklene gjelder et annet selskap (" + selskap + ")" };
  return { ok: true, selskap: selskap, roller: roller, kanSkrive: roller.indexOf("OrderWrite") >= 0 };
}

// Sjekkes før første skriving, og huskes i 6 timer.
function duettKlar_() {
  var cache = CacheService.getScriptCache();
  if (cache.get("duett_ok")) return { ok: true };
  var t = duettIntegrasjon_();
  if (!t.ok) return t;
  if (!t.kanSkrive) return { ok: false, feil: "nøkkelen har ikke skrivetilgang i Duett (OrderWrite)" };
  cache.put("duett_ok", "1", 6 * 3600);
  return { ok: true };
}

// ------------------------------------------------------------------ Duett: beløp og adresse

// «2 279 kr», «2 279 kr per levering» eller «2279,-» → øre som heltall. Null hvis beløpet ikke kan leses.
function ore_(tekst) {
  var s = String(tekst == null ? "" : tekst);
  if (/avtales/i.test(s)) return null;
  var m = s.match(/\d[\d   .]*(,\d{1,2})?/);
  if (!m) return null;
  var kr = m[0].split(",")[0].replace(/\D/g, ""), des = m[1] ? m[1].slice(1) : "";
  if (!kr || kr.length > 7) return null;
  return Number(kr) * 100 + (des ? Number((des + "0").slice(0, 2)) : 0);
}

// Bæringstillegget per sekk i hele kroner. Nettbestillinger har «(+16 kr/sekk)» i teksten, «Ingen bæring …» er 0.
// Telefonbestillinger har bare «Bæres inn». Da regnes tillegget ut fra totalprisen, og det må være et av tilleggene på nettsiden.
function baering_(b, totalOre) {
  var t = String(b.carry || "").trim(), m = t.match(/\(\+\s*(\d+)\s*kr\s*\/\s*sekk\)/i);
  if (m) return Number(m[1]);
  if (!t || /^ingen/i.test(t)) return 0;
  if (!(b.sacks > 0) || totalOre == null) return null;
  var rest = totalOre - b.sacks * PRIS_SEKK * 100 - PRIS_LEVERING * 100;
  if (rest <= 0 || rest % (b.sacks * 100)) return null;
  return BAERING_TILLEGG.indexOf(rest / (b.sacks * 100)) >= 0 ? rest / (b.sacks * 100) : null;
}

// Pris uten mva i kroner, fra øre med 25 % mva. Null hvis det ikke går opp i hele øre.
function eksMva_(ore) { return (ore * 4) % 5 ? null : ore * 4 / 5 / 100; }

// Gateadresse, postnummer og poststed. Står postnummeret i adressen, brukes det; ellers slås adressen opp hos Kartverket.
function postadresse_(b) {
  var a = String(b.address || "").replace(/\s+/g, " ").trim();
  var m = a.match(/^(.*?)[,\s]+(\d{4})\s+([A-Za-zÆØÅæøå][A-Za-zÆØÅæøå .\-]*)$/);
  if (m && m[1]) return { gate: m[1].replace(/,\s*$/, "").trim(), postnr: m[2], poststed: m[3].trim() };
  var p = geokod_(a, b.area);
  return p && /^\d{4}$/.test(p.postnr) ? { gate: a.split(",")[0].trim(), postnr: p.postnr, poststed: p.poststed } : null;
}

function telefon8_(t) {
  var d = String(t || "").replace(/\D/g, "");
  if (d.length === 12 && d.indexOf("0047") === 0) d = d.slice(4);
  if (d.length === 10 && d.indexOf("47") === 0) d = d.slice(2);
  return /^\d{8}$/.test(d) ? d : "";
}

// Ordrelinjene og summen i øre. Gir { linjer, sumOre } eller { feil }.
function ordrelinjer_(b) {
  var totalOre = ore_(b.total);
  if (totalOre == null) return { feil: "kunne ikke lese totalprisen («" + String(b.total).slice(0, 40) + "»)" };
  if (!(b.sacks > 0)) return { feil: "mangler antall sekker" };
  var tillegg = baering_(b, totalOre);
  if (tillegg == null) return { feil: "kunne ikke finne bæringstillegget («" + String(b.carry).slice(0, 40) + "»)" };
  var linje = function (vare, navn, antall, kr) {
    return { articleId: vare, lineType: "normal", name: navn, countAgreed: antall, salesPrice: eksMva_(kr * 100), taxSaleId: "vat" };
  };
  var linjer = [linje(DUETT_VARER.ved, "Bjørkeved, 40 l sekk", b.sacks, PRIS_SEKK)];
  if (tillegg) {
    var valg = String(b.carry).replace(/\s*\(\+.*$/, "").trim();
    linjer.push(linje(DUETT_VARER.baering, "Bæring av ved" + (valg && !/^bæres inn$/i.test(valg) ? ": " + valg : ""), b.sacks, tillegg));
  }
  linjer.push(linje(DUETT_VARER.levering, "Hjemlevering", 1, PRIS_LEVERING));
  if (linjer.some(function (l) { return l.salesPrice == null; })) return { feil: "en pris går ikke opp i hele øre uten mva" };
  var sumOre = b.sacks * PRIS_SEKK * 100 + b.sacks * tillegg * 100 + PRIS_LEVERING * 100;
  if (sumOre !== totalOre)
    return { feil: "summen stemmer ikke: sekker og bæring gir " + sumOre / 100 + " kr, arket sier " + totalOre / 100 + " kr" };
  return { linjer: linjer, sumOre: sumOre };
}

// ------------------------------------------------------------------ Duett: kunde og ordre

// Kunder som passer, uten slettede. Gir { ok, liste } eller { ok: false, feil }.
function duettKunder_(par) {
  var r = duettKall_("get", duettSti_("/Customer/v2", par.concat([["extend", "ContactInfo"], ["filter[take]", "10"]])));
  if (!r.ok) return r;
  return { ok: true, liste: (r.data || []).filter(function (k) { return k && k.show !== false; }) };
}

// Finner kunden: kundenummeret i arket, så e-post, så telefon. Gir { kunde }, { feil } eller {} (ingen treff).
function finnKunde_(b) {
  if (b.duettCustomer) {
    var n = duettKunder_([["filter[customerNumber][EQ]", b.duettCustomer]]);
    if (!n.ok) return { feil: n.feil };
    return n.liste.length === 1 ? { kunde: n.liste[0] } : { feil: "fant ikke kundenummer " + b.duettCustomer + " i Duett" };
  }
  var tlf = telefon8_(b.phone), sok = [];
  if (b.email) sok.push([["filter[contactInfo.email][EQ]", String(b.email).trim().toLowerCase()]]);
  if (tlf) {
    var former = [tlf, "+47" + tlf, tlf.replace(/(\d{3})(\d{2})(\d{3})/, "$1 $2 $3"), "+47 " + tlf.replace(/(\d{3})(\d{2})(\d{3})/, "$1 $2 $3")];
    sok.push(former.map(function (f) { return ["filter[contactInfo.mobile][IN]", f]; }));
    sok.push(former.map(function (f) { return ["filter[contactInfo.phone1][IN]", f]; }));
  }
  for (var i = 0; i < sok.length; i++) {
    var r = duettKunder_(sok[i]);
    if (!r.ok) return { feil: r.feil };
    var unike = {};
    r.liste.forEach(function (k) { unike[k.id] = k; });
    var ider = Object.keys(unike);
    if (ider.length === 1) return { kunde: unike[ider[0]] };
    if (ider.length > 1) return { feil: "flere kunder i Duett passer – skriv kundenummeret i kolonnen «Duett kunde» og prøv igjen" };
  }
  return {};
}

// Ny privatkunde. Duett lager kundenummeret selv.
function nyKunde_(b, adr) {
  var tlf = telefon8_(b.phone), epost = String(b.email || "").trim().toLowerCase();
  var r = duettKall_("post", "/Customer/v2", {
    name: String(b.name).slice(0, 250),
    address: { address1: adr.gate.slice(0, 250), zipCodeKey: adr.postnr },
    contactInfo: { email: epost || null, mobile: tlf || null },
    paymentInfo: epost ? { invoiceEmail: epost, invoiceSendOption: "email" } : null
  });
  if (r.ok && r.data && r.data.id) return { kunde: r.data };
  if (r.ok || r.kode === 409) {
    var igjen = finnKunde_(b);   // laget, men svaret manglet kunden, eller samme kall to ganger
    if (igjen.kunde) return igjen;
  }
  return { feil: r.ok ? "kunden ble kanskje laget, men Duett svarte uten kundenummer – sjekk i Duett" : r.feil };
}

// Ordre som allerede er laget for bestillingen (finnes på orderReference). Gir { ok, ordre } (ordre kan være null).
function finnOrdre_(ref) {
  var r = duettKall_("get", duettSti_("/Order/v2", [["filter[orderReference][EQ]", ref], ["filter[take]", "5"]]));
  if (!r.ok) return r;
  return { ok: true, ordre: (r.data || [])[0] || null };
}

function ordreNr_(o) { return (o.number || "id " + o.id) + "/" + o.invoiceYear; }

// Lager kladden i Duett for én bestilling. Statusen i arket er alt lagret. Gir { ok, ordre } eller { ok: false, feil },
// og skriver kundenummer, ordrenummer eller merknad i raden. Kaster aldri.
function duettKladd_(id) {
  if (!duettPa_()) return { ok: false, av: true };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, feil: "kalenderen var opptatt – prøv igjen" };
  var rad = null;
  try {
    rad = duettRad_(id);
    if (!rad) return { ok: false, feil: "fant ikke bestillingen" };
    var b = rad.b;
    if (b.duettOrder) return { ok: true, ordre: b.duettOrder };
    var ut = lagKladd_(b, rad);
    rad.sett("Duett merknad", ut.ok ? (ut.merknad || "") : ut.feil);
    if (ut.ok) rad.sett("Duett ordre", ut.ordre);
    return ut;
  } catch (e) {
    if (rad) try { rad.sett("Duett merknad", "uventet feil i skriptet"); } catch (e2) {}
    return { ok: false, feil: "uventet feil i skriptet" };
  } finally {
    lock.releaseLock();
  }
}

function lagKladd_(b, rad) {
  var klar = duettKlar_();
  if (!klar.ok) return klar;
  var ref = "follobjorkeved-" + b.id;
  var fra = finnOrdre_(ref);
  if (!fra.ok) return fra;
  if (fra.ordre) return { ok: true, ordre: ordreNr_(fra.ordre) };   // laget før, men nummeret kom ikke inn i arket

  if (!String(b.name || "").trim()) return { ok: false, feil: "mangler navn – skriv navnet i arket og prøv igjen" };
  var l = ordrelinjer_(b);
  if (l.feil) return { ok: false, feil: l.feil };
  var adr = postadresse_(b);
  if (!adr) return { ok: false, feil: "fant ikke postnummer – skriv adressen som «Gate 1, 1234 Sted» i arket og prøv igjen" };

  var k = finnKunde_(b);
  if (k.feil) return { ok: false, feil: k.feil };
  if (!k.kunde) k = nyKunde_(b, adr);
  if (k.feil) return { ok: false, feil: k.feil };
  if (k.kunde.customerNumber) rad.sett("Duett kunde", k.kunde.customerNumber);

  var idag = idag_(), p = b.date.split("-");
  var ordre = {
    customerId: k.kunde.id, orderCategory: "order", orderType: "normal", status: "saved", payType: "invoice",
    config: { directInvoicing: false },
    invoiceYear: Number(idag.slice(0, 4)), orderDate: idag + "T00:00:00", deliveryDate: b.date + "T00:00:00",
    deliveryAddress: adr.gate + "\r\n" + adr.postnr + " " + adr.poststed,
    ourReference: PropertiesService.getScriptProperties().getProperty("duett_var_referanse") || "Follo Bjørkeved",
    orderReference: ref, internalReference: "follobjorkeved.no, bestilling " + b.id,
    invoiceNote: "Levering av bjørkeved " + Number(p[2]) + "." + Number(p[1]) + "." + p[0] + ".",
    carriers: [{ carrierId: DUETT_PROSJEKT_VED }],
    orderLines: l.linjer
  };
  var r = duettKall_("post", "/Order/v2", ordre);
  var o = r.ok ? r.data : null;
  if (!o || !o.id) {
    var igjen = finnOrdre_(ref);   // 409 (samme kall to ganger) eller svar uten ordre: sjekk om den ble laget
    if (igjen.ok && igjen.ordre) o = igjen.ordre;
    else return { ok: false, feil: r.ok ? "Duett svarte uten ordrenummer – sjekk i Duett før du prøver igjen" : r.feil };
  }
  var nr = ordreNr_(o), brutto = Math.round(Number(o.grossAmount) * 100);
  var merknad = o.grossAmount != null && brutto !== l.sumOre
    ? "kladd " + nr + " er laget, men Duett regnet " + brutto / 100 + " kr i stedet for " + l.sumOre / 100 + " kr – sjekk den" : "";
  return { ok: true, ordre: nr, merknad: merknad };
}

// Raden for en bestilling, med en hjelper som skriver i en kolonne. Rader uten ID får en, så orderReference blir fast.
function duettRad_(id) {
  var sh = ark_(), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], iId = head.indexOf("ID");
  var alle = bestillinger_(), b = alle.filter(function (x) { return x.id === id; })[0];
  if (!b) return null;
  var rows = sh.getDataRange().getValues(), nr = -1;
  for (var i = 1; i < rows.length; i++) if (String((iId >= 0 && rows[i][iId]) || "rad-" + (i + 1)) === id) { nr = i + 1; break; }
  if (nr < 0) return null;
  var sett = function (navn, verdi) {
    var c = head.indexOf(navn);
    if (c >= 0) sh.getRange(nr, c + 1).setValue(verdi === "" ? "" : "'" + tekst_(verdi, 300).replace(/^'/, ""));
  };
  if (!rows[nr - 1][iId] && iId >= 0) {
    b.id = Utilities.getUuid().slice(0, 8);
    sh.getRange(nr, iId + 1).setValue(b.id);
  }
  return { b: b, sett: sett };
}

// «Prøv igjen» på eiersiden. Bare for leverte bestillinger som ikke er betalt og ikke har en ordre i Duett.
function provDuettIgjen_(id) {
  var b = bestillinger_().filter(function (x) { return x.id === id; })[0];
  if (!b) return { ok: false, error: "fant ikke bestillingen" };
  if (b.status !== "Levert" || b.paid) return { ok: false, error: "bare bestillinger som er levert og ikke betalt, sendes til Duett" };
  if (!duettPa_()) return { ok: false, error: "Duett-kladd er slått av (Vedlevering → Slå Duett-kladd av eller på)" };
  var r = duettKladd_(id);
  return r.ok ? { ok: true, duett: r } : { ok: false, error: "ikke sendt til Duett – " + r.feil };
}
