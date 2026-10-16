(function () {
  var S = window.SITE || {};
  var fmt = function (n) { return n.toLocaleString("nb-NO") + " kr"; };
  var EVENT_NAMES = {
    click_tel: "Trykket på telefonnummer", begin_checkout: "Begynte på bestilling",
    generate_lead: "Bestilling sendt", order_error: "Feil ved sending av bestilling",
    purchase_lead_view: "Så takkesiden", article_cta: "Klikket bestill i artikkel",
    calculator_to_order: "Brukte vedkalkulatoren", price_check: "Sjekket pris i skjemaet",
    form_invalid: "Trykket Send, men et felt manglet",
    antall_valgt: "Endret antall sekker til", bestilt_antall: "Bestilte antall sekker",
    dag_valgt: "Valgte leveringsdag",
    hyppighet_valgt: "Valgte hvor ofte", bestilt_hyppighet: "Bestilte med hyppighet"
  };
  var track = function (name, params) {
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

  document.querySelectorAll('[data-track="tel"]').forEach(function (a) {
    a.addEventListener("click", function () { track("click_tel"); });
  });

  // Mobil: vis "Bestill"-knapp nederst når bestillingsskjemaet ikke er synlig.
  var cta = document.querySelector(".sticky-cta");
  var orderSec = document.getElementById("bestill");
  if (cta && orderSec && "IntersectionObserver" in window) {
    var heroVisible = true, orderVisible = false;
    var upd = function () { cta.classList.toggle("show", !heroVisible && !orderVisible); };
    new IntersectionObserver(function (e) { orderVisible = e[0].isIntersecting; upd(); }).observe(orderSec);
    var hero = document.querySelector(".hero");
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
  // Skrur folk antallet opp eller ned fra standard (50)? Måles som «antall_valgt:20-49» osv., én gang per gruppe,
  // og først når antallet har ligget stille i 2 sekunder (så + og − ikke gir en hendelse per klikk).
  var qtyDefault = parseInt(qty.defaultValue, 10) || 0, qtySeen = {}, qtyTimer = null;
  function qtyBucket(n) {
    return n < qtyDefault ? (n < 10 ? "under-10" : n < 20 ? "10-19" : n < 30 ? "20-29" : "30-" + (qtyDefault - 1)) :
      n === qtyDefault ? String(qtyDefault) : n < 100 ? (qtyDefault + 1) + "-99" : "100+";
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
  form.querySelector('[name="Side"]').value = location.pathname;
  // Husk kampanjen (utm_*) kunden kom fra, så vi ser hvilken reklame som gir bestillinger.
  try {
    var q = new URLSearchParams(location.search), utm = [];
    ["utm_source", "utm_medium", "utm_campaign"].forEach(function (k) { if (q.get(k)) utm.push(q.get(k)); });
    if (utm.length) sessionStorage.setItem("utm", utm.join(" / "));
    form.querySelector('[name="Kampanje"]').value = sessionStorage.getItem("utm") || document.referrer || "direkte";
  } catch (e) {}
  calc();

  // Leveringsdag. Vi kjører bare på dagene i S.days.weekdays (mandag og tirsdag), og hver dag har en fast mengde tid.
  // En bestilling tar kjøretid til området + lossing + bæring per sekk. Ås ligger nær lageret, så der får flere plass.
  // Hvor mye tid som alt er bestilt, hentes fra kalenderen (Google Apps Script, se kalender/README.md) hvis den er satt opp.
  var D = S.days || {}, dayBox = form.querySelector("#f-dager"), dayInput = form.querySelector("#f-leveringsdag"),
    dayMsg = form.querySelector("#f-dag-msg"), area = form.querySelector("#f-sted"), booked = {}, closed = {}, reserved = null;
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var iso = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var addDays = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
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
  function deliveryDays() {
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), out = [],
      hol = Object.assign(holidays(today.getFullYear()), holidays(today.getFullYear() + 1));
    for (var n = 1; n <= (D.weeks_ahead || 4) * 7; n++) {
      var d = addDays(today, n);
      if ((D.weekdays || [1, 2]).indexOf(d.getDay()) < 0 || hol[iso(d)] || closed[iso(d)]) continue;
      // Bestill senest kl. order_by_hour dagen før.
      var cutoff = addDays(d, -1); cutoff.setHours(D.order_by_hour == null ? 18 : D.order_by_hour);
      if (now < cutoff) out.push(d);
    }
    return out;
  }
  function orderMinutes() {
    var n = Math.max(0, parseInt(qty.value, 10) || 0);
    var carried = (parseInt(carry.options[carry.selectedIndex].dataset.fee, 10) || 0) > 0;
    var drive = (D.drive_minutes || {})[area.value];
    if (drive == null) drive = (D.drive_minutes || {})["Annet"] || 60;
    return Math.round(drive + (D.unload_minutes || 0) + (carried ? n * (D.carry_minutes_per_sack || 0) : 0));
  }
  function dayLabel(d) {
    var t = d.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  // En dag passer hvis bestillingen får plass i tiden som er igjen. En tom dag tar alltid imot (også store bestillinger).
  function fits(k) { var used = booked[k] || 0; return used === 0 || used + orderMinutes() <= (D.minutes_per_day || 300); }
  function renderDays() {
    if (!dayBox) return;
    var days = deliveryDays(), mins = orderMinutes(), cap = D.minutes_per_day || 300, any = false;
    dayBox.innerHTML = "";
    days.forEach(function (d) {
      var k = iso(d), ok = fits(k), left = cap - (booked[k] || 0);
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "radio"); b.dataset.date = k; b.dataset.label = dayLabel(d);
      b.disabled = !ok;
      b.setAttribute("aria-checked", String(dayInput.value === k && ok));
      if (dayInput.value === k && ok) b.classList.add("on");
      var t = d.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
      b.innerHTML = "<strong></strong><span></span>";
      b.firstChild.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      b.lastChild.textContent = !ok ? "Fullt" : (booked[k] && left < mins * 2) ? "Få plasser" : "Ledig";
      b.addEventListener("click", function () { pickDay(k); });
      dayBox.appendChild(b);
      if (ok) any = true;
    });
    if (dayInput.value && !(days.some(function (d) { return iso(d) === dayInput.value; }) && fits(dayInput.value))) {
      dayInput.value = "";
      dayMsg.textContent = "Dagen du valgte, har ikke plass til denne bestillingen lenger. Velg en annen dag.";
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
  renderDays();
  if (D.calendar_url) {
    fetch(D.calendar_url).then(function (r) { return r.json(); }).then(function (j) {
      booked = j.booked || {}; (j.closed || []).forEach(function (k) { closed[k] = true; }); renderDays();
    }).catch(function () {});
  }
  ["input", "change"].forEach(function (t) {
    form.addEventListener(t, function (e) { if (e.target === qty || e.target === carry || e.target === area) renderDays(); });
  });
  form.querySelectorAll(".qty-btn, .chips button").forEach(function (b) { b.addEventListener("click", renderDays); });

  // Hold av tiden i kalenderen før bestillingen sendes. Svarer kalenderen at dagen er full, må kunden velge en annen dag.
  // Feiler kalenderen (nett, oppsett), sendes bestillingen likevel, med en merknad om at dagen ikke er registrert.
  function reserve(data) {
    if (!D.calendar_url || reserved === dayInput.value) return Promise.resolve(true);
    return fetch(D.calendar_url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // text/plain gir ingen CORS-forhåndsforespørsel
      body: JSON.stringify({ date: dayInput.value, minutes: orderMinutes(), capacity: D.minutes_per_day || 300,
        area: data["Område"], sacks: +data["Antall sekker"], phone: data["Telefon"],
        address: data["Adresse"], carry: data["Bæring"], total: data["Beregnet totalpris"],
        email: data.email || "",
        // Vedabonnement: hyppigheten står først i meldingen, så eieren ser den på eiersiden.
        message: (freqKey() !== "en-gang" ? "Vedabonnement: " + data["Hyppighet"].toLowerCase() + ". " : "") + (data["Melding"] || "") })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.ok) { reserved = dayInput.value; return true; }
      // Andre feil enn «full» eller «for sent»: bestillingen sendes likevel, med en merknad.
      if (!j.full && j.error !== "dato") { data["Leveringsdag"] += " (ikke registrert i kalenderen)"; return true; }
      if (j.booked) booked = j.booked;
      dayMsg.dataset.keep = "1";
      renderDays();
      dayMsg.textContent = j.error === "dato" ? "Den dagen er det for sent å bestille til. Velg en annen dag." :
        "Beklager, dagen ble akkurat full. Velg en annen dag og trykk Send igjen.";
      if (j.error === "dato") { closed[dayInput.value] = true; dayInput.value = ""; renderDays(); }
      return false;
    }).catch(function () { data["Leveringsdag"] += " (ikke registrert i kalenderen)"; return true; });
  }

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

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
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
    delete data._baering;
    var dayBtn = dayBox && dayBox.querySelector('[data-date="' + dayInput.value + '"]');
    var dayText = dayBtn ? dayBtn.dataset.label : dayInput.value;
    var repeat = freqKey() !== "en-gang";
    if (repeat) data["Beregnet totalpris"] += " per levering";
    data["Leveringsdag"] = (repeat ? "Første levering: " : "") + dayText;
    data["Beregnet tid"] = orderMinutes() + " min (kjøring, lossing og bæring)";
    data._subject = (repeat ? "Nytt vedabonnement: " : "Ny vedbestilling: ") + data["Antall sekker"] + " sekker" +
      (repeat ? " " + data["Hyppighet"].replace("Fast levering ", "") : "") + " – " + data["Adresse"] + ", " + data["Område"] +
      " – " + dayText.toLowerCase();
    // E-post er valgfritt. Bare en gyldig adresse får automatisk bekreftelse fra FormSubmit.
    var epost = (data["E-post"] || "").trim();
    delete data["E-post"];
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epost)) {
      data.email = epost;
      data._replyto = epost;
      data._autoresponse = "Takk for bestillingen hos " + S.brand + "! Vi har mottatt bestilling på " +
        data["Antall sekker"] + " sekker bjørkeved (beregnet " + fmt(total) + (repeat ? " per levering, " + data["Hyppighet"].toLowerCase() : "") + "). Vi ringer deg for å bekrefte. " +
        (repeat ? "Første leveringsdag: " : "Ønsket leveringsdag: ") + dayText.toLowerCase() + ". Spørsmål? Ring " + S.phone + ".";
    } else if (epost) {
      data["E-post (ugyldig)"] = epost;
    }
    delete data._next;

    var btn = form.querySelector('button[type="submit"]');
    var setBtn = function (busy) { btn.disabled = busy; btn.querySelector(".btn-label").textContent = busy ? "Sender …" : "Send bestilling"; };
    setBtn(true);

    reserve(data).then(function (go) {
      if (!go) { setBtn(false); return; }
      send(data, total, setBtn);
    });
  });

  function send(data, total, setBtn) {
    fetch(S.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || String(res.j.success) !== "true") throw new Error(res.j.message || "Feil");
        track("generate_lead", { value: total, currency: "NOK", sacks: +data["Antall sekker"] });
        track("bestilt_antall:" + qtyBucket(+data["Antall sekker"]));
        track("bestilt_hyppighet:" + freqKey());
        try { if (window.fbq) fbq("track", "Lead", { value: total, currency: "NOK" }); } catch (e) {}
        try { if (window.gtag && S.adsConversion) gtag("event", "conversion", { send_to: S.adsConversion, value: total, currency: "NOK" }); } catch (e) {}
        try {
          sessionStorage.setItem("lastOrder", JSON.stringify({
            qty: data["Antall sekker"], carry: data["Bæring"], total: fmt(total),
            day: data["Leveringsdag"].replace("Første levering: ", ""), freq: freqKey() !== "en-gang" ? data["Hyppighet"] : "",
            address: data["Adresse"] + ", " + data["Område"]
          }));
        } catch (e) {}
        location.href = (S.base || "") + "/takk/";
      })
      .catch(function (err) {
        setBtn(false);
        // Bestillingen skal ikke gå tapt: la kunden sende den som vanlig e-post med alt ferdig utfylt.
        var lines = [];
        Object.keys(data).forEach(function (k) {
          if (k.charAt(0) !== "_" && data[k]) lines.push(k + ": " + data[k]);
        });
        var mailto = "mailto:" + S.orderEmail + "?subject=" + encodeURIComponent(data._subject) +
          "&body=" + encodeURIComponent(lines.join("\n"));
        msg.className = "form-msg err";
        msg.innerHTML = "Beklager, bestillingen kom ikke fram. <a href=\"" + mailto + "\">Send den på e-post i stedet</a> " +
          "(alt er fylt ut for deg), eller ring oss på <a href=\"tel:" + S.phone.replace(/\s/g, "") + "\">" + S.phone + "</a>.";
        track("order_error", { reason: (err && err.message) || "ukjent" });
      });
  }
})();
