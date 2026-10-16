// Eiersiden (/admin/): bestillinger per leveringsdag, hentet fra leveringskalenderen (kalender/kalender.gs).
(function () {
  var A = window.ADMIN || {}, D = A.days || {}, CAP = D.minutes_per_day || 300;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "folloAdminKey", key = "";
  try { key = localStorage.getItem(KEY) || ""; } catch (e) {}
  var orders = [], today = "", view = "kommende";

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

  function load() {
    $("a-updated").textContent = "Henter …";
    return fetch(A.calendarUrl + "?key=" + encodeURIComponent(key))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) {
          try { localStorage.removeItem(KEY); } catch (e) {}
          return showLogin(j.error === "nokkel" ? "Feil nøkkel." : "Noe gikk galt: " + (j.error || "ukjent"));
        }
        orders = j.orders || []; today = j.today || "";
        $("a-login").hidden = true; $("a-app").hidden = false; $("a-actions").hidden = false;
        $("a-updated").textContent = "Oppdatert " + new Date().toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
        render();
      })
      .catch(function () { $("a-updated").textContent = "Fikk ikke kontakt med kalenderen. Prøv Oppdater."; });
  }

  function post(body) {
    body.key = key;
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
    var fresh = active.filter(function (o) { return o.status === "Ny"; }).length;
    $("a-stats").innerHTML = upcoming ?
      '<div><strong>' + active.length + '</strong><span>leveringer</span></div>' +
      '<div><strong>' + nb(active.reduce(function (s, o) { return s + o.sacks; }, 0)) + '</strong><span>sekker</span></div>' +
      '<div class="' + (fresh ? "warn" : "") + '"><strong>' + fresh + '</strong><span>ikke bekreftet</span></div>' : "";

    if (!days.length) {
      $("a-list").innerHTML = '<p class="card muted">' + (upcoming ? "Ingen kommende bestillinger." : "Ingen tidligere bestillinger.") + "</p>";
      return;
    }
    var order = { "Ny": 0, "Bekreftet": 1, "Levert": 2, "Avbestilt": 3 };
    $("a-list").innerHTML = days.map(function (d) {
      var os = byDay[d].sort(function (a, b) { return (order[a.status] || 0) - (order[b.status] || 0) || a.area.localeCompare(b.area); });
      var live = os.filter(function (o) { return o.status !== "Avbestilt"; });
      var min = live.reduce(function (s, o) { return s + o.minutes; }, 0);
      var sacks = live.reduce(function (s, o) { return s + o.sacks; }, 0);
      var pct = Math.min(100, Math.round(min / CAP * 100));
      return '<section class="admin-day">' +
        '<header><h2>' + esc(dayLabel(d)) + '</h2>' +
        '<p>' + live.length + ' levering' + (live.length === 1 ? "" : "er") + ' · <strong>' + nb(sacks) + ' sekker</strong> · ' +
        min + ' av ' + CAP + ' min' + (min > CAP ? ' <span class="over">(over tiden)</span>' : ' · ' + (CAP - min) + ' min ledig') + '</p>' +
        '<div class="meter' + (min > CAP ? " over" : "") + '"><span style="width:' + pct + '%"></span></div></header>' +
        os.map(card).join("") + '</section>';
    }).join("");
  }

  function card(o) {
    var addr = [o.address, o.area].filter(Boolean).join(", ");
    var maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);
    var btn = function (s, label) {
      return '<button type="button" class="btn btn-sm' + (o.status === s ? "" : " btn-ghost") + '" data-id="' + esc(o.id) +
        '" data-status="' + s + '"' + (o.status === s ? " disabled" : "") + '>' + label + '</button>';
    };
    return '<article class="card admin-order st-' + esc(o.status.toLowerCase()) + '">' +
      '<div class="ao-head"><strong>' + esc(o.name || "(uten navn)") + '</strong><span class="pill">' + esc(o.status) + '</span></div>' +
      '<p class="ao-main"><strong>' + nb(o.sacks) + ' sekker</strong>' + (o.carry ? ' · ' + esc(o.carry) : "") +
      (o.total ? ' · ' + esc(o.total) : "") + ' · ' + o.minutes + ' min</p>' +
      '<p>' + (addr ? '<a href="' + maps + '" target="_blank" rel="noopener">📍 ' + esc(addr) + '</a>' : "") +
      (o.phone ? ' &nbsp; <a href="tel:' + esc(o.phone.replace(/\s/g, "")) + '">📞 ' + esc(o.phone) + '</a>' : "") +
      (o.email ? ' &nbsp; <a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a>' : "") + '</p>' +
      (o.message ? '<p class="ao-msg">💬 ' + esc(o.message) + '</p>' : "") +
      '<p class="muted small">Bestilt ' + esc(o.registered) + '</p>' +
      '<div class="ao-btns">' + btn("Bekreftet", "Bekreftet") + btn("Levert", "Levert") + btn("Avbestilt", "Avbestill") + '</div>' +
      '</article>';
  }

  $("a-list").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-status]");
    if (!b) return;
    var st = b.dataset.status;
    if (st === "Avbestilt" && !confirm("Avbestille denne leveringen? Tiden blir ledig for andre kunder.")) return;
    b.disabled = true; b.textContent = "Lagrer …";
    post({ action: "status", id: b.dataset.id, status: st }).then(function (j) {
      if (!j.ok) alert("Kunne ikke lagre: " + (j.error || "ukjent feil"));
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
    key = $("a-key").value.trim();
    if (!key) return;
    try { localStorage.setItem(KEY, key); } catch (err) {}
    load();
  });
  $("a-logout").addEventListener("click", function () {
    key = ""; try { localStorage.removeItem(KEY); } catch (e) {}
    $("a-key").value = ""; showLogin();
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
    var n = parseInt($("ad-sekker").value, 10) || 0;
    $("ad-min").value = Math.round(drive + (D.unload_minutes || 0) + ($("ad-baering").value ? n * (D.carry_minutes_per_sack || 0) : 0));
  }
  ["ad-omrade", "ad-sekker", "ad-baering"].forEach(function (id) { $(id).addEventListener("input", calcMin); $(id).addEventListener("change", calcMin); });
  $("ad-min").addEventListener("input", function () { minTouched = true; });
  calcMin();
  $("a-add").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("a-add-msg");
    if (!$("ad-dato").value || !$("ad-navn").value.trim()) { msg.className = "form-msg err"; msg.textContent = "Fyll inn dag og navn."; return; }
    msg.className = "form-msg"; msg.textContent = "Lagrer …";
    post({
      action: "add", date: $("ad-dato").value, minutes: +$("ad-min").value || 0, name: $("ad-navn").value.trim(),
      phone: $("ad-tlf").value.trim(), address: $("ad-adresse").value.trim(), area: $("ad-omrade").value,
      sacks: +$("ad-sekker").value || 0, carry: $("ad-baering").value || "Ingen bæring", total: $("ad-pris").value.trim(),
      message: ($("ad-melding").value.trim() + " (telefonbestilling)").trim()
    }).then(function (j) {
      if (!j.ok) { msg.className = "form-msg err"; msg.textContent = "Kunne ikke lagre: " + (j.error || "ukjent feil"); return; }
      msg.className = "form-msg ok"; msg.textContent = "Lagret.";
      ["ad-navn", "ad-tlf", "ad-adresse", "ad-pris", "ad-melding"].forEach(function (id) { $(id).value = ""; });
      minTouched = false; calcMin();
      load();
    }).catch(function () { msg.className = "form-msg err"; msg.textContent = "Fikk ikke kontakt med kalenderen."; });
  });

  if (key) load(); else showLogin();
})();
