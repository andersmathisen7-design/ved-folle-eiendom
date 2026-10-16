/**
 * Follo Bjørkeved – leveringskalender.
 * Teller hvor mye tid som er bestilt per leveringsdag, så nettsiden kan vise hvilke dager som er fulle.
 * Limes inn i Utvidelser → Apps Script i et Google Regneark. Se kalender/README.md.
 *
 * Arket «Bestillinger» har én rad per levering. Dere kan selv:
 *  - slette en rad når en kunde avbestiller (da blir tiden ledig igjen),
 *  - legge inn telefonbestillinger som en ny rad,
 *  - stenge en dag ved å legge inn en rad med f.eks. 300 minutter.
 */
var ARK = "Bestillinger";
var TIDSSONE = "Europe/Oslo";

function ark_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ARK);
  if (!sh) {
    sh = ss.insertSheet(ARK);
    sh.appendRow(["Leveringsdag", "Minutter", "Område", "Sekker", "Navn", "Registrert"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Summen av minutter per dag, fra i dag og framover. Dato kan stå som tekst (2026-10-19) eller som dato i arket.
function bestilt_() {
  var rows = ark_().getDataRange().getValues(), idag = Utilities.formatDate(new Date(), TIDSSONE, "yyyy-MM-dd"), out = {};
  for (var i = 1; i < rows.length; i++) {
    var v = rows[i][0], dag = v instanceof Date ? Utilities.formatDate(v, TIDSSONE, "yyyy-MM-dd") : String(v).trim();
    var min = Number(rows[i][1]) || 0;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dag) && dag >= idag && min > 0) out[dag] = (out[dag] || 0) + min;
  }
  return out;
}

function svar_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return svar_({ booked: bestilt_() });
}

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return svar_({ ok: false, error: "ugyldig" }); }
  var dag = String(b.date || ""), min = Math.round(Number(b.minutes)), kap = Number(b.capacity) || 300;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dag) || !(min > 0 && min <= 24 * 60)) return svar_({ ok: false, error: "ugyldig" });

  // Lås, så to kunder som sender samtidig ikke begge får den siste plassen.
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var bk = bestilt_(), brukt = bk[dag] || 0;
    // En tom dag tar alltid imot, også en stor bestilling som alene er over grensen.
    if (brukt > 0 && brukt + min > kap) return svar_({ ok: false, full: true, booked: bk });
    ark_().appendRow(["'" + dag, min, String(b.area || "").slice(0, 60), Number(b.sacks) || "",
                      String(b.name || "").slice(0, 80), new Date()]);
    return svar_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}
