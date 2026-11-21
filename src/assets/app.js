(function () {
  var S = window.SITE || {};
  var fmt = function (n) { return n.toLocaleString("nb-NO") + " kr"; };
  var EVENT_NAMES = {
    click_tel: "Trykket på telefonnummer", begin_checkout: "Begynte på bestilling",
    generate_lead: "Bestilling sendt", order_error: "Feil ved sending av bestilling", order_retry_ok: "Bestillingen kom fram på forsøk",
    bestilt_via: "Bestillingen gikk via",
    purchase_lead_view: "Så takkesiden", article_cta: "Klikket bestill i artikkel",
    calculator_to_order: "Brukte vedkalkulatoren", price_check: "Sjekket pris i skjemaet",
    form_invalid: "Trykket Send, men et felt manglet",
    antall_valgt: "Endret antall sekker til", bestilt_antall: "Bestilte antall sekker",
    dag_valgt: "Valgte leveringsdag",
    hyppighet_valgt: "Valgte hvor ofte", bestilt_hyppighet: "Bestilte med hyppighet",
    contact_start: "Begynte på kontaktskjema", contact_sent: "Kontaktskjema sendt", contact_error: "Feil ved sending av kontaktskjema"
  };
  var track = window.siteTrack = function (name, params) {
    try { if (window.gtag) gtag("event", name, params || {}); } catch (e) {}
    try { if (window.fbq) fbq("trackCustom", name, params || {}); } catch (e) {}
    try {
      if (window.goatcounter && goatcounter.count)
        goatcounter.count({ path: name, title: (EVENT_NAMES[name] || (EVENT_NAMES[name.split(":")[0]] ? EVENT_NAMES[name.split(":")[0]] + ": " + name.split(":")[1] : name)) +
          (params && params.reason ? ": " + String(params.reason).slice(0, 120) : ""), event: true,
          // Siden hendelsen skjedde på, vises som «kilde» i GoatCounter, så vi ser hvilke sider som gir bestillinger.
          referrer: location.origin + location.pathname });
    } catch (e) {}
  };

  // Feilteksten fra appen som setning: «fant ikke adressen; skriv gate …» → «Fant ikke adressen. Skriv gate ….»
  var setning = window.siteSetning = function (t) {
    return String(t).replace(/^\s*./, function (c) { return c.toUpperCase(); })
      .replace(/;\s*(.)/g, function (_, c) { return ". " + c.toUpperCase(); }).replace(/\.?\s*$/, ".");
  };

  document.querySelectorAll('[data-track="tel"]').forEach(function (a) {
    a.addEventListener("click", function () { track("click_tel"); });
  });

  // Mobil: vis "Bestill"-knapp nederst når bestillingsskjemaet ikke er synlig.
  var cta = document.querySelector(".sticky-cta");
  var orderSec = document.getElementById("bestill") || document.getElementById("kontakt");
  if (cta && orderSec) cta.setAttribute("href", "#" + orderSec.id);
  if (cta && orderSec && "IntersectionObserver" in window) {
    var heroVisible = true, orderVisible = false;
    var upd = function () { cta.classList.toggle("show", !heroVisible && !orderVisible); };
    new IntersectionObserver(function (e) { orderVisible = e[0].isIntersecting; upd(); }).observe(orderSec);
    var hero = document.querySelector(".hero, .phero");
    if (hero) new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting; upd(); }).observe(hero);
  }

  // Takk-side: vis oppsummering av bestillingen.
  var ts = document.getElementById("takk-summary");
  if (ts) {
    try {
      var last = JSON.parse(sessionStorage.getItem("lastOrder") || "null");
      if (last) {
        ["Din bestilling", last.qty + " sekker bjørkeved" + (last.freq ? ", " + last.freq.toLowerCase() : ""), last.carry, last.address,
          last.day ? (last.freq ? "Første leveringsdag: " : "Ønsket leveringsdag: ") + last.day : "",
          "Beregnet: " + last.total + (last.freq ? " per levering" : "")]
          .forEach(function (t, i) {
            if (!t) return;
            var p = document.createElement(i === 0 || i === 5 ? "strong" : "div");
            p.textContent = t; p.style.display = "block"; ts.appendChild(p);
          });
        ts.hidden = false;
        track("purchase_lead_view");
      }
    } catch (e) {}
  }

  var form = document.getElementById("order-form");

  // Vedkalkulator i artikler.
  var kb = document.getElementById("k-bruk");
  if (kb) {
    var km = document.getElementById("k-mnd");
    var kcalc = function () {
      var p = kb.value.split("|"), perDay = +p[0], days = +p[1];
      var sacks = Math.max(5, Math.round(perDay * days * (+km.value) * 4.33));
      document.getElementById("k-sekker").textContent = sacks;
      document.getElementById("k-pris").textContent = fmt(sacks * S.price + (S.deliveryFee || 0)) + " inkl. hjemlevering";
      return sacks;
    };
    kb.addEventListener("change", kcalc); km.addEventListener("change", kcalc); kcalc();
    document.getElementById("k-bestill").addEventListener("click", function () {
      var n = kcalc(), q = document.getElementById("f-antall");
      if (q) { q.value = n; q.dispatchEvent(new Event("change", { bubbles: true })); }
      track("calculator_to_order", { sacks: n });
    });
  }
  document.querySelectorAll('[data-track="article_cta"]').forEach(function (a) {
    a.addEventListener("click", function () { track("article_cta"); });
  });

  if (!form) return;

  var qty = form.querySelector("#f-antall");
  var carry = form.querySelector("#f-baering");
  var freq = form.querySelector("#f-hyppighet");
  function freqKey() { return freq ? freq.options[freq.selectedIndex].dataset.key : "en-gang"; }
  var msg = form.querySelector("#form-msg");
  var chips = form.querySelectorAll(".chips button");
  var started = false;

  function calc() {
    var n = Math.max(0, parseInt(qty.value, 10) || 0);
    var fee = parseInt(carry.options[carry.selectedIndex].dataset.fee, 10) || 0;
    var wood = n * S.price, carryTotal = n * fee; // bæring er per sekk
    var total = wood + carryTotal + (S.deliveryFee || 0);
    document.getElementById("s-ved").textContent = n + " × " + S.price + " kr = " + fmt(wood);
    document.getElementById("s-baering").textContent = fee ? n + " × " + fee + " kr = " + fmt(carryTotal) : "–";
    document.getElementById("s-total").textContent = fmt(total);
    document.getElementById("s-qty").textContent = n + " sekker = " + fmt(wood) + (S.kg ? " (ca. " + (n * S.kg).toLocaleString("nb-NO") + " kg)" : "");
    document.getElementById("s-btn-total").textContent = fmt(total);
    var repeat = freqKey() !== "en-gang";
    document.getElementById("s-total-label").textContent = repeat ? "Per levering" : "Totalt";
    document.getElementById("f-hyppighet-info").hidden = !repeat;
    document.getElementById("l-dag").textContent = repeat ? "Første leveringsdag" : "Leveringsdag";
    document.getElementById("f-total").value = fmt(total) + (S.deliveryFee == null ? " + levering (avtales)" : "");
    chips.forEach(function (c) { c.classList.toggle("on", parseInt(c.dataset.qty, 10) === n); });
    return total;
  }

  // Bæring: «Ved innkjørselen» eller «Bær inn for meg». Lista med etasjer osv. vises bare når kunden vil ha bæring.
  var carryWrap = form.querySelector("#baering-wrap");
  form.querySelectorAll('[name="_baering"]').forEach(function (r) {
    r.addEventListener("change", function () {
      var inn = r.value === "inn" && r.checked;
      carryWrap.hidden = !inn;
      var fee0 = !(parseInt(carry.options[carry.selectedIndex].dataset.fee, 10) > 0);
      if (inn && fee0) carry.selectedIndex = 1;
      if (!inn) carry.selectedIndex = 0;
      carry.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  // Velger kunden «ingen bæring» i lista, går vi tilbake til «Ved innkjørselen».
  carry.addEventListener("change", function () {
    if (!(parseInt(carry.options[carry.selectedIndex].dataset.fee, 10) > 0) && !carryWrap.hidden) {
      carryWrap.hidden = true; form.querySelector('[name="_baering"][value="ingen"]').checked = true;
    }
  });

  form.querySelectorAll(".qty-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      qty.value = Math.max(1, (parseInt(qty.value, 10) || 0) + parseInt(b.dataset.step, 10));
      calc(); priceCheck();
    });
  });
  chips.forEach(function (c) {
    c.addEventListener("click", function () { qty.value = c.dataset.qty; calc(); priceCheck(); });
  });
  // Målingen deles i to steg: «sjekket pris» (antall/bæring) og «begynte på bestilling» (adresse/kontaktinfo).
  var priced = false;
  function priceCheck() { if (!priced) { priced = true; track("price_check"); } qtyChoice(); }
  // Skrur folk antallet opp eller ned fra standardantallet? Måles som «antall_valgt:30-49» osv., én gang per gruppe,
  // og først når antallet har ligget stille i 2 sekunder (så + og − ikke gir en hendelse per klikk).
  var qtyDefault = parseInt(qty.defaultValue, 10) || 0, qtySeen = {}, qtyTimer = null;
  // Faste grupper, uavhengig av standardantallet, så ukene kan sammenlignes. Standardantallet får egen gruppe (f.eks. «20»).
  function qtyBucket(n) {
    if (n === qtyDefault) return String(qtyDefault);
    return n < 10 ? "under-10" : n < 20 ? "10-19" : n < 30 ? "20-29" : n < 50 ? "30-49" : n < 100 ? "50-99" : "100+";
  }
  function qtyChoice() {
    clearTimeout(qtyTimer);
    qtyTimer = setTimeout(function () {
      var n = parseInt(qty.value, 10) || 0, b = qtyBucket(n);
      if (b === String(qtyDefault) && !Object.keys(qtySeen).length) return; // uendret, f.eks. bare bæring endret
      if (n > 0 && !qtySeen[b]) { qtySeen[b] = true; track("antall_valgt:" + b); }
    }, 2000);
  }
  form.addEventListener("input", function (e) {
    if (e.target.classList) e.target.classList.remove("invalid");
    calc();
    if (e.target === qty || e.target === carry) priceCheck();
    else if (e.target === freq) {}
    else if (!started && e.target.id !== "f-sted") { started = true; track("begin_checkout"); }
  });
  form.addEventListener("change", function (e) {
    calc();
    if (e.target === qty || e.target === carry) priceCheck();
    if (e.target === freq) track("hyppighet_valgt:" + freqKey());
  });
  calc();

  // Appen Nettsideferdig (S.app) tar imot bestillingen og bestemmer leveringsdagene. Kall med tidsgrense; gir {status, j}.
  var APP = S.app || "";
  function api(sti, opts, ms) {
    opts = opts || {};
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms || 15000) : null;
    if (ctl) opts.signal = ctl.signal;
    return fetch(APP + sti, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { clearTimeout(timer); return { status: r.status, j: j || {} }; });
    }, function (err) {
      clearTimeout(timer);
      throw (err && err.name === "AbortError") ? new Error("Tidsavbrudd " + Math.round((ms || 15000) / 1000) + " s") : err;
    });
  }
  // Varen, tilleggene og fast levering fra appen (GET /api/oppsett), hentet én gang.
  var oppsett = null, oppsettP = null;
  function loadOppsett() {
    if (oppsett) return Promise.resolve(oppsett);
    if (!oppsettP) oppsettP = api("/api/oppsett").then(function (r) {
      if (r.status !== 200 || !r.j.varer) throw new Error("Oppsett " + r.status);
      oppsett = r.j; return oppsett;
    }).catch(function (e) { oppsettP = null; throw e; });
    return oppsettP;
  }
  var lik = function (a, b) { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); };
  function vareId(o) {
    var v = (o.varer || []).filter(function (x) { return lik(x.navn, S.appVare); })[0];
    if (!v) throw new Error("Fant ikke varen " + S.appVare);
    return v.id;
  }
  // Bæringen er et tillegg i appen med samme navn som teksten i CARRY_OPTIONS. «ingen» er ingen tillegg.
  // Finnes ikke tillegget, sendes bestillingen uten, og bæringen står i meldingen (carryNote).
  function tillegg(o) {
    var key = carry.value, label = (S.carry || {})[key];
    if (!label || key === "ingen") return { ids: [], note: "" };
    var t = ((o.levering || {}).tillegg || []).filter(function (x) { return lik(x.navn, label); })[0];
    return t ? { ids: [t.id], note: "" } : { ids: [], note: "Bæring: " + label + "." };
  }
  // Vedabonnement: «2-uker» → fast_uker 2, når appen tilbyr fast levering hver 2., 4. eller 6. uke.
  function fastUker(o) {
    var n = parseInt(freqKey(), 10) || 0, ok = ((o.levering || {}).fast_uker || []);
    return n && ok.indexOf(n) >= 0 ? n : 0;
  }

  // Leveringsdag. Når kunden har skrevet adressen, spør vi appen hvilke dager adressen og bestillingen får plass
  // (GET /api/leveringsdager: kjøretid, lossing og bæring). En dag som ikke er i svaret, er ikke ledig.
  // Før det vises dagene appen kjører (uten adresse), eller den lokale beregningen hvis appen ikke svarer.
  var D = S.days || {}, dayBox = form.querySelector("#f-dager"), dayInput = form.querySelector("#f-leveringsdag"),
    dayMsg = form.querySelector("#f-dag-msg"), area = form.querySelector("#f-sted"), closed = {}, full = {},
    addr = form.querySelector("#f-adresse"), baseDays = null, ledig = null;
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var iso = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var addDays = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var fromIso = function (k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
  (D.closed || []).forEach(function (k) { closed[k] = true; });
  function holidays(y) {
    // Påskedag (gregoriansk), så de bevegelige helligdagene regnes ut fra den.
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      easter = new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1), out = {};
    [-3, -2, 1, 39, 50].forEach(function (n) { out[iso(addDays(easter, n))] = true; });
    ["01-01", "05-01", "05-17", "12-24", "12-25", "12-26", "12-31"].forEach(function (md) { out[y + "-" + md] = true; });
    return out;
  }
  function localDays() {
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), out = [],
      hol = Object.assign(holidays(today.getFullYear()), holidays(today.getFullYear() + 1));
    for (var n = 1; n <= (D.weeks_ahead || 4) * 7; n++) {
      var d = addDays(today, n);
      if ((D.weekdays || [1, 5]).indexOf(d.getDay()) < 0 || hol[iso(d)] || closed[iso(d)]) continue;
      // Bestill senest kl. order_by_hour dagen før.
      var cutoff = addDays(d, -1); cutoff.setHours(D.order_by_hour == null ? 18 : D.order_by_hour);
      if (now < cutoff) out.push(iso(d));
    }
    return out;
  }
  // Adressen slik appen (Kartverket) finner den: gateadressen og kommunen til området («Kolbotnveien 20, Nordre Follo»).
  function addrQuery() {
    var a = addr.value.trim().replace(/\s+/g, " "), k = (S.areaKommune || {})[area.value];
    if (k && a.toLowerCase().indexOf(k.toLowerCase()) < 0) a += ", " + k;
    return a;
  }
  function sacks() { return Math.max(0, parseInt(qty.value, 10) || 0); }
  function ledigKey() { return [addrQuery(), sacks(), carry.value].join("|"); }
  function deliveryDays() {
    if (ledig && ledig.addr === addrQuery()) return ledig.list;
    return baseDays || localDays();
  }
  function dayLabel(d) {
    var t = d.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  // Med svar fra appen for denne adressen er bare dagene med «ledig: true» ledige. Dager som ble fulle da kunden
  // sendte (409), er fulle uansett.
  function fits(k) {
    if (full[k]) return false;
    if (ledig && ledig.addr === addrQuery()) return ledig.days[k] === true;
    return true;
  }
  var ledigTimer = null;
  function checkLedig(force) {
    clearTimeout(ledigTimer);
    if (addr.value.trim().length < 5 || !sacks()) { if (ledig) { ledig = null; renderDays(); } return; }
    ledigTimer = setTimeout(function () {
      var key = ledigKey(), q = addrQuery();
      if (!force && ledig && ledig.key === key) return;
      loadOppsett().then(function (o) {
        var t = tillegg(o).ids;
        return api("/api/leveringsdager?adresse=" + encodeURIComponent(q) + "&linjer=" + vareId(o) + ":" + sacks() +
          (t.length ? "&tillegg=" + t.join(",") : ""));
      }).then(function (r) {
        if (key !== ledigKey()) return;
        if (r.status === 200 && r.j.ok && r.j.dager) {
          var days = {};
          r.j.dager.forEach(function (d) { days[d.dato] = d.ledig === true; });
          ledig = { key: key, addr: q, list: r.j.dager.map(function (d) { return d.dato; }), days: days, adresse: r.j.adresse || q };
          if (dayMsg.dataset.addr) { delete dayMsg.dataset.addr; dayMsg.textContent = ""; }
        } else if (r.status === 400) {
          // Ukjent adresse eller for langt unna: ingen dager kan velges før adressen er rettet.
          ledig = { key: key, addr: q, list: deliveryDays(), days: {}, adresse: q, feil: true };
          dayMsg.dataset.addr = "1";
          dayMsg.innerHTML = "";
          dayMsg.appendChild(document.createTextNode(setning((r.j.feil || [])[0] || "Fant ikke adressen") + " "));
          var tel = document.createElement("a");
          tel.href = "tel:" + String(S.phone).replace(/\s/g, ""); tel.textContent = S.phone;
          dayMsg.appendChild(document.createTextNode("Sjekk gateadressen og området, eller ring oss på "));
          dayMsg.appendChild(tel); dayMsg.appendChild(document.createTextNode("."));
        } else return; // 429, 503 o.l.: anslaget står
        renderDays();
      }).catch(function () {});
    }, 700);
  }
  // Knappene lages én gang per sett med dager og oppdateres på stedet. Ble de byttet ut mens kunden holdt fingeren nede
  // (adressefeltet mister fokus idet kunden trykker på en dag, og «change» tegnet alt på nytt), laget nettleseren aldri
  // noe klikk, og dagen ble ikke valgt. Derfor også én klikklytter på boksen, ikke på hver knapp.
  function renderDays() {
    if (!dayBox) return;
    var days = deliveryDays(), any = false, bad = ledig && ledig.addr === addrQuery() && ledig.feil;
    var buttons = Array.prototype.slice.call(dayBox.querySelectorAll("button[data-date]"));
    var same = buttons.length === days.length && buttons.every(function (b, i) { return b.dataset.date === days[i]; });
    if (!same) {
      dayBox.innerHTML = "";
      buttons = days.map(function (k) {
        var d = fromIso(k), b = document.createElement("button");
        b.type = "button"; b.setAttribute("role", "radio"); b.dataset.date = k; b.dataset.label = dayLabel(d);
        var t = d.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
        b.innerHTML = "<strong></strong><span></span>";
        b.firstChild.textContent = t.charAt(0).toUpperCase() + t.slice(1);
        dayBox.appendChild(b);
        return b;
      });
    }
    buttons.forEach(function (b) {
      var k = b.dataset.date, ok = fits(k), on = dayInput.value === k && ok;
      b.disabled = !ok;
      b.setAttribute("aria-checked", String(on));
      if (on) b.classList.add("on"); else b.classList.remove("on");
      b.lastChild.textContent = bad ? "–" : !ok ? "Fullt" : "Ledig";
      if (ok) any = true;
    });
    if (dayInput.value && !(days.indexOf(dayInput.value) >= 0 && fits(dayInput.value))) {
      dayInput.value = "";
      if (!bad) dayMsg.textContent = "Dagen du valgte, har ikke plass til denne bestillingen lenger. Velg en annen dag.";
    } else if (bad) {
      // Meldingen om adressen står.
    } else if (!any) {
      dayMsg.innerHTML = "Alle leveringsdagene de neste ukene er fulle. Ring oss på <a href=\"tel:" +
        String(S.phone).replace(/\s/g, "") + "\">" + S.phone + "</a>, så finner vi en dag.";
    } else if (!dayMsg.dataset.keep) {
      dayMsg.textContent = "";
    }
  }
  function pickDay(k) {
    dayInput.value = k; dayMsg.textContent = ""; delete dayMsg.dataset.keep;
    form.querySelector("#f-dag").classList.remove("invalid");
    renderDays();
    var on = dayBox.querySelector(".on"); if (on) on.focus();
    track("dag_valgt");
  }
  if (dayBox) dayBox.addEventListener("click", function (e) {
    var b = e.target;
    while (b && b !== dayBox && !(b.dataset && b.dataset.date)) b = b.parentNode;
    if (b && b !== dayBox && !b.disabled) pickDay(b.dataset.date);
  });
  renderDays();
  // Dagene appen kjører (helligdager, ferie og frist er regnet der), før adressen er skrevet.
  if (APP) api("/api/leveringsdager").then(function (r) {
    if (r.status === 200 && r.j.ok && r.j.dager && r.j.dager.length) {
      baseDays = r.j.dager.map(function (d) { return d.dato; });
      renderDays();
    }
  }).catch(function () {});
  if (APP) loadOppsett().catch(function () {});
  ["input", "change"].forEach(function (t) {
    form.addEventListener(t, function (e) {
      if (e.target === qty || e.target === carry || e.target === area || e.target === addr) { renderDays(); checkLedig(); }
    });
  });
  form.querySelectorAll(".qty-btn, .chips button").forEach(function (b) {
    b.addEventListener("click", function () { renderDays(); checkLedig(); });
  });

  function validate() {
    var ok = true, first = null, missing = [];
    form.querySelectorAll("[required]").forEach(function (el) {
      var bad = !el.value.trim() || (el.pattern && !new RegExp("^" + el.pattern + "$").test(el.value.trim())) ||
        (el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim())) ||
        (el.type === "number" && !(parseInt(el.value, 10) >= 1));
      // Leveringsdagen er et skjult felt, så det er hele dag-boksen som markeres.
      var shown = el.type === "hidden" ? form.querySelector("#f-dag") : el;
      shown.classList.toggle("invalid", bad);
      if (bad) { ok = false; first = first || shown; missing.push(el.name); }
    });
    if (first) {
      var focusEl = first.tagName === "FIELDSET" ? first.querySelector("button:not([disabled])") : first;
      if (focusEl) focusEl.focus(); else first.scrollIntoView({ block: "center" });
      // Hvilket felt stoppet kunden? Vises som egen hendelse i GoatCounter, f.eks. «form_invalid:Telefon».
      missing.forEach(function (n) { track("form_invalid:" + n); });
    }
    return ok;
  }

  var telLink = function () { return "<a href=\"tel:" + String(S.phone).replace(/\s/g, "") + "\">" + S.phone + "</a>"; };
  var escHtml = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); };

  // Noe uventet krasjet under sendingen: kunden får alltid beskjed, aldri en knapp som ikke gjør noe.
  function uventet(err) {
    var b = form.querySelector('button[type="submit"]');
    if (b) { b.disabled = false; var l = b.querySelector(".btn-label"); if (l) l.textContent = "Send bestilling"; }
    msg.className = "form-msg err";
    msg.innerHTML = "Beklager, noe gikk galt, og bestillingen ble ikke sendt. Last siden på nytt og prøv igjen, eller ring oss på " + telLink() + ".";
    track("order_error:js " + String((err && err.message) || "ukjent").replace(/[^\wæøåÆØÅ .-]/g, "").trim().slice(0, 36));
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    try { send(); } catch (err) { uventet(err); }
  });
  function send() {
    msg.className = "form-msg"; msg.textContent = "";
    if (form._honey && form._honey.value) return;
    if (!validate()) {
      msg.className = "form-msg err";
      msg.textContent = "Fyll inn feltene som er markert med rødt.";
      return;
    }
    var total = calc();
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    data["Bæring"] = carry.options[carry.selectedIndex].text;
    var dayBtn = dayBox && dayBox.querySelector('[data-date="' + dayInput.value + '"]');
    var dayText = dayBtn ? dayBtn.dataset.label : dayInput.value;
    var repeat = freqKey() !== "en-gang";
    data["Leveringsdag"] = (repeat ? "Første levering: " : "") + dayText;
    var dato = dayInput.value;

    var btn = form.querySelector('button[type="submit"]');
    var setBtn = function (busy) { btn.disabled = busy; btn.querySelector(".btn-label").textContent = busy ? "Sender …" : "Send bestilling"; };
    setBtn(true);

    loadOppsett().then(function (o) {
      var t = tillegg(o), fu = fastUker(o), melding = [];
      // Vedabonnement uten fast levering i appen: hyppigheten står først i meldingen, så eieren ser den.
      if (repeat && !fu) melding.push("Vedabonnement: " + data["Hyppighet"].toLowerCase() + ".");
      if (t.note) melding.push(t.note);
      if ((data["Melding"] || "").trim()) melding.push(data["Melding"].trim());
      var body = {
        linjer: [{ vare_id: vareId(o), antall: sacks() }], tillegg: t.ids,
        adresse: ledig && ledig.addr === addrQuery() && !ledig.feil ? ledig.adresse : addrQuery(),
        dato: dato, navn: data["Navn"].trim(), telefon: data["Telefon"].replace(/[^+0-9 ()-]/g, "").trim(),
        epost: data["E-post"].trim(), melding: melding.join(" ").slice(0, 500)
      };
      if (fu) body.fast_uker = fu;
      // Ingen nye forsøk: en bestilling som kom fram uten at svaret gjorde det, skal ikke komme to ganger.
      return api("/api/bestill-levering", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 25000);
    }).then(function (r) {
      if (r.status === 200 && r.j.ok) { track("bestilt_via:app"); done(data, total); return; }
      setBtn(false);
      var feil = (r.j.feil || [])[0] || ("Feil " + r.status);
      if (r.status === 409) {
        // Dagen ble full (eller kan ikke velges lenger): kunden velger en annen dag og sender igjen.
        full[dato] = true;
        if (ledig) ledig.days[dato] = false;
        dayInput.value = "";
        dayMsg.dataset.keep = "1";
        renderDays();
        dayMsg.textContent = "Beklager, dagen ble akkurat full. Velg en annen dag og trykk Send igjen.";
        form.querySelector("#f-dag").classList.add("invalid");
        msg.className = "form-msg err";
        msg.textContent = "Beklager, dagen ble akkurat full. Velg en annen dag og trykk Send igjen.";
        checkLedig(true);
        track("order_error:dagen er full");
        return;
      }
      var mark = /adresse|langt/i.test(feil) ? addr : /e-post|epost/i.test(feil) ? form.querySelector("#f-epost") :
        /telefon/i.test(feil) ? form.querySelector("#f-tlf") : /navn/i.test(feil) ? form.querySelector("#f-navn") : null;
      if (mark && r.status === 400) mark.classList.add("invalid");
      msg.className = "form-msg err";
      msg.innerHTML = (r.status === 400 ? escHtml(setning(feil)) + " Rett det og send igjen, eller ring oss på " :
        "Beklager, bestillingen kom ikke fram. Prøv igjen om litt, eller ring oss på ") + telLink() + ".";
      track("order_error:" + String(r.status) + " " + String(feil).replace(/[^\wæøåÆØÅ .-]/g, "").trim().slice(0, 36));
    }).catch(function (err) {
      setBtn(false);
      msg.className = "form-msg err";
      msg.innerHTML = "Beklager, bestillingen kom ikke fram. Sjekk nettet og prøv igjen, eller ring oss på " + telLink() + ".";
      // Grunnen står i hendelsesnavnet (f.eks. «order_error:Failed to fetch»), for GoatCounter lagrer bare én tittel per hendelse.
      track("order_error:" + String((err && err.message) || "ukjent").replace(/[^\wæøåÆØÅ .-]/g, "").trim().slice(0, 40));
    });
  }
  // Vernet i siden (build.py) slipper innsendingen gjennom bare når dette skriptet har koblet seg på skjemaet.
  form.setAttribute("data-klar", "1");

  // Bestillingen er framme: mål den, husk oppsummeringen til takkesiden, og gå dit.
  function done(data, total) {
    track("generate_lead", { value: total, currency: "NOK", sacks: +data["Antall sekker"] });
    track("bestilt_antall:" + qtyBucket(+data["Antall sekker"]));
    track("bestilt_hyppighet:" + freqKey());
    try { if (window.fbq) fbq("track", "Lead", { value: total, currency: "NOK" }); } catch (e) {}
    try { if (window.gtag && S.adsConversion) gtag("event", "conversion", { send_to: S.adsConversion, value: total, currency: "NOK" }); } catch (e) {}
    try {
      sessionStorage.setItem("lastOrder", JSON.stringify({
        qty: data["Antall sekker"], carry: data["Bæring"], total: fmt(total),
        day: data["Leveringsdag"].replace("Første levering: ", ""), freq: freqKey() !== "en-gang" ? data["Hyppighet"] : "",
        address: data["Adresse"] + (data["Område"] && data["Område"] !== "Annet" ? ", " + data["Område"] : "")
      }));
    } catch (e) {}
    location.href = (S.base || "") + "/takk/";
  }
})();
