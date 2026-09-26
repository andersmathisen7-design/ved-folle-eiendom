// «Lønner det seg å fyre i dag?» – henter dagens strømpris og sammenligner med ved.
// Brukes både på /fyre-i-dag/ og i widgeten /widget/fyre-i-dag/. Innstillinger kommer fra window.FYRE (config.py).
(function () {
  var F = window.FYRE, root = document.getElementById("fyre");
  if (!F || !root) return;
  var $ = function (id) { return document.getElementById(id); };
  var kr = function (n) { return n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr"; };
  var zoneSel = $("fz"), vedIn = $("fved"), nettIn = $("fnett"), nattIn = $("fnatt"), avtaleSel = $("favtale"), ovnSel = $("fovn");
  var cache = {};

  function osloDate(d) {
    // «sv-SE» gir formatet ÅÅÅÅ-MM-DD.
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(d);
  }

  function load(zone) {
    var day = osloDate(new Date()), p = day.split("-");
    var key = zone + day;
    if (cache[key]) return Promise.resolve(cache[key]);
    var url = "https://www.hvakosterstrommen.no/api/v1/prices/" + p[0] + "/" + p[1] + "-" + p[2] + "_" + zone + ".json";
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) { cache[key] = j; return j; });
  }

  function num(el, def) {
    var v = parseFloat(String(el && el.value || "").replace(",", "."));
    return isFinite(v) && v >= 0 ? v : def;
  }

  // Elvia: dagpris hverdager kl. 06–22, ellers natt/helg-pris.
  var osloParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", weekday: "short", hour: "2-digit", hourCycle: "h23" });
  function isDay(d) {
    var p = {};
    osloParts.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var h = +p.hour;
    return p.weekday !== "Sat" && p.weekday !== "Sun" && h >= 6 && h < 22;
  }

  function compute(rows) {
    var zone = zoneSel ? zoneSel.value : F.zone;
    var mva = F.noMvaZones.indexOf(zone) >= 0 ? 1 : 1.25;
    var nettDag = num(nettIn, F.nettDayOre) / 100, nettNatt = num(nattIn, F.nettNightOre) / 100;
    var avtale = avtaleSel ? avtaleSel.value : "spot";
    var share = avtale === "spot" ? F.supportShare : 0;
    var eff = ovnSel ? +ovnSel.value : F.efficiency;
    var ved = num(vedIn, F.sackPrice) / (F.sackKg * F.kwhPerKg * eff);
    var hours = rows.map(function (r) {
      var spot = r.NOK_per_kWh;                                     // eks. mva
      var stotte = Math.max(0, spot - F.supportThreshold) * share;
      var energi = avtale === "norgespris" ? F.norgesprisKr : (spot + F.markupKr - stotte) * mva;
      var start = new Date(r.time_start);
      return { start: start, end: new Date(r.time_end), spot: spot * mva, el: energi + (isDay(start) ? nettDag : nettNatt) };
    });
    // Spotprisen (eks. mva) der ved og strøm koster det samme på dagtid.
    var rest = ved - nettDag;
    var breakeven = avtale === "norgespris" ? null
      : share ? (rest / mva - F.markupKr - share * F.supportThreshold) / (1 - share)
      : rest / mva - F.markupKr;
    var now = Date.now(), cur = hours[0];
    hours.forEach(function (h) { if (h.start <= now && now < h.end) cur = h; });
    var avg = hours.reduce(function (s, h) { return s + h.el; }, 0) / hours.length;
    var cheaper = hours.filter(function (h) { return h.el > ved; });
    return { hours: hours, cur: cur, avg: avg, ved: ved, vp: cur.el / F.cop, cheaper: cheaper, zone: zone,
      breakeven: breakeven, mva: mva };
  }

  function hh(d) { return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" }); }

  function chart(R) {
    var el = $("fchart");
    if (!el) return;
    var W = Math.max(300, Math.round(el.clientWidth || 720)), H = W < 500 ? 180 : 220, padL = 34, padB = 26, padT = 18;
    var max = Math.max(R.ved * 1.25, Math.max.apply(null, R.hours.map(function (h) { return h.el; })) * 1.08);
    var n = R.hours.length, bw = (W - padL) / n, gap = n > 30 || W < 500 ? 1 : 2, step = W < 500 ? 6 : 3;
    var y = function (v) { return padT + (H - padT - padB) * (1 - v / max); };
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Strømpris time for time i dag sammenlignet med ved">';
    for (var t = 0; t <= max; t += (max > 3 ? 1 : 0.5)) {
      s += '<line class="grid" x1="' + padL + '" x2="' + W + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' +
        '<text class="ax" x="' + (padL - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + t.toLocaleString("nb-NO") + "</text>";
    }
    R.hours.forEach(function (h, i) {
      var x = padL + i * bw + gap / 2, top = y(h.el), hgt = Math.max(1, y(0) - top);
      var cls = h.el > R.ved ? "bar hot" : "bar";
      if (h === R.cur) cls += " now";
      s += '<rect class="' + cls + '" x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + (bw - gap).toFixed(1) +
        '" height="' + hgt.toFixed(1) + '" rx="2"><title>' + hh(h.start) + "–" + hh(h.end) + ": strøm " + kr(h.el) +
        " per kWh" + (h.el > R.ved ? " (ved er billigere)" : "") + "</title></rect>";
      var lab = new Date(h.start).toLocaleTimeString("nb-NO", { hour: "2-digit", timeZone: "Europe/Oslo" });
      if (h.start.getMinutes() === 0 && (+lab % step === 0))
        s += '<text class="ax" x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + lab + "</text>";
    });
    s += '<line class="vedline" x1="' + padL + '" x2="' + W + '" y1="' + y(R.ved) + '" y2="' + y(R.ved) + '"/>' +
      '<text class="vedlab" x="' + (W - 4) + '" y="' + (y(R.ved) - 6) + '" text-anchor="end">Ved: ' + kr(R.ved) + "</text></svg>";
    el.innerHTML = s;
    var tb = $("ftable");
    if (tb) tb.innerHTML = R.hours.map(function (h) {
      return "<tr><td>" + hh(h.start) + "–" + hh(h.end) + "</td><td>" + kr(h.spot) + "</td><td>" + kr(h.el) + "</td><td>" +
        (h.el > R.ved ? "Ved" : "Strøm") + "</td></tr>";
    }).join("");
  }

  function render(R) {
    var yes = R.cur.el > R.ved;
    $("fsvar").textContent = yes ? "Ja – akkurat nå er ved billigere enn strøm." : "Nei – akkurat nå er strøm billigere enn ved.";
    $("fsvar").className = "fyre-svar " + (yes ? "ja" : "nei");
    $("fel").textContent = kr(R.cur.el);
    $("fvedkwh").textContent = kr(R.ved);
    $("fvp").textContent = kr(R.vp);
    $("fsnitt").textContent = kr(R.avg);
    var info = $("finfo");
    if (info) {
      var c = R.cheaper.length, tot = R.hours.length, unit = tot > 30 ? "kvarter" : "timer";
      info.textContent = c === 0 ? "Strøm er billigere enn ved hele dagen i dag (" + R.zone + ")."
        : c === tot ? "Ved er billigere enn strøm hele dagen i dag (" + R.zone + ")."
        : "Ved er billigere i " + c + " av " + tot + " " + unit + " i dag (" + R.zone + "), fra " +
          R.cheaper.map(function (h) { return hh(h.start); }).slice(0, 4).join(", ") + (c > 4 ? " …" : "") + ".";
    }
    var be = $("fbe");
    if (be) be.textContent = R.breakeven == null
      ? "Med Norgespris er strømprisen fast, så svaret endrer seg ikke gjennom dagen."
      : "Ved blir billigst på dagtid først når spotprisen passerer " + kr(Math.max(0, R.breakeven * R.mva)) + " per kWh inkl. mva.";
    chart(R);
    var st = $("fstatus");
    if (st) st.textContent = "Oppdatert " + new Date().toLocaleString("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "long", timeStyle: "short" });
  }

  function run() {
    var zone = zoneSel ? zoneSel.value : F.zone;
    load(zone).then(function (rows) { render(compute(rows)); }).catch(function () {
      $("fsvar").textContent = "Klarte ikke å hente dagens strømpris. Prøv igjen litt senere.";
      $("fsvar").className = "fyre-svar";
    });
  }

  [zoneSel, vedIn, nettIn, nattIn, avtaleSel, ovnSel].forEach(function (el) {
    if (el) el.addEventListener("change", run);
  });
  run();
  setInterval(run, 15 * 60 * 1000);
})();
