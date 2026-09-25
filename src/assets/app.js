(function () {
  var S = window.SITE || {};
  var fmt = function (n) { return n.toLocaleString("nb-NO") + " kr"; };
  var track = function (name, params) {
    try { if (window.gtag) gtag("event", name, params || {}); } catch (e) {}
    try { if (window.fbq) fbq("trackCustom", name, params || {}); } catch (e) {}
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
        ["Din bestilling", last.qty + " sekker bjørkeved", last.carry, last.address, "Beregnet: " + last.total]
          .forEach(function (t, i) {
            var p = document.createElement(i === 0 || i === 4 ? "strong" : "div");
            p.textContent = t; p.style.display = "block"; ts.appendChild(p);
          });
        ts.hidden = false;
        track("purchase_lead_view");
      }
    } catch (e) {}
  }

  var form = document.getElementById("order-form");
  if (!form) return;

  var qty = form.querySelector("#f-antall");
  var carry = form.querySelector("#f-baering");
  var msg = form.querySelector("#form-msg");
  var chips = form.querySelectorAll(".chips button");
  var started = false;

  function calc() {
    var n = Math.max(0, parseInt(qty.value, 10) || 0);
    var fee = parseInt(carry.options[carry.selectedIndex].dataset.fee, 10) || 0;
    var wood = n * S.price, carryTotal = n * fee;
    var total = wood + carryTotal + (S.deliveryFee || 0);
    document.getElementById("s-ved").textContent = n + " × " + S.price + " kr = " + fmt(wood);
    document.getElementById("s-baering").textContent = fee ? n + " × " + fee + " kr = " + fmt(carryTotal) : "–";
    document.getElementById("s-total").textContent = fmt(total);
    document.getElementById("f-total").value = fmt(total) + (S.deliveryFee == null ? " + levering (avtales)" : "");
    chips.forEach(function (c) { c.classList.toggle("on", parseInt(c.dataset.qty, 10) === n); });
    return total;
  }

  form.querySelectorAll(".qty-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      qty.value = Math.max(1, (parseInt(qty.value, 10) || 0) + parseInt(b.dataset.step, 10));
      calc();
    });
  });
  chips.forEach(function (c) {
    c.addEventListener("click", function () { qty.value = c.dataset.qty; calc(); });
  });
  form.addEventListener("input", function (e) {
    if (e.target.classList) e.target.classList.remove("invalid");
    calc();
    if (!started) { started = true; track("begin_checkout"); }
  });
  form.addEventListener("change", calc);
  form.querySelector('[name="Side"]').value = location.pathname;
  calc();

  function validate() {
    var ok = true, first = null;
    form.querySelectorAll("[required]").forEach(function (el) {
      var bad = !el.value.trim() || (el.pattern && !new RegExp("^" + el.pattern + "$").test(el.value.trim())) ||
        (el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim())) ||
        (el.type === "number" && !(parseInt(el.value, 10) >= 1));
      el.classList.toggle("invalid", bad);
      if (bad) { ok = false; first = first || el; }
    });
    if (first) first.focus();
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
    data._subject = "Ny vedbestilling: " + data["Antall sekker"] + " sekker – " + data["Navn"] + ", " + data["Område"];
    data._replyto = data.email;
    data._autoresponse = "Takk for bestillingen hos " + S.brand + "! Vi har mottatt bestilling på " +
      data["Antall sekker"] + " sekker bjørkeved (beregnet " + fmt(total) + "). Vi ringer deg for å avtale levering. " +
      "Spørsmål? Ring " + S.phone + ".";
    delete data._next;

    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Sender …";

    fetch(S.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || String(res.j.success) !== "true") throw new Error(res.j.message || "Feil");
        track("generate_lead", { value: total, currency: "NOK", sacks: +data["Antall sekker"] });
        try { if (window.fbq) fbq("track", "Lead", { value: total, currency: "NOK" }); } catch (e) {}
        try { if (window.gtag && S.adsConversion) gtag("event", "conversion", { send_to: S.adsConversion, value: total, currency: "NOK" }); } catch (e) {}
        try {
          sessionStorage.setItem("lastOrder", JSON.stringify({
            qty: data["Antall sekker"], carry: data["Bæring"], total: fmt(total),
            address: data["Adresse"] + ", " + data["Postnummer"]
          }));
        } catch (e) {}
        location.href = (S.base || "") + "/takk/";
      })
      .catch(function () {
        btn.disabled = false; btn.textContent = "Send bestilling";
        msg.className = "form-msg err";
        msg.innerHTML = "Beklager, noe gikk galt da vi skulle sende bestillingen. Ring oss på <a href=\"tel:" +
          S.phone.replace(/\s/g, "") + "\">" + S.phone + "</a>, så ordner vi det.";
        track("order_error");
      });
  });
})();
