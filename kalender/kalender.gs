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
                "Bæring", "Totalpris", "E-post", "Melding", "Registrert", "Lossetid", "Lat", "Lon", "Fast tid"];
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

// ------------------------------------------------------------------ ruter

// Slår opp en adresse i Follo hos Kartverket. Gir { lat, lon }, eller null. Svaret huskes i 6 timer.
function geokod_(adresse, omrade) {
  var a = String(adresse || "").replace(/\s+/g, " ").trim();
  if (a.length < 3) return null;
  var cache = CacheService.getScriptCache(), nokkel = "geo_" + sha_(a.toLowerCase() + "|" + omrade).slice(0, 32);
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
      if (adr) treff = { lat: +adr.representasjonspunkt.lat.toFixed(6), lon: +adr.representasjonspunkt.lon.toFixed(6) };
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
  var planer = planer_(perDag_(), ny), fits = {};
  Object.keys(planer).forEach(function (d) { fits[d] = !(planer[d].minutter > 0) || planer[d].med <= kap; });
  return { ok: true, found: harKoord_(ny), fits: fits, booked: bestilt_(planer) };
}

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
    if (b.action === "list") {
      var alle = bestillinger_();
      fyllKoordinater_(alle);
      return svar_({ ok: true, orders: alle, today: idag_(), plans: planer_(perDag_(alle)), depot: LAGER });
    }
    if (b.action === "status") return svar_(endreStatus_(String(b.id || ""), String(b.status || "")));
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
    var plan = planer_(enDag, b)[dag];
    // En tom dag tar alltid imot, også en stor bestilling som alene er over grensen.
    if (plan && plan.minutter > 0 && plan.med > kap) return svar_({ ok: false, full: true, booked: bestilt_(planer_(dager)) });
    b.name = "";
    b.fixed = false;   // bare eieren kan sette faste minutter
    var id = leggTil_(b, "Ny");
    cache.put("nettbestillinger", String(n + 1), 3600);
    return svar_({ ok: true, id: id });
  } finally {
    lock.releaseLock();
  }
}
