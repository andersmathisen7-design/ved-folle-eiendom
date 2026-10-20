// Eiersiden (/admin/): bestillinger per leveringsdag, hentet fra leveringskalenderen (kalender/kalender.gs).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var A = {};
  try { A = JSON.parse($("admin-cfg").textContent); } catch (e) {}
  var D = A.days || {}, CAP = D.minutes_per_day || 300;
  // Innloggingsbillett fra kalenderen (ikke passordet). «Husk meg» = localStorage, ellers bare til fanen lukkes.
  var KEY = "folloAdminToken", token = "";
  var store = {
    get: function () {
      try { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || ""; } catch (e) { return token; }
    },
    set: function (t, remember) {
      token = t;
      try { (remember ? localStorage : sessionStorage).setItem(KEY, t); } catch (e) {}
    },
    clear: function () {
      token = "";
      try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {}
    }
  };
  token = store.get();
  var orders = [], plans = {}, depot = null, today = "", view = "kommende";

  if (!A.calendarUrl) { $("a-nocal").hidden = false; return; }

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var dayLabel = function (iso) {
    var p = iso.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
    var t = d.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  var nb = function (n) { return Number(n).toLocaleString("nb-NO"); };

  function showLogin(msg) {
    $("a-app").hidden = true; $("a-actions").hidden = true; $("a-login").hidden = false;
    $("a-login-msg").textContent = msg || "";
    $("a-key").focus();
  }

  var ERR = {
    passord: "Feil passord.", sperret: "For mange feil forsøk. Vent 15 minutter og prøv igjen.",
    "ikke-satt-opp": "Passordet er ikke laget ennå. Åpne regnearket og velg Vedlevering → Lag nytt passord til eiersiden.",
    token: "Du er logget ut. Logg inn igjen."
  };

  var SPIN = '<span class="spinner" aria-hidden="true"></span>';
  // Første lasting viser en stor spinner; ved «Oppdater» blir lista stående (nedtonet) med en liten spinner.
  function busy(on) {
    var first = $("a-app").hidden;
    $("a-loading").hidden = !(on && first);
    $("a-list").setAttribute("aria-busy", on ? "true" : "false");
    $("a-refresh").disabled = on;
    if (on && !first) $("a-updated").innerHTML = SPIN + "Henter …";
  }

  function load() {
    $("a-login").hidden = true;
    busy(true);
    return post({ action: "list" })
      .then(function (j) {
        busy(false);
        if (!j.ok) {
          store.clear();
          return showLogin(ERR[j.error] || "Noe gikk galt: " + (j.error || "ukjent"));
        }
        orders = j.orders || []; plans = j.plans || {}; depot = j.depot || null; today = j.today || "";
        $("a-login").hidden = true; $("a-app").hidden = false; $("a-actions").hidden = false;
        $("a-updated").textContent = "Oppdatert " + new Date().toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
        render();
      })
      .catch(function () {
        busy(false);
        if ($("a-app").hidden) return showLogin("Fikk ikke kontakt med kalenderen. Prøv igjen.");
        $("a-updated").textContent = "Fikk ikke kontakt med kalenderen. Prøv Oppdater.";
      });
  }

  function post(body) {
    if (body.action !== "login") body.token = token;
    return fetch(A.calendarUrl, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  function render() {
    var upcoming = view === "kommende";
    var list = orders.filter(function (o) { return upcoming ? o.date >= today : o.date < today; });
    var byDay = {};
    list.forEach(function (o) { (byDay[o.date] = byDay[o.date] || []).push(o); });
    var days = Object.keys(byDay).sort();
    if (!upcoming) days.reverse();

    // Nøkkeltall for kommende leveringer.
    var active = orders.filter(function (o) { return o.date >= today && o.status !== "Avbestilt"; });
    $("a-stats").innerHTML = upcoming ?
      '<div><strong>' + active.length + '</strong><span>leveringer</span></div>' +
      '<div><strong>' + nb(active.reduce(function (s, o) { return s + o.sacks; }, 0)) + '</strong><span>sekker</span></div>' : "";

    if (!days.length) {
      $("a-list").innerHTML = '<p class="card muted">' + (upcoming ? "Ingen kommende bestillinger." : "Ingen tidligere bestillinger.") + "</p>";
      return;
    }
    $("a-list").innerHTML = days.map(function (d) {
      // Kommende dager vises i kjørerekkefølgen kalenderen har regnet ut. Avbestilte nederst.
      var plan = upcoming ? plans[d] : null, stop = {};
      if (plan && plan.ruteOk) plan.rute.forEach(function (r, i) { stop[r.id] = { nr: i + 1, ben: r.ben }; });
      var rank = function (o) { return o.status === "Avbestilt" ? 2000 : stop[o.id] ? stop[o.id].nr : (o.status === "Levert" ? 1000 : 500); };
      var os = byDay[d].sort(function (a, b) { return rank(a) - rank(b) || a.area.localeCompare(b.area); });
      var live = os.filter(function (o) { return o.status !== "Avbestilt"; });
      var min = plan ? plan.minutter : live.reduce(function (s, o) { return s + o.minutes; }, 0);
      var sacks = live.reduce(function (s, o) { return s + o.sacks; }, 0);
      var pct = Math.min(100, Math.round(min / CAP * 100));
      return '<section class="admin-day">' +
        '<header><h2>' + esc(dayLabel(d)) + '</h2>' +
        '<p>' + live.length + ' levering' + (live.length === 1 ? "" : "er") + ' · <strong>' + nb(sacks) + ' sekker</strong> · ' +
        min + ' av ' + CAP + ' min' + (min > CAP ? ' <span class="over">(over tiden)</span>' : ' · ' + (CAP - min) + ' min ledig') + '</p>' +
        '<div class="meter' + (min > CAP ? " over" : "") + '"><span data-pct="' + pct + '"></span></div>' +
        (plan && plan.ruteOk && plan.rute.length ? '<p class="small">🚗 ' + plan.kjoring + ' min kjøring på den raskeste runden, ' +
          plan.tilbake + ' min tilbake til lageret' + routeLink(plan, os) + '</p>' : "") + '</header>' +
        os.map(function (o) { return card(o, stop[o.id]); }).join("") + '</section>';
    }).join("");
    // Bredden settes her og ikke som style-attributt, fordi sikkerhetsregelen (CSP) stopper inline-stil.
    $("a-list").querySelectorAll(".meter span").forEach(function (m) { m.style.width = m.dataset.pct + "%"; });
  }

  // Google Maps-lenke med stoppene i kjørerekkefølge, fra lageret og tilbake. Leverte stopp hoppes over.
  function routeLink(plan, os) {
    if (!depot) return "";
    var byId = {};
    os.forEach(function (o) { byId[o.id] = o; });
    var pts = plan.rute.map(function (r) { return byId[r.id]; })
      .filter(function (o) { return o && o.status !== "Levert" && o.lat != null; })
      .map(function (o) { return o.lat + "," + o.lon; });
    if (!pts.length) return "";
    var home = depot.lat + "," + depot.lon;
    var url = "https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" + home + "&destination=" + home +
      "&waypoints=" + encodeURIComponent(pts.join("|"));
    return ' · <a href="' + esc(url) + '" target="_blank" rel="noopener">Åpne ruten i Google Maps</a>';
  }

  function card(o, stop) {
    var addr = [o.address, o.area].filter(Boolean).join(", ");
    var done = o.status === "Levert" || o.status === "Avbestilt";
    var undo = '<button type="button" class="btn btn-sm btn-ghost" data-id="' + esc(o.id) + '" data-status="Ny">Angre</button>';
    var maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);
    var btn = function (s, label) {
      return '<button type="button" class="btn btn-sm' + (o.status === s ? "" : " btn-ghost") + '" data-id="' + esc(o.id) +
        '" data-status="' + s + '"' + (o.status === s ? " disabled" : "") + '>' + label + '</button>';
    };
    return '<article class="card admin-order st-' + esc(o.status.toLowerCase()) + '">' +
      '<div class="ao-head"><strong>' + (stop ? stop.nr + '. ' : "") + esc(o.name || o.address || o.phone || "(uten navn)") + '</strong>' +
      (done ? '<span class="pill">' + esc(o.status) + '</span>' : "") + '</div>' +
      '<p class="ao-main"><strong>' + nb(o.sacks) + ' sekker</strong>' + (o.carry ? ' · ' + esc(o.carry) : "") +
      (o.total ? ' · ' + esc(o.total) : "") +
      (stop ? ' · 🚗 ' + stop.ben + ' min ' + (stop.nr === 1 ? "fra lageret" : "fra forrige stopp") : ' · ' + o.minutes + ' min') + '</p>' +
      '<p>' + (addr ? '<a href="' + maps + '" target="_blank" rel="noopener">📍 ' + esc(addr) + '</a>' : "") +
      (o.phone ? ' &nbsp; <a href="tel:' + esc(o.phone.replace(/\s/g, "")) + '">📞 ' + esc(o.phone) + '</a>' : "") +
      (o.email ? ' &nbsp; <a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a>' : "") + '</p>' +
      (o.message ? '<p class="ao-msg">💬 ' + esc(o.message) + '</p>' : "") +
      '<p class="muted small">Bestilt ' + esc(o.registered) + '</p>' +
      '<div class="ao-btns">' + (done ? undo : btn("Levert", "Levert") + btn("Avbestilt", "Avbestill")) + '</div>' +
      '</article>';
  }

  $("a-list").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-status]");
    if (!b) return;
    var st = b.dataset.status;
    if (st === "Avbestilt" && !confirm("Avbestille denne leveringen? Tiden blir ledig for andre kunder.")) return;
    b.disabled = true; b.innerHTML = SPIN + "Lagrer …";
    post({ action: "status", id: b.dataset.id, status: st }).then(function (j) {
      if (!j.ok) alert(ERR[j.error] || "Kunne ikke lagre: " + (j.error || "ukjent feil"));
      return load();
    }).catch(function () { alert("Fikk ikke kontakt med kalenderen."); load(); });
  });

  document.querySelectorAll(".admin-tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      view = b.dataset.view;
      document.querySelectorAll(".admin-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
      render();
    });
  });

  $("a-login").addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = $("a-key").value.trim(), remember = $("a-remember").checked, btn = $("a-login").querySelector("button");
    if (!pw) return;
    btn.disabled = true; btn.innerHTML = SPIN + "Logger inn …"; $("a-login-msg").textContent = "";
    var reset = function () { btn.disabled = false; btn.textContent = "Logg inn"; };
    post({ action: "login", password: pw, remember: remember }).then(function (j) {
      reset();
      if (!j.ok) return showLogin(ERR[j.error] || "Noe gikk galt.");
      $("a-key").value = "";
      store.set(j.token, remember);
      load();
    }).catch(function () { reset(); showLogin("Fikk ikke kontakt med kalenderen."); });
  });
  $("a-logout").addEventListener("click", function () {
    post({ action: "logout" }).catch(function () {});
    store.clear(); showLogin();
  });
  $("a-refresh").addEventListener("click", load);
  $("a-print").addEventListener("click", function () { window.print(); });

  // Telefonbestilling: minuttene regnes ut på samme måte som i bestillingsskjemaet, men kan overstyres.
  $("ad-omrade").innerHTML = (A.areas || []).map(function (a) { return "<option>" + esc(a) + "</option>"; }).join("");
  var minTouched = false;
  function calcMin() {
    if (minTouched) return;
    var drive = (D.drive_minutes || {})[$("ad-omrade").value];
    if (drive == null) drive = (D.drive_minutes || {})["Annet"] || 60;
    $("ad-min").value = Math.round(drive + serviceMin());
  }
  function serviceMin() {
    var n = parseInt($("ad-sekker").value, 10) || 0;
    return (D.unload_minutes || 0) + n * (D.unload_minutes_per_sack || 0) + ($("ad-baering").value ? n * (D.carry_minutes_per_sack || 0) : 0);
  }
  ["ad-omrade", "ad-sekker", "ad-baering"].forEach(function (id) { $(id).addEventListener("input", calcMin); $(id).addEventListener("change", calcMin); });
  $("ad-min").addEventListener("input", function () { minTouched = true; });
  calcMin();
  $("a-add").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("a-add-msg");
    if (!$("ad-dato").value || !($("ad-tlf").value.trim() || $("ad-adresse").value.trim())) {
      msg.className = "form-msg err"; msg.textContent = "Fyll inn dag, og telefon eller adresse."; return;
    }
    var sbtn = $("a-add").querySelector("button[type=submit]");
    msg.className = "form-msg"; msg.textContent = "";
    sbtn.disabled = true; sbtn.innerHTML = SPIN + "Lagrer …";
    var done = function () { sbtn.disabled = false; sbtn.textContent = "Lagre bestilling"; };
    post({
      action: "add", date: $("ad-dato").value, minutes: +$("ad-min").value || 0, service: minTouched ? null : serviceMin(), name: $("ad-navn").value.trim(),
      phone: $("ad-tlf").value.trim(), address: $("ad-adresse").value.trim(), area: $("ad-omrade").value,
      sacks: +$("ad-sekker").value || 0, carry: $("ad-baering").value || "Ingen bæring", total: $("ad-pris").value.trim(),
      message: ($("ad-melding").value.trim() + " (telefonbestilling)").trim()
    }).then(function (j) {
      done();
      if (!j.ok) { msg.className = "form-msg err"; msg.textContent = ERR[j.error] || "Kunne ikke lagre: " + (j.error || "ukjent feil"); return; }
      msg.className = "form-msg ok"; msg.textContent = "Lagret.";
      ["ad-navn", "ad-tlf", "ad-adresse", "ad-pris", "ad-melding"].forEach(function (id) { $(id).value = ""; });
      minTouched = false; calcMin();
      load();
    }).catch(function () { done(); msg.className = "form-msg err"; msg.textContent = "Fikk ikke kontakt med kalenderen."; });
  });

  if (token) load(); else showLogin();
})();
