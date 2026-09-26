#!/usr/bin/env python3
"""
Bygger den statiske nettsiden til public/.

    python3 build.py

Ingen avhengigheter utover Python 3.8+. All tekst/priser styres fra config.py.
"""
import html
import json
import os
import re
import shutil
from datetime import date
from pathlib import Path

import config as C
import artikler_build as AB

ROOT = Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "public"
TODAY = date.today().isoformat()
# I GitHub Actions settes SITE_URL/BASE_PATH automatisk (se .github/workflows/pages.yml),
# slik at siden fungerer både på github.io-adressen og på eget domene.
URL = (os.environ.get("SITE_URL") or C.SITE_URL).rstrip("/")
BASE = os.environ.get("BASE_PATH", "").rstrip("/")
P = C.PRODUCT
CO = C.COMPANY

esc = html.escape


def kr(n):
    return f"{n:,}".replace(",", " ") + " kr"


def faq_items():
    fmt = dict(price=P["price"], vat=P["vat_text"], kg=P["kg"], length=P["length_cm"],
               dia=P["diameter_cm"], phone=CO["phone_display"],
               delivery=C.DELIVERY_FEE if C.DELIVERY_FEE is not None else "–")
    return [(q, a.format(**fmt)) for q, a in C.FAQ]


# ---------------------------------------------------------------- structured data

def business_ld():
    return {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "@id": f"{URL}/#business",
        "name": C.BRAND,
        "legalName": CO["legal_name"],
        "description": f"Salg og levering av tørr bjørkeved i 40-liters sekker i hele Follo. {P['price']} kr per sekk, med bæring inn.",
        "url": f"{URL}/",
        "telephone": CO["phone"],
        "email": CO["email"],
        "image": f"{URL}/img/og-bjorkeved-follo.jpg",
        "logo": f"{URL}/img/icon-192.png",
        "priceRange": f"{P['price']} kr per sekk",
        "taxID": CO["org_nr"].replace(" ", ""),
        "address": {
            "@type": "PostalAddress",
            "streetAddress": CO["street"],
            "postalCode": CO["postal_code"],
            "addressLocality": CO["city"],
            "addressRegion": CO["region"],
            "addressCountry": "NO",
        },
        "areaServed": [{"@type": "Place", "name": a["name"]} for a in C.AREAS]
                      + [{"@type": "AdministrativeArea", "name": "Follo"}],
        "sameAs": [CO["facebook"], CO["main_site"]],
        "makesOffer": {"@id": f"{URL}/#offer"},
    }


def product_ld():
    return {
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": f"{URL}/#product",
        "name": P["name"],
        "description": f"Tørr bjørkeved lagret under tak. {P['liters']} liter, ca. {P['kg']} kg, kubber ca. {P['length_cm']} cm. Levert på døra i Follo.",
        "image": f"{URL}/img/og-bjorkeved-follo.jpg",
        "brand": {"@type": "Brand", "name": C.BRAND},
        "category": "Ved / brensel",
        "offers": {
            "@type": "Offer",
            "@id": f"{URL}/#offer",
            "price": str(P["price"]),
            "priceCurrency": "NOK",
            "availability": "https://schema.org/InStock",
            "url": f"{URL}/#bestill",
            "seller": {"@id": f"{URL}/#business"},
            "areaServed": "Follo",
            **({"shippingDetails": {
                "@type": "OfferShippingDetails",
                "shippingRate": {"@type": "MonetaryAmount", "value": str(C.DELIVERY_FEE), "currency": "NOK"},
                "shippingDestination": {"@type": "DefinedRegion", "addressCountry": "NO", "addressRegion": "Akershus"},
            }} if C.DELIVERY_FEE else {}),
        },
    }


def faq_ld(items):
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": q,
                        "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in items],
    }


def breadcrumb_ld(name, path):
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Bjørkeved i Follo", "item": f"{URL}/"},
            {"@type": "ListItem", "position": 2, "name": name, "item": f"{URL}{path}"},
        ],
    }


def ld_tags(*objs):
    return "\n".join(
        f'<script type="application/ld+json">{json.dumps(o, ensure_ascii=False)}</script>' for o in objs)


# ---------------------------------------------------------------- layout

def analytics_head():
    parts = []
    if C.GOATCOUNTER:
        parts.append(f'<script data-goatcounter="https://{C.GOATCOUNTER}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>')
    tag = C.GA4_ID or C.GADS_ID
    if tag:
        cfg = "".join(f"gtag('config','{i}');" for i in (C.GA4_ID, C.GADS_ID) if i)
        parts.append(
            f'<script async src="https://www.googletagmanager.com/gtag/js?id={tag}"></script>'
            f"<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}"
            f"gtag('js',new Date());{cfg}</script>")
    if C.META_PIXEL_ID:
        parts.append(
            "<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?"
            "n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;"
            "n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;"
            "s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',"
            f"'https://connect.facebook.net/en_US/fbevents.js');fbq('init','{C.META_PIXEL_ID}');fbq('track','PageView');</script>")
    return "\n".join(parts)


def head(title, desc, path, ld="", noindex=False):
    canonical = f"{URL}{path}"
    robots = '<meta name="robots" content="noindex">' if noindex else ""
    return f"""<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
{robots}
<link rel="canonical" href="{canonical}">
<meta name="theme-color" content="#1f3a2b">
<meta property="og:type" content="website">
<meta property="og:locale" content="nb_NO">
<meta property="og:site_name" content="{esc(C.BRAND)}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{URL}/img/og-bjorkeved-follo.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="geo.region" content="NO-32">
{f'<meta name="google-site-verification" content="{C.GOOGLE_SITE_VERIFICATION}">' if path == "/" and getattr(C, "GOOGLE_SITE_VERIFICATION", "") else ""}
<meta name="geo.placename" content="Follo">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" as="image" href="/img/bjorkeved-levering-follo-768.webp" imagesrcset="/img/bjorkeved-levering-follo-768.webp 768w, /img/bjorkeved-levering-follo-1536.webp 1536w" imagesizes="(min-width: 900px) 50vw, 100vw">
<link rel="stylesheet" href="/assets/style.css">
{ld}
{analytics_head()}
</head>
<body>
<a class="skip" href="#innhold">Hopp til innhold</a>
<header class="topbar">
  <div class="wrap topbar-in">
    <a class="logo" href="/" aria-label="{esc(C.BRAND)} – forsiden">
      <span class="logo-mark" aria-hidden="true">🪵</span><span>{esc(C.BRAND)}</span>
    </a>
    <nav class="topnav" aria-label="Hovedmeny">
      <a href="/#priser">Priser</a>
      <a href="/#omrader">Områder</a>
      <a href="/#sporsmal">Spørsmål</a>
      <a href="/artikler/">Råd om ved</a>
      <a class="tel" href="tel:{CO['phone'].replace(' ', '')}" data-track="tel">☎ {CO['phone_display']}</a>
      <a class="btn btn-sm" href="#bestill">Bestill</a>
    </nav>
  </div>
</header>
<main id="innhold">
"""


def footer():
    areas = " · ".join(f'<a href="/{a["slug"]}/">{esc(a["name"])}</a>' for a in C.AREAS)
    tel = CO["phone"].replace(" ", "")
    return f"""</main>
<footer class="footer">
  <div class="wrap footer-grid">
    <div>
      <p class="footer-brand">{esc(C.BRAND)}</p>
      <p>Tørr bjørkeved levert på døra i hele Follo. Levert av {esc(CO['legal_name'])}, som er et lokalt firma i Ås.</p>
    </div>
    <div>
      <p class="footer-h">Kontakt</p>
      <p><a href="tel:{tel}" data-track="tel">{CO['phone_display']}</a><br>
      <a href="mailto:{CO['email']}">{CO['email']}</a><br>
      {esc(CO['street'])}, {CO['postal_code']} {esc(CO['city'])}<br>
      Org.nr. {CO['org_nr']}</p>
    </div>
    <div>
      <p class="footer-h">Vi leverer i</p>
      <p class="footer-areas">{areas}</p>
      <p><a href="{CO['facebook']}" rel="noopener">Facebook</a> · <a href="/artikler/">Råd om ved</a> · <a href="{CO['main_site']}" rel="noopener">Andre tjenester</a> · <a href="/personvern/">Personvern</a></p>
      <p class="footer-h">Verktøy og tall</p>
      <p>{'<a href="/vedpris/">' + C.VEDPRIS['name'] + ' ' + str(C.VEDPRIS['year']) + '</a> · ' if VEDPRISER else ''}<a href="/fyre-i-dag/">Lønner det seg å fyre i dag?</a> · <a href="/verktoy/">Gratis verktøy</a> · <a href="/data/">Åpne data</a> · <a href="/presse/">Presse</a></p>
    </div>
  </div>
</footer>
<a class="sticky-cta btn" href="#bestill">Bestill ved – {P['price']} kr/sekk</a>
<script>window.SITE={json.dumps(site_js_config(), ensure_ascii=False)};</script>
<script src="/assets/app.js" defer></script>
</body>
</html>
"""


def site_js_config():
    return {
        "price": P["price"],
        "deliveryFee": C.DELIVERY_FEE,
        "endpoint": f"https://formsubmit.co/ajax/{C.ORDER_EMAIL}",
        "brand": C.BRAND,
        "phone": CO["phone_display"],
        "adsConversion": C.GADS_CONVERSION,
        "base": BASE,
    }


# ---------------------------------------------------------------- sections

def hero(h1, lead):
    return f"""
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-text">
      <p class="eyebrow">Lokalt fra Ås · Levering i hele Follo</p>
      <h1>{h1}</h1>
      <p class="lead">{lead}</p>
      <ul class="usp">
        <li><strong>{P['price']} kr</strong> per 40-liters sekk</li>
        <li>Tørr og lagret <strong>under tak</strong></li>
        <li>Vi <strong>bærer veden inn</strong> for deg</li>
      </ul>
      <div class="hero-cta">
        <a class="btn btn-lg" href="#bestill">Bestill bjørkeved</a>
        <a class="btn btn-ghost btn-lg" href="tel:{CO['phone'].replace(' ', '')}" data-track="tel">Ring {CO['phone_display']}</a>
      </div>
    </div>
    <picture class="hero-img">
      <source type="image/webp" srcset="/img/bjorkeved-levering-follo-768.webp 768w, /img/bjorkeved-levering-follo-1536.webp 1536w" sizes="(min-width: 900px) 50vw, 100vw">
      <img src="/img/bjorkeved-levering-follo-768.jpg" srcset="/img/bjorkeved-levering-follo-768.jpg 768w, /img/bjorkeved-levering-follo-1536.jpg 1536w" sizes="(min-width: 900px) 50vw, 100vw" width="768" height="512" alt="Sjåfør fra {esc(CO['legal_name'])} leverer sekker med bjørkeved foran varebilen" fetchpriority="high">
    </picture>
  </div>
</section>"""


def price_section():
    rows = "\n".join(
        f"<tr><td>{esc(label)}</td><td>{'–' if fee == 0 else '+ ' + str(fee) + ' kr'}</td></tr>"
        for _, label, fee in C.CARRY_OPTIONS)
    ex10 = 10 * P["price"]
    fee = C.DELIVERY_FEE
    delivery_ex = (f" + hjemlevering {kr(fee)} = <strong>{kr(ex10 + fee)}</strong>" if fee
                   else "")
    return f"""
<section id="priser" class="section">
  <div class="wrap">
    <h2>Pris på bjørkeved</h2>
    <div class="price-grid">
      <div class="card price-card">
        <p class="price-name">{esc(P['name'])}</p>
        <p class="price"><span>{P['price']}</span> kr <small>per sekk {esc(P['vat_text'])}</small></p>
        <ul class="facts">
          <li>{P['liters']} liter, ca. {P['kg']} kg per sekk</li>
          <li>Kubber ca. {P['length_cm']} cm lange, {P['diameter_cm']} cm tykke</li>
          <li>Tørket og lagret under tak</li>
          <li>Produsert etter norsk standard</li>
          <li>Hjemlevering: {kr(C.DELIVERY_FEE) + ' per bestilling' if C.DELIVERY_FEE else 'avtales'}</li>
        </ul>
        <p class="example">Eksempel: 10 sekker = {kr(ex10)}{delivery_ex}</p>
        <a class="btn" href="#bestill">Regn ut pris og bestill</a>
      </div>
      <div class="card">
        <h3>Bæring (tillegg per bestilling)</h3>
        <table class="carry">
          <tbody>{rows}</tbody>
        </table>
      </div>
    </div>
  </div>
</section>"""


def steps_section():
    return """
<section class="section alt">
  <div class="wrap">
    <h2>Slik bestiller du</h2>
    <ol class="steps">
      <li><strong>Fyll ut skjemaet.</strong> Velg hvor mange sekker du vil ha og hvor de skal bæres. Du ser prisen med en gang.</li>
      <li><strong>Vi ringer deg.</strong> Vi bekrefter bestillingen og avtaler en dag som passer.</li>
      <li><strong>Veden kommer.</strong> Vi kjører den hjem til deg og bærer den dit du vil ha den.</li>
    </ol>
  </div>
</section>"""


def order_form(area_name=""):
    opts = "\n".join(
        f'<option value="{k}" data-fee="{fee}">{esc(label)}{"" if fee == 0 else f" (+{fee} kr)"}</option>'
        for k, label, fee in C.CARRY_OPTIONS)
    area_opts = "\n".join(
        f'<option{" selected" if a["name"] == area_name else ""}>{esc(a["name"])}</option>' for a in C.AREAS)
    fee_line = ("Avtales ved bekreftelse" if C.DELIVERY_FEE is None
                else ("Gratis" if C.DELIVERY_FEE == 0 else kr(C.DELIVERY_FEE)))
    return f"""
<section id="bestill" class="section order">
  <div class="wrap order-grid">
    <div class="order-intro">
      <h2>Bestill bjørkeved{(' i ' + esc(area_name)) if area_name else ''}</h2>
      <p>Send bestillingen her. Vi ringer deg, som regel innen én arbeidsdag, for å avtale levering. Du betaler ingenting nå.</p>
      <p class="muted">Vil du heller ringe? <a href="tel:{CO['phone'].replace(' ', '')}" data-track="tel">{CO['phone_display']}</a></p>
    </div>
    <form class="card form" id="order-form" action="https://formsubmit.co/{C.ORDER_EMAIL}" method="POST" novalidate>
      <input type="hidden" name="_subject" value="Ny vedbestilling – {esc(C.BRAND)}">
      <input type="hidden" name="_template" value="table">
      <input type="hidden" name="_next" value="{URL}/takk/">
      <input type="text" name="_honey" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <input type="hidden" name="Side" value="">
      <input type="hidden" name="Kampanje" value="">

      <fieldset>
        <legend>Ved</legend>
        <label for="f-antall">Antall sekker (40 liter)</label>
        <div class="qty">
          <button type="button" class="qty-btn" data-step="-1" aria-label="Færre sekker">−</button>
          <input id="f-antall" name="Antall sekker" type="number" inputmode="numeric" min="1" max="500" value="10" required>
          <button type="button" class="qty-btn" data-step="1" aria-label="Flere sekker">+</button>
        </div>
        <div class="chips" role="group" aria-label="Hurtigvalg antall">
          <button type="button" data-qty="5">5</button><button type="button" data-qty="10">10</button>
          <button type="button" data-qty="20">20</button><button type="button" data-qty="40">40</button>
        </div>
        <label for="f-baering">Bæring</label>
        <select id="f-baering" name="Bæring" required>
          {opts}
        </select>
      </fieldset>

      <fieldset>
        <legend>Leveringsadresse</legend>
        <label for="f-adresse">Gateadresse</label>
        <input id="f-adresse" name="Adresse" autocomplete="street-address" required>
        <div class="row2">
          <div><label for="f-postnr">Postnummer</label>
          <input id="f-postnr" name="Postnummer" inputmode="numeric" pattern="[0-9]{{4}}" maxlength="4" autocomplete="postal-code" required></div>
          <div><label for="f-sted">Område</label>
          <select id="f-sted" name="Område">{area_opts}<option>Annet</option></select></div>
        </div>
        <label for="f-tid">Når ønsker du levering?</label>
        <select id="f-tid" name="Ønsket levering">
          <option>Så snart som mulig</option>
          <option>Innen 2 uker</option>
          <option>Innen 1 måned</option>
          <option>Fleksibelt – avtal med meg</option>
        </select>
      </fieldset>

      <fieldset>
        <legend>Kontaktinfo</legend>
        <label for="f-navn">Navn</label>
        <input id="f-navn" name="Navn" autocomplete="name" required>
        <div class="row2">
          <div><label for="f-tlf">Telefon</label>
          <input id="f-tlf" name="Telefon" type="tel" inputmode="tel" autocomplete="tel" required></div>
          <div><label for="f-epost">E-post</label>
          <input id="f-epost" name="email" type="email" autocomplete="email" required></div>
        </div>
        <label for="f-kilde">Hvor fant du oss?</label>
        <select id="f-kilde" name="Hvor fant du oss">
          <option value="">Velg …</option>
          <option>Google-søk</option>
          <option>Google Maps</option>
          <option>Facebook / Instagram</option>
          <option>FINN.no</option>
          <option>Flygeblad i postkassen</option>
          <option>Anbefalt av noen</option>
          <option>Har kjøpt før</option>
          <option>ChatGPT / KI-søk</option>
          <option>Annet</option>
        </select>
        <label for="f-melding">Melding (valgfritt)</label>
        <textarea id="f-melding" name="Melding" rows="3" placeholder="F.eks. port-kode, hvor sekkene skal stå, eller et ønsket tidspunkt"></textarea>
      </fieldset>

      <div class="summary" aria-live="polite">
        <div><span>Ved</span><span id="s-ved">–</span></div>
        <div><span>Bæring</span><span id="s-baering">–</span></div>
        <div><span>Levering</span><span>{fee_line}</span></div>
        <div class="total"><span>Totalt {esc(P['vat_text'])}</span><span id="s-total">–</span></div>
      </div>
      <input type="hidden" name="Beregnet totalpris" id="f-total">

      <button class="btn btn-lg btn-block" type="submit">Send bestilling</button>
      <p class="form-msg" id="form-msg" role="alert"></p>
      <p class="muted small">Når du sender skjemaet, får vi navnet, adressen og kontaktinfoen din. Vi bruker det bare til å levere veden. Les mer i <a href="/personvern/">personvernerklæringen</a>.</p>
    </form>
  </div>
</section>"""


def areas_section(current_slug=None):
    links = "\n".join(
        f'<li><a href="/{a["slug"]}/"><strong>Ved {esc(a["name"])}</strong><span>{esc(", ".join(a["places"][:3]))}</span></a></li>'
        for a in C.AREAS if a["slug"] != current_slug)
    title = "Vi leverer også i" if current_slug else "Vi leverer bjørkeved i hele Follo"
    return f"""
<section id="omrader" class="section alt">
  <div class="wrap">
    <h2>{title}</h2>
    <ul class="areas">{links}</ul>
  </div>
</section>"""


def faq_section(items):
    qs = "\n".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in items)
    return f"""
<section id="sporsmal" class="section">
  <div class="wrap narrow">
    <h2>Ofte stilte spørsmål om ved</h2>
    {qs}
  </div>
</section>"""


def guides_section():
    if not ARTICLES:
        return ""
    items = "".join(
        f'<li><a href="/artikler/{a["slug"]}/"><strong>{esc(a["title"])}</strong><span>{esc(a["description"][:90])}…</span></a></li>'
        for a in ARTICLES[:6])
    return f"""
<section class="section">
  <div class="wrap">
    <h2>Råd om ved</h2>
    <ul class="areas">{items}</ul>
    <p><a href="/artikler/">Se alle artikler →</a></p>
  </div>
</section>"""


def trust_section():
    return f"""
<section class="section">
  <div class="wrap">
    <h2>Derfor kjøper naboene ved av oss</h2>
    <div class="trust">
      <div class="card"><h3>Lokale</h3><p>Vi holder til i Ås og kjører bare i Follo. Det gir kort vei og raske leveringer. Når du ringer, snakker du med de som faktisk kjører veden.</p></div>
      <div class="card"><h3>Tørr ved som brenner godt</h3><p>Veden er lagret under tak, så den holder seg tørr og er klar for peisen med en gang. Tørr ved gir mer varme, mindre sot og mindre røyk.</p></div>
      <div class="card"><h3>Båret helt inn</h3><p>Vi kan sette veden i garasjen, i kjelleren eller helt opp til 6. etasje. Du trenger ikke løfte noe selv.</p></div>
      <div class="card"><h3>Ordentlig firma</h3><p>{esc(CO['legal_name'])} (org.nr. {CO['org_nr']}) driver også med vaktmester-, vinter- og hagetjenester i Follo.</p></div>
    </div>
  </div>
</section>"""


# ---------------------------------------------------------------- pages

def page_index():
    items = faq_items()
    title = f"Bjørkeved i Follo – levert på døra, {P['price']} kr/sekk | {C.BRAND}"
    desc = (f"Kjøp tørr bjørkeved med levering i Ås, Ski, Kolbotn, Vestby, Drøbak, Nesodden og Enebakk. "
            f"{P['price']} kr per 40 L sekk. Vi bærer veden inn. Bestill på nett.")
    ld = ld_tags(business_ld(), product_ld(), faq_ld(items))
    body = (hero("Tørr bjørkeved levert på døra i Follo",
                 f"Vi kjører tørr og god bjørkeved hjem til deg i hele Follo. Du kan få den satt i garasjen, i kjelleren eller båret opp trappa. "
                 f"Én sekk koster {P['price']} kr.")
            + price_section() + order_form() + steps_section() + trust_section()
            + areas_section() + guides_section() + faq_section(items))
    return head(title, desc, "/", ld) + body + footer()


def nb(n):
    return f"{round(n):,}".replace(",", "\u00a0")


def local_stats(a):
    s = C.KOMMUNE_STATS.get(a["kommune"])
    if not s:
        return ""
    wood_hh = s["husstander"] * C.WOOD_SHARE
    sacks = wood_hh * C.KG_PER_HOUSEHOLD / P["kg"]
    feier = C.FEIER.get(a["kommune"], C.FEIER["default"])
    k = esc(a["kommune"])
    return f"""
<section class="section alt">
  <div class="wrap narrow prose">
    <h2>Vedfyring i {k} i tall</h2>
    <div class="table-wrap"><table><tbody>
      <tr><th>Innbyggere (1.1.2026)</th><td>{nb(s['innbyggere'])}</td></tr>
      <tr><th>Husstander</th><td>{nb(s['husstander'])}</td></tr>
      <tr><th>Husstander i enebolig</th><td>{nb(s['enebolig'])} ({s['enebolig_pst']}&nbsp;%)</td></tr>
      <tr><th>Andel i småhus (enebolig, tomannsbolig, rekkehus)</th><td>{str(s['smahus_pst']).replace('.', ',')}&nbsp;%</td></tr>
      <tr><th>Fritidsboliger/hytter</th><td>{nb(s['hytter'])}</td></tr>
      <tr><th>Vedfyrende husstander (anslag)</th><td>ca. {nb(round(wood_hh, -2))}</td></tr>
      <tr><th>Ved brent i året (anslag)</th><td>ca. {nb(round(sacks, -4))} sekker à 40 liter</td></tr>
    </tbody></table></div>
    <p class="muted small">Kilder: SSB tabell 07459, 14917 og 05467. Anslagene bygger på at 51 % av husstandene i Akershus fyrer med ved, og at de i snitt brenner 655 kg i året (SSB 09703, 2025). I eneboliger har tre av fire vedovn, i blokkleiligheter rundt én av åtte (SSB 10568), så andelen er trolig høyere der det er mange eneboliger.</p>
    <p><strong>Feiing:</strong> {esc(feier)}. Les mer om <a href="/artikler/feiing-og-brannsikkerhet-follo/">feiing og brannsikkerhet i Follo</a>.<br>
    <strong>Luftkvalitet:</strong> Følg varselet på <a href="https://luftkvalitet.miljodirektoratet.no/" rel="noopener">luftkvalitet.miljodirektoratet.no</a> på kalde, stille dager. Se <a href="/artikler/vedfyring-og-luftkvalitet-i-follo/">vedfyring og luftkvalitet i Follo</a>.</p>
    <p>Se også <a href="/artikler/vedfyring-i-follo-tall-per-kommune/">vedfyring i Follo – tall for alle kommunene</a>.</p>
  </div>
</section>"""


def page_area(a):
    name = a["name"]
    items = [
        (f"Leverer dere ved i {name}?",
         f"Ja. Vi leverer tørr bjørkeved i hele {name} ({a['kommune']}), blant annet til {', '.join(a['places'])}. Postnummer {a['postnr']}."),
        (f"Hva koster ved levert i {name}?",
         f"En 40-liters sekk koster {P['price']} kr {P['vat_text']}. Skal vi bære veden inn, koster det 12–36 kr ekstra per bestilling. "
         f"10 sekker koster {kr(10 * P['price'])} uten bæring"
         + (f", pluss hjemlevering {kr(C.DELIVERY_FEE)} per bestilling." if C.DELIVERY_FEE else ".")),
        (f"Hvor raskt kan jeg få ved i {name}?",
         "Vi ringer deg, som regel innen én arbeidsdag etter at du har bestilt, og avtaler en leveringsdag som passer deg."),
    ] + faq_items()[2:5]
    path = f"/{a['slug']}/"
    title = f"Ved i {name} – tørr bjørkeved levert, {P['price']} kr/sekk | {C.BRAND}"
    desc = (f"Kjøp bjørkeved i {name}. Vi leverer på døra i {', '.join(a['places'][:4])}. "
            f"{P['price']} kr per 40 L sekk, og vi bærer veden inn. Bestill på nett eller ring {CO['phone_display']}.")
    ld = ld_tags(business_ld(), product_ld(), faq_ld(items), breadcrumb_ld(f"Ved i {name}", path))
    places = "".join(f"<li>{esc(p)}</li>" for p in a["places"])
    local = f"""
<section class="section">
  <div class="wrap narrow">
    <nav class="crumbs" aria-label="Brødsmuler"><a href="/">Bjørkeved i Follo</a> › Ved i {esc(name)}</nav>
    <h2>Vedlevering i {esc(name)}</h2>
    <p>{esc(a['intro'])} Vi kjører til hele {esc(a['kommune'])}, blant annet til:</p>
    <ul class="places">{places}</ul>
    <p class="muted">Postnummer: {esc(a['postnr'])}. Bor du like utenfor? Ring oss, så finner vi en løsning.</p>
  </div>
</section>"""
    local += local_stats(a)
    body = (hero(f"Bjørkeved levert i {esc(name)}",
                 f"Tørr bjørkeved i 40-liters sekker, kjørt hjem til deg i {esc(name)}. Vi kan bære veden helt inn. {P['price']} kr per sekk.")
            + local + order_form(name) + price_section() + steps_section()
            + faq_section(items) + areas_section(a["slug"]))
    return head(title, desc, path, ld) + body + footer()


def page_takk():
    body = f"""
<section class="section">
  <div class="wrap narrow center">
    <h1>Takk for bestillingen! 🔥</h1>
    <p class="lead">Vi har fått bestillingen din. Vi ringer deg, som regel innen én arbeidsdag, for å avtale levering.</p>
    <div id="takk-summary" class="card summary-card" hidden></div>
    <p>Har du spørsmål i mellomtiden? Ring <a href="tel:{CO['phone'].replace(' ', '')}">{CO['phone_display']}</a>.</p>
    <p><a class="btn" href="/">Tilbake til forsiden</a></p>
  </div>
</section>"""
    return head(f"Takk for bestillingen | {C.BRAND}", "Bestillingen er mottatt.", "/takk/", noindex=True) + body + footer()


def page_personvern():
    body = f"""
<section class="section">
  <div class="wrap narrow prose">
    <h1>Personvern</h1>
    <p>{esc(CO['legal_name'])} (org.nr. {CO['org_nr']}), {esc(CO['street'])}, {CO['postal_code']} {esc(CO['city'])}, er ansvarlig for personopplysningene som samles inn på denne nettsiden.</p>
    <h2>Hva vi samler inn</h2>
    <p>Når du bestiller, får vi navnet ditt, telefonnummeret, e-postadressen, leveringsadressen og det du skriver i meldingsfeltet. Vi bruker opplysningene bare til å behandle og levere bestillingen, og til å sende faktura. Rettslig grunnlag er avtale (GDPR art. 6 nr. 1 b).</p>
    <h2>Hvem som behandler opplysningene</h2>
    <p>Bestillingsskjemaet sendes videre til oss på e-post gjennom tjenesten FormSubmit (formsubmit.co). Vi selger ikke opplysningene dine og deler dem ikke med andre.</p>
    <h2>Hvor lenge vi lagrer dem</h2>
    <p>Vi sletter opplysningene når de ikke lenger trengs. Unntaket er det bokføringsloven krever at vi tar vare på, som er 5 år.</p>
    <h2>Informasjonskapsler (cookies)</h2>
    <p>Siden bruker ingen cookies. Vi teller besøk med GoatCounter, som ikke lagrer noe på enheten din og ikke samler personopplysninger. Vi ser bare hvilke sider som besøkes, hvor besøkende kommer fra og hvor mange som sender bestilling.</p>
    <h2>Dine rettigheter</h2>
    <p>Du kan be om å få se, rette eller slette opplysningene vi har om deg. Send en e-post til <a href="mailto:{CO['email']}">{CO['email']}</a>. Du kan også klage til <a href="https://www.datatilsynet.no/" rel="noopener">Datatilsynet</a>.</p>
  </div>
</section>"""
    return head(f"Personvern | {C.BRAND}", "Slik behandler vi personopplysninger.", "/personvern/") + body + footer()


def page_404():
    body = """
<section class="section"><div class="wrap narrow center">
<h1>Fant ikke siden</h1><p>Siden finnes ikke. Du kan fortsatt bestille ved fra forsiden.</p>
<p><a class="btn" href="/">Til forsiden</a></p></div></section>"""
    return head(f"Fant ikke siden | {C.BRAND}", "Siden finnes ikke.", "/404.html", noindex=True) + body + footer()


# ---------------------------------------------------------------- artikler

ARTICLES = AB.load()


def cta_block():
    fee = C.DELIVERY_FEE or 0
    return f"""<aside class="cta-box">
  <p class="cta-title">Tørr bjørkeved levert på døra i Follo</p>
  <p>{P['price']} kr per 40-liters sekk. Hjemlevering {kr(fee)} per bestilling. Vi bærer veden inn hvis du vil.
  Eksempel: 20 sekker = {kr(20 * P['price'] + fee)} levert.</p>
  <a class="btn" href="#bestill" data-track="article_cta">Regn ut pris og bestill</a>
</aside>"""


def calculator_block():
    return f"""<div class="calc card" id="vedkalkulator">
  <p class="cta-title">Vedkalkulator: hvor mange sekker trenger du?</p>
  <div class="row2">
    <div><label for="k-bruk">Hvor mye fyrer du?</label>
    <select id="k-bruk">
      <option value="0.6|1.5">Helgekos (1–2 kvelder i uka)</option>
      <option value="0.6|3.5" selected>Noen kvelder i uka (3–4)</option>
      <option value="0.6|6">Nesten hver kveld</option>
      <option value="0.8|7">Hovedoppvarming (hele døgnet)</option>
    </select></div>
    <div><label for="k-mnd">Hvor mange måneder?</label>
    <select id="k-mnd">
      <option value="3">3 måneder (des–feb)</option>
      <option value="5">5 måneder (nov–mar)</option>
      <option value="6" selected>6 måneder (okt–mar)</option>
      <option value="7">7 måneder (okt–apr)</option>
    </select></div>
  </div>
  <p class="calc-out" aria-live="polite">Du trenger ca. <strong id="k-sekker">–</strong> sekker. Levert pris: <strong id="k-pris">–</strong>.</p>
  <a class="btn" id="k-bestill" href="#bestill">Bestill dette antallet</a>
  <p class="muted small">Anslaget bygger på ca. 0,6 sekk per fyringskveld (1 sekk rekker 1–2 kvelder) og ca. 0,8 sekk per døgn når ovnen er hovedoppvarming. En gjennomsnittlig vedfyrende husstand i Akershus brenner ca. 47 sekker i året (SSB).</p>
</div>"""


def article_ld(a):
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": a["title"],
        "description": a["description"],
        "datePublished": a["date"],
        "dateModified": a["updated"],
        "inLanguage": "nb-NO",
        "mainEntityOfPage": f"{URL}/artikler/{a['slug']}/",
        "image": f"{URL}/img/og-bjorkeved-follo.jpg",
        "author": {"@type": "Organization", "name": CO["legal_name"], "url": f"{URL}/"},
        "publisher": {"@id": f"{URL}/#business"},
    }


def nb_date(iso):
    y, m, d = iso.split("-")
    months = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august",
              "september", "oktober", "november", "desember"]
    return f"{int(d)}. {months[int(m) - 1]} {y}"


def page_article(a):
    path = f"/artikler/{a['slug']}/"
    blocks = {"bestill": cta_block(), "kalkulator": calculator_block()}
    body_html = AB.markdown(a["body"], blocks)
    lds = [article_ld(a), business_ld(), breadcrumb_ld(a["title"], path)]
    if a["faq"]:
        lds.append(faq_ld(a["faq"]))
    kort = f'<aside class="callout kort"><p class="cta-title">Kort svar</p><p>{esc(a["kort"])}</p></aside>' if a.get("kort") else ""
    faq = ""
    if a["faq"]:
        faq = "<h2 id=\"sporsmal\">Spørsmål og svar</h2>" + "".join(
            f"<details><summary>{esc(q)}</summary><p>{esc(ans)}</p></details>" for q, ans in a["faq"])
    others = [x for x in ARTICLES if x["slug"] != a["slug"]][:4]
    rel = "".join(f'<li><a href="/artikler/{x["slug"]}/"><strong>{esc(x["title"])}</strong><span>{esc(x["description"][:90])}…</span></a></li>' for x in others)
    body = f"""
<article class="section">
  <div class="wrap narrow prose">
    <nav class="crumbs" aria-label="Brødsmuler"><a href="/">Bjørkeved i Follo</a> › <a href="/artikler/">Råd om ved</a></nav>
    <h1>{esc(a['title'])}</h1>
    <p class="meta muted small">Av {esc(CO['legal_name'])} · Oppdatert {nb_date(a['updated'])}</p>
    {kort}
    {body_html}
    {faq}
    {"" if "[[bestill]]" in a["body"] else cta_block()}
  </div>
</article>
<section class="section alt">
  <div class="wrap">
    <h2>Mer om ved</h2>
    <ul class="areas">{rel}</ul>
  </div>
</section>""" + order_form() + areas_section()
    title = f"{a['title']} | {C.BRAND}"
    return head(title, a["description"], path, ld_tags(*lds)) + body + footer()


def page_articles_index():
    items = "".join(
        f'<li><a href="/artikler/{a["slug"]}/"><strong>{esc(a["title"])}</strong><span>{esc(a["description"])}</span></a></li>'
        for a in ARTICLES)
    body = f"""
<section class="section">
  <div class="wrap">
    <nav class="crumbs" aria-label="Brødsmuler"><a href="/">Bjørkeved i Follo</a> › Råd om ved</nav>
    <h1>Råd om ved og vedfyring</h1>
    <p class="lead">Her får du svar på det folk i Follo lurer mest på om ved: hvor mye du trenger, hva det koster, hvordan du lagrer veden og hvordan du fyrer riktig. Svarene bygger på tall fra SSB, Miljødirektoratet og egen erfaring.</p>
    <ul class="areas articles">{items}</ul>
  </div>
</section>""" + order_form()
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": "Råd om ved og vedfyring",
          "hasPart": [{"@type": "Article", "headline": a["title"], "url": f"{URL}/artikler/{a['slug']}/"} for a in ARTICLES]}
    return head(f"Råd om ved: hvor mye, hvilken type og hvordan fyre | {C.BRAND}",
                "Guider om bjørkeved: hvor mange sekker du trenger, pris i Follo, lagring, tørr ved og riktig fyring.",
                "/artikler/", ld_tags(ld, breadcrumb_ld("Råd om ved", "/artikler/"))) + body + footer()


# ---------------------------------------------------------------- lenkemagneter (verktøy, data, presse)
# Sider som andre nettsteder, journalister og bloggere har grunn til å lenke til.

def js_cfg_fyre():
    s = C.STROM
    return {"zone": s["zone"], "supportThreshold": s["support_threshold"], "supportShare": s["support_share"],
            "norgesprisKr": s["norgespris_kr"], "markupKr": s["markup_kr"],
            "nettDayOre": s["nett_day_ore"], "nettNightOre": s["nett_night_ore"],
            "kwhPerKg": s["kwh_per_kg"], "efficiency": s["efficiency"], "cop": s["cop"],
            "noMvaZones": s["no_mva_zones"], "sackPrice": P["price"], "sackKg": P["kg"]}


def fmt_kr2(x):
    return f"{x:.2f}".replace(".", ",") + " kr"


def ved_kwh_price(eff=None):
    return P["price"] / (P["kg"] * C.STROM["kwh_per_kg"] * (eff or C.STROM["efficiency"]))


def hbar_svg(rows, unit="", label_w=190, title=""):
    """Liggende søylediagram i HTML (lesbart på mobil). rows: (etikett, verdi, uthev, verditekst)."""
    if not rows:
        return ""
    mx = max(r[1] for r in rows) or 1
    items = "".join(
        f'<li class="{"hi" if hi else ""}" title="{esc(lab)}: {esc(txt)}"><span class="lab">{esc(lab)}</span>'
        f'<span class="track"><span class="fill" style="width:{max(1, 100 * val / mx):.1f}%"></span>'
        f'<span class="val">{esc(txt)}</span></span></li>'
        for lab, val, hi, txt in rows)
    return f'<ul class="hbar" role="list" aria-label="{esc(title)}" style="--lw:{label_w}px">{items}</ul>'


def fyre_widget_markup(compact=False):
    s = C.STROM
    zones = "".join(f'<option value="NO{i}"{" selected" if f"NO{i}" == s["zone"] else ""}>NO{i} – {n}</option>'
                    for i, n in ((1, "Øst-Norge"), (2, "Sør-Norge"), (3, "Midt-Norge"), (4, "Nord-Norge"), (5, "Vest-Norge")))
    settings = f"""
  <div class="fyre-set">
    <div><label for="fz">Prisområde</label><select id="fz">{zones}</select></div>
    <div><label for="favtale">Strømavtale</label><select id="favtale"><option value="spot">Spotpris med strømstøtte</option><option value="norgespris">Norgespris</option><option value="spot-uten">Spotpris uten strømstøtte (f.eks. hytte)</option></select></div>
    <div><label for="fovn">Ovn</label><select id="fovn"><option value="{s['efficiency']}">Ny, rentbrennende ovn</option><option value="0.5">Gammel ovn (før 1998)</option></select></div>
    <div><label for="fved">Pris per 40 L sekk (kr)</label><input id="fved" inputmode="decimal" value="{P['price']}"></div>
    <div><label for="fnett">Nettleie dag, øre/kWh</label><input id="fnett" inputmode="decimal" value="{str(s['nett_day_ore']).replace('.', ',')}"></div>
    <div><label for="fnatt">Nettleie natt/helg, øre/kWh</label><input id="fnatt" inputmode="decimal" value="{str(s['nett_night_ore']).replace('.', ',')}"></div>
  </div>"""
    return f"""<div id="fyre" class="fyre{' compact' if compact else ''}">
  <p id="fsvar" class="fyre-svar" aria-live="polite">Henter dagens strømpris …</p>
  <div class="fyre-tall">
    <div><span>Strøm nå, per kWh</span><strong id="fel">–</strong></div>
    <div><span>Varme fra ved, per kWh</span><strong id="fvedkwh">{fmt_kr2(ved_kwh_price())}</strong></div>
    <div><span>Varmepumpe nå, per kWh</span><strong id="fvp">–</strong></div>
    <div><span>Strøm, snitt i dag</span><strong id="fsnitt">–</strong></div>
  </div>
  <p id="finfo" class="muted small"></p>
  <p id="fbe" class="muted small"></p>
  {'' if compact else '<div id="fchart" class="fyre-chart"></div><p class="legend small"><span><span class="sw hot"></span>Strøm dyrere enn ved</span><span><span class="sw"></span>Strøm billigere enn ved</span><span><span class="sw line"></span>Ved</span></p>'}
  {settings}
  <p class="muted small"><span id="fstatus"></span> · Strømpriser levert av <a href="https://www.hvakosterstrommen.no" rel="noopener" target="_blank">Hva koster strømmen.no</a></p>
</div>"""


def kr_be(stotte):
    """Spotpris inkl. mva der ved og strøm koster det samme på dagtid (NO1, Elvia)."""
    s = C.STROM
    rest = (ved_kwh_price() - s["nett_day_ore"] / 100) / 1.25 - s["markup_kr"]
    spot = (rest - s["support_share"] * s["support_threshold"]) / (1 - s["support_share"]) if stotte else rest
    return fmt_kr2(spot * 1.25)


def page_fyre():
    s = C.STROM
    path = "/fyre-i-dag/"
    title = f"Lønner det seg å fyre med ved i dag? Strøm mot ved, time for time | {C.BRAND}"
    desc = "Se om ved eller strøm er billigst akkurat nå. Dagens strømpris time for time med nettleie, avgifter og strømstøtte, sammenlignet med varme fra ved."
    items = [
        ("Er ved billigere enn strøm i dag?",
         f"Det kommer an på strømprisen time for time. Med en sekk til {P['price']} kr og en ny ovn koster varme fra ved ca. {fmt_kr2(ved_kwh_price())} per kWh. "
         "Når strømprisen med nettleie og avgifter er høyere enn det, er ved billigst. Siden viser svaret for i dag."),
        ("Hvordan regner dere ut hva varmen fra ved koster?",
         f"En 40-liters sekk bjørk veier ca. {P['kg']} kg. Ved gir ca. {str(s['kwh_per_kg']).replace('.', ',')} kWh per kg (NIBIO), og en ny ovn utnytter ca. {round(s['efficiency'] * 100)} prosent. "
         f"{P['price']} kr delt på {P['kg']} × {str(s['kwh_per_kg']).replace('.', ',')} × {str(s['efficiency']).replace('.', ',')} gir {fmt_kr2(ved_kwh_price())} per kWh. I en gammel ovn blir det ca. {fmt_kr2(ved_kwh_price(0.5))}."),
        ("Hva med strømstøtten og Norgespris?",
         f"Med spotpris trekker vi fra strømstøtten: staten dekker {round(s['support_share'] * 100)} prosent av prisen over {round(s['support_threshold'] * 100)} øre per kWh eks. mva. "
         f"Har du Norgespris, betaler du fast {round(s['norgespris_kr'] * 100)} øre per kWh inkl. mva, pluss nettleie. Velg avtalen din i innstillingene."),
        ("Kan jeg vise dette på min egen nettside?",
         "Ja, gratis. Kopier koden på siden «Gratis verktøy», så får du en liten boks som viser dagens svar."),
    ]
    ld = ld_tags(faq_ld(items), breadcrumb_ld("Lønner det seg å fyre i dag?", path), {
        "@context": "https://schema.org", "@type": "WebApplication", "name": "Lønner det seg å fyre med ved i dag?",
        "url": f"{URL}{path}", "applicationCategory": "UtilitiesApplication", "operatingSystem": "Alle",
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "NOK"}, "publisher": {"@id": f"{URL}/#business"}})
    faq = "".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in items)
    body = f"""
<section class="section">
  <div class="wrap narrow prose">
    <nav class="crumbs" aria-label="Brødsmuler"><a href="/">Bjørkeved i Follo</a> › Lønner det seg å fyre i dag?</nav>
    <h1>Lønner det seg å fyre med ved i dag?</h1>
    <p class="lead">Vi henter dagens strømpris og legger til nettleie, avgifter og strømstøtte. Så sammenligner vi med hva varmen fra en sekk ved koster. Svaret oppdateres hver time.</p>
    {fyre_widget_markup()}
    <details class="card-details"><summary>Se tallene time for time</summary>
      <div class="table-wrap"><table><thead><tr><th>Tid</th><th>Spotpris inkl. mva</th><th>Strøm totalt</th><th>Billigst</th></tr></thead><tbody id="ftable"></tbody></table></div>
    </details>
    <h2>Så lønner det seg nesten aldri?</h2>
    <p>For de fleste: nei, ikke med ved kjøpt i 40-liters sekk. Med strømstøtte betaler du bare 10 prosent av spotprisen over {round(s['support_threshold'] * 100)} øre. Da må spotprisen opp i ca. {kr_be(True)} per kWh inkl. mva før ved blir billigst på dagtid. <strong>Uten strømstøtte</strong>, for eksempel på hytta, snur det allerede ved ca. {kr_be(False)}. Med Norgespris koster strøm {fmt_kr2(s['norgespris_kr'] + s['nett_day_ore'] / 100)} per kWh på dagtid, og da er strøm alltid billigst.</p>
    <p>Ved lønner seg likevel når du hugger selv eller kjøper storsekk, når strømmen går, når du vil avlaste strømmen på de kaldeste dagene, og for hyggen. Skriv inn din pris per 40 liter i innstillingene, så ser du hva det betyr.</p>
    <h2>Slik regner vi</h2>
    <ul>
      <li><strong>Strøm:</strong> spotpris fra Nord Pool (via hvakosterstrommen.no) + mva, minus strømstøtte time for time ({round(s['support_share'] * 100)} % av prisen over {round(s['support_threshold'] * 100)} øre eks. mva, <a href="https://www.nve.no/reguleringsmyndigheten/kunde/stroem/dette-er-stroemstoetteordningen/" rel="noopener">NVE</a>), pluss nettleie. Standard er energileddet hos Elvia fra 1. juli 2026, med elavgift, Enova-avgift og mva: {str(s['nett_day_ore']).replace('.', ',')} øre på hverdager kl. 06–22 og {str(s['nett_night_ore']).replace('.', ',')} øre ellers (<a href="https://www.elvia.no/nettleie/alt-om-nettleiepriser/ny-pris-for-privatkunder-fra-1.-juli-2026" rel="noopener">Elvia</a>). Har du et annet nettselskap, skriver du inn dine priser. Påslaget i strømavtalen er ikke tatt med. Nord-Norge (NO4) er regnet uten mva.</li>
      <li><strong>Norgespris:</strong> fast {round(s['norgespris_kr'] * 100)} øre per kWh inkl. mva ut 2026, pluss nettleie. Hytter får ikke strømstøtte, så velg «uten strømstøtte» der.</li>
      <li><strong>Ved:</strong> sekkpris / ({P['kg']} kg × {str(s['kwh_per_kg']).replace('.', ',')} kWh/kg × virkningsgrad). Energiinnholdet er fra <a href="https://www.nibio.no/tema/skog/bruk-av-tre/bioenergi/fyringsved" rel="noopener">NIBIO</a> (tørr ved, 20 % fuktighet). Virkningsgraden er {round(s['efficiency'] * 100)} % i en ny ovn og 50 % i en gammel. Levering er ikke tatt med. Fordelt på 20 sekker legger levering til ca. {fmt_kr2((C.DELIVERY_FEE or 0) / 20 / (P['kg'] * s['kwh_per_kg'] * s['efficiency']))} per kWh.</li>
      <li><strong>Varmepumpe:</strong> strømprisen delt på {s['cop']}, som Norsk Varmepumpeforening regner som realistisk årsvarmefaktor for luft-til-luft.</li>
      <li>Kapasitetsleddet i nettleien (fast beløp per måned) er ikke med, fordi det ikke endres av at du fyrer litt mer eller mindre.</li>
    </ul>
    <p>Vil du ha hele regnestykket for året? Les <a href="/artikler/ved-eller-strom/">Er ved billigere enn strøm i 2026?</a></p>
    <aside class="callout"><p><strong>Vil du vise dette på din nettside?</strong> Den er gratis å bygge inn. <a href="/verktoy/">Hent koden her</a>.</p></aside>
    <h2 id="sporsmal">Spørsmål og svar</h2>
    {faq}
    {cta_block()}
  </div>
</section>""" + order_form()
    script = f'<script>window.FYRE={json.dumps(js_cfg_fyre())};</script><script src="/assets/fyre.js" defer></script>'
    return head(title, desc, path, ld) + body + footer().replace("</body>", script + "\n</body>")


WIDGET_CSS = """body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:15px;line-height:1.45;color:#1d231f;background:#fff}
.w{border:1px solid #e2dccd;border-radius:12px;padding:14px 16px;max-width:560px}
h2{font-size:1.05rem;margin:0 0 8px;color:#1f3a2b}
label{display:block;font-weight:600;font-size:.85rem;margin:6px 0 3px}
select,input{width:100%;box-sizing:border-box;font:inherit;padding:.45em .6em;border:1.5px solid #cfc8b6;border-radius:8px;background:#fff}
.row2,.fyre-set{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.out{font-size:1.05rem;margin:10px 0 6px}.muted{color:#5b6259}.small{font-size:.8rem}
a{color:#2e5a41}.fyre-svar{font-weight:800;font-size:1.05rem;margin:0 0 8px}.fyre-svar.ja{color:#8a4a0e}.fyre-svar.nei{color:#1f3a2b}
.fyre-tall{display:grid;grid-template-columns:1fr 1fr;gap:6px}.fyre-tall div{background:#f6f3ea;border-radius:8px;padding:6px 8px}
.fyre-tall span{display:block;font-size:.75rem;color:#5b6259}.fyre-tall strong{font-size:1.05rem}
.fyre-set{margin-top:8px}.fyre-set div:nth-child(n+3){display:none}#fbe{display:none}
#finfo{margin:6px 0 0}
.credit{margin:8px 0 0;font-size:.8rem}
@media(prefers-color-scheme:dark){body{background:#16211b;color:#e8ede9}.w{border-color:#34443a}select,input{background:#1f2c24;color:#e8ede9;border-color:#44564a}
.fyre-tall div{background:#1f2c24}.fyre-tall span,.muted{color:#aab6ad}a{color:#9fd4b0}h2{color:#cfe6d6}.fyre-svar.nei{color:#9fd4b0}.fyre-svar.ja{color:#f0b070}}"""


def widget_page(title, inner, script):
    return f"""<!doctype html>
<html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>{esc(title)}</title>
<style>{WIDGET_CSS}</style></head>
<body><div class="w">{inner}</div>{script}</body></html>
"""


def widget_kalkulator():
    fee = C.DELIVERY_FEE or 0
    inner = f"""<h2>Hvor mye ved trenger du?</h2>
<div class="row2">
  <div><label for="k-bruk">Hvor mye fyrer du?</label>
  <select id="k-bruk">
    <option value="0.6|1.5">Helgekos (1–2 kvelder i uka)</option>
    <option value="0.6|3.5" selected>Noen kvelder i uka (3–4)</option>
    <option value="0.6|6">Nesten hver kveld</option>
    <option value="0.8|7">Hovedoppvarming</option>
  </select></div>
  <div><label for="k-mnd">Hvor mange måneder?</label>
  <select id="k-mnd">
    <option value="3">3 (des–feb)</option><option value="5">5 (nov–mar)</option>
    <option value="6" selected>6 (okt–mar)</option><option value="7">7 (okt–apr)</option>
  </select></div>
</div>
<p class="out">Du trenger ca. <strong id="k-sekker">–</strong> sekker à 40 liter (<span id="k-kg">–</span> kg ved).</p>
<p class="muted small">Bor du i Follo? Levert fra oss: <strong id="k-pris">–</strong>.</p>
<p class="credit">Vedkalkulator fra <a href="{URL}/artikler/hvor-mye-ved-trenger-jeg/" target="_blank" rel="noopener">{esc(C.BRAND)}</a></p>"""
    script = f"""<script>(function(){{var b=document.getElementById("k-bruk"),m=document.getElementById("k-mnd");
function c(){{var p=b.value.split("|"),n=Math.max(5,Math.round(+p[0]*+p[1]*(+m.value)*4.33));
document.getElementById("k-sekker").textContent=n;document.getElementById("k-kg").textContent=(n*{P['kg']}).toLocaleString("nb-NO");
document.getElementById("k-pris").textContent=(n*{P['price']}+{fee}).toLocaleString("nb-NO")+" kr";}}
b.addEventListener("change",c);m.addEventListener("change",c);c();}})();</script>"""
    return widget_page("Vedkalkulator", inner, script)


def widget_fyre():
    inner = "<h2>Lønner det seg å fyre med ved i dag?</h2>" + fyre_widget_markup(compact=True) + \
        f'<p class="credit">Tjeneste fra <a href="{URL}/fyre-i-dag/" target="_blank" rel="noopener">{esc(C.BRAND)}</a></p>'
    script = f'<script>window.FYRE={json.dumps(js_cfg_fyre())};</script><script src="/assets/fyre.js" defer></script>'
    return widget_page("Lønner det seg å fyre i dag?", inner, script)


def embed_code(path, title, height, credit_path, credit_text):
    code = (f'<iframe src="{URL}{path}" title="{title}" width="100%" height="{height}" '
            f'style="border:0;max-width:560px" loading="lazy"></iframe>\n'
            f'<p style="font-size:13px">{credit_text} <a href="{URL}{credit_path}">{C.BRAND}</a></p>')
    return f'<textarea class="embed" readonly rows="4" onclick="this.select()">{esc(code)}</textarea>'


def page_verktoy():
    path = "/verktoy/"
    body = f"""
<section class="section">
  <div class="wrap narrow prose">
    <nav class="crumbs" aria-label="Brødsmuler"><a href="/">Bjørkeved i Follo</a> › Gratis verktøy</nav>
    <h1>Gratis vedverktøy til din nettside</h1>
    <p class="lead">Har du en blogg, en hytteside, en velforening eller en nettbutikk for ovner? Legg inn verktøyene under gratis. Kopier koden og lim den inn der du vil ha dem. De tilpasser seg mobil og mørk modus.</p>

    <h2>1. Vedkalkulator: hvor mange sekker trenger du?</h2>
    <p>Regner ut hvor mange 40-liters sekker en husstand trenger, ut fra hvor ofte de fyrer. Tallene bygger på SSB.</p>
    <iframe src="/widget/vedkalkulator/" title="Vedkalkulator" width="100%" height="300" style="border:0;max-width:560px" loading="lazy"></iframe>
    <p><strong>Kode:</strong></p>
    {embed_code("/widget/vedkalkulator/", "Vedkalkulator", 300, "/artikler/hvor-mye-ved-trenger-jeg/", "Vedkalkulator fra")}

    <h2>2. Lønner det seg å fyre med ved i dag?</h2>
    <p>Henter dagens strømpris for hele Norge (NO1–NO5) og viser om ved eller strøm er billigst akkurat nå. Oppdateres av seg selv.</p>
    <iframe src="/widget/fyre-i-dag/" title="Lønner det seg å fyre i dag?" width="100%" height="460" style="border:0;max-width:560px" loading="lazy"></iframe>
    <p><strong>Kode:</strong></p>
    {embed_code("/widget/fyre-i-dag/", "Lønner det seg å fyre i dag?", 460, "/fyre-i-dag/", "Strøm mot ved fra")}

    <h2>Vilkår</h2>
    <ul>
      <li>Gratis for alle, også kommersielle nettsider.</li>
      <li>Behold lenken under verktøyet. Den er det eneste vi ber om.</li>
      <li>Vil du ha verktøyet tilpasset (farger, en annen vedpris, ditt område)? Send en e-post til <a href="mailto:{CO['email']}">{CO['email']}</a>.</li>
    </ul>
    <p>Se også {'<a href="/vedpris/">' + C.VEDPRIS['name'] + '</a>, ' if VEDPRISER else ''}<a href="/data/">åpne data om vedfyring</a> og <a href="/presse/">presse og bilder</a>.</p>
  </div>
</section>"""
    return head(f"Gratis vedkalkulator og strøm-mot-ved-verktøy til din nettside | {C.BRAND}",
                "Legg inn en gratis vedkalkulator eller «Lønner det seg å fyre i dag?» på din nettside. Kopier koden. Tilpasser seg mobil.",
                path, ld_tags(breadcrumb_ld("Gratis verktøy", path))) + body + footer()


# ---- åpne data

def kommune_rows():
    rows = []
    for k, s in C.KOMMUNE_STATS.items():
        wood = s["husstander"] * C.WOOD_SHARE
        rows.append({"kommune": k.replace(" kommune", ""), "innbyggere": s["innbyggere"], "husstander": s["husstander"],
                     "husstander_enebolig": s["enebolig"], "andel_enebolig_pst": s["enebolig_pst"],
                     "andel_smahus_pst": s["smahus_pst"], "fritidsbygg": s["hytter"],
                     "vedfyrende_husstander_anslag": round(wood, -2),
                     "vedsekker_per_ar_anslag": round(wood * C.KG_PER_HOUSEHOLD / P["kg"], -3)})
    return rows


def to_csv(rows, cols):
    def cell(v):
        v = str(v)
        return f'"{v}"' if any(c in v for c in ',"\n') else v
    return "\n".join([",".join(cols)] + [",".join(cell(r.get(c, "")) for c in cols) for r in rows]) + "\n"


KOMMUNE_COLS = ["kommune", "innbyggere", "husstander", "husstander_enebolig", "andel_enebolig_pst", "andel_smahus_pst",
                "fritidsbygg", "vedfyrende_husstander_anslag", "vedsekker_per_ar_anslag"]


def page_data():
    path = "/data/"
    rows = kommune_rows()
    chart = hbar_svg(sorted([(r["kommune"], r["vedsekker_per_ar_anslag"], False, f"ca. {nb(r['vedsekker_per_ar_anslag'])} sekker")
                             for r in rows], key=lambda x: -x[1]), label_w=120, title="Vedsekker brent per år per kommune i Follo (anslag)")
    chart2 = hbar_svg(sorted([(r["kommune"], r["andel_enebolig_pst"], False, f"{r['andel_enebolig_pst']} %")
                              for r in rows], key=lambda x: -x[1]), label_w=120, title="Andel husstander i enebolig")
    def cell(c, v):
        if c == "andel_smahus_pst":
            return str(v).replace(".", ",") + "&nbsp;%"
        if c == "andel_enebolig_pst":
            return f"{v}&nbsp;%"
        return ("ca. " if c.endswith("anslag") else "") + nb(v) if isinstance(v, (int, float)) else esc(str(v))
    trs = "".join("<tr>" + "".join(f"<td>{cell(c, r[c])}</td>" for c in KOMMUNE_COLS) + "</tr>" for r in rows)
    heads = ["Kommune", "Innbyggere", "Husstander", "I enebolig", "Andel enebolig", "Andel småhus", "Hytter",
             "Vedfyrende husstander*", "Vedsekker i året*"]
    ths = "".join(f"<th>{h}</th>" for h in heads)
    vp = ""
    if VEDPRISER:
        vp = f'<li><a href="/data/{C.VEDPRIS["csv"]}" download>{C.VEDPRIS["csv"]}</a> – {C.VEDPRIS["name"]} {C.VEDPRIS["year"]}: {len(VEDPRISER)} priser fra selgere i hele Norge, med kilde-URL. Se <a href="/vedpris/">{C.VEDPRIS["name"]}</a>.</li>'
    ld = {"@context": "https://schema.org", "@type": "Dataset", "name": "Vedfyring i Follo per kommune",
          "description": "Innbyggere, husstander, eneboliger, hytter og anslått vedforbruk for kommunene i Follo. Bygger på SSB.",
          "url": f"{URL}{path}", "license": "https://creativecommons.org/licenses/by/4.0/deed.no",
          "creator": {"@id": f"{URL}/#business"}, "isAccessibleForFree": True, "inLanguage": "nb-NO",
          "spatialCoverage": "Follo, Akershus, Norge", "dateModified": TODAY,
          "distribution": [{"@type": "DataDownload", "encodingFormat": "text/csv",
                            "contentUrl": f"{URL}/data/vedfyring-follo-kommuner.csv"}]}
    body = f"""
<section class="section">
  <div class="wrap narrow prose">
    <nav class="crumbs" aria-label="Brødsmuler"><a href="/">Bjørkeved i Follo</a> › Åpne data</nav>
    <h1>Åpne data om ved og vedfyring</h1>
    <p class="lead">Her kan du laste ned tallene vi har samlet om vedfyring og vedpriser. Bruk dem fritt i artikler, skoleoppgaver, rapporter og på nettsider, så lenge du oppgir kilden.</p>
    <h2>Last ned</h2>
    <ul>
      <li><a href="/data/vedfyring-follo-kommuner.csv" download>vedfyring-follo-kommuner.csv</a> – innbyggere, husstander, eneboliger, hytter og anslått vedforbruk for de seks kommunene i Follo.</li>
      {vp}
    </ul>
    <aside class="callout"><p><strong>Lisens: CC BY 4.0.</strong> Du kan bruke, endre og dele dataene, også kommersielt. Oppgi kilden slik: <em>Kilde: {esc(C.BRAND)} (follobjorkeved.no), basert på SSB</em>, gjerne med lenke til <a href="{URL}/data/">{URL.replace('https://', '')}/data/</a>.</p></aside>
    <h2>Hvor mye ved brennes i hver kommune?</h2>
    <p>Anslått antall 40-liters sekker per år. Nordre Follo har flest innbyggere og bruker mest ved totalt.</p>
    <figure class="chart">{chart}<figcaption class="muted small">Anslag: husstander × 51 % som fyrer med ved × 655 kg per år (SSB 09703, Akershus 2025), delt på {P['kg']} kg per sekk.</figcaption></figure>
    <h2>Andel som bor i enebolig</h2>
    <p>I eneboliger har tre av fire vedovn, i blokkleiligheter rundt én av åtte (SSB 10568). Kommuner med mange eneboliger fyrer derfor trolig mer enn snittet.</p>
    <figure class="chart">{chart2}<figcaption class="muted small">Kilde: SSB tabell 14917 (2025).</figcaption></figure>
    <h2>Tabell</h2>
    <div class="table-wrap"><table><thead><tr>{ths}</tr></thead><tbody>{trs}</tbody></table></div>
    <p class="muted small">* Anslag. Kolonnenavnene i CSV-filen er uten æøå. Kilder: SSB tabell 07459 (innbyggere 1.1.2026), 14917 (husstander 2025), 05467 (fritidsbygg 2026) og 09703 (vedforbruk 2025). Mer forklaring i artikkelen <a href="/artikler/vedfyring-i-follo-tall-per-kommune/">Vedfyring i Follo – tall for alle kommunene</a>.</p>
  </div>
</section>"""
    return head(f"Åpne data: vedfyring og vedpriser (CSV, CC BY) | {C.BRAND}",
                "Last ned tall om vedfyring per kommune i Follo og vedpriser i Norge som CSV. Fri bruk med kildehenvisning (CC BY 4.0).",
                path, ld_tags(ld, breadcrumb_ld("Åpne data", path))) + body + footer()


# ---- presse

def page_presse():
    path = "/presse/"
    imgs = [("bjorkeved-levering-follo-1536.jpg", "Levering av bjørkeved i sekker fra varebil", "1536 × 1024"),
            ("og-bjorkeved-follo.jpg", "Bjørkeved i sekk, liggende format", "1200 × 630")]
    figs = "".join(
        f'<figure class="press-img"><img src="/img/{f}" alt="{esc(alt)}" loading="lazy" width="768" height="512">'
        f'<figcaption>{esc(alt)} ({dim}) · <a href="/img/{f}" download>Last ned</a></figcaption></figure>' for f, alt, dim in imgs)
    tel = CO["phone"].replace(" ", "")
    idx = f'<li><a href="/vedpris/">{C.VEDPRIS["name"]} {C.VEDPRIS["year"]}</a>: hva en sekk ved koster rundt i Norge, med kilde for hver pris.</li>' if VEDPRISER else ""
    body = f"""
<section class="section">
  <div class="wrap narrow prose">
    <nav class="crumbs" aria-label="Brødsmuler"><a href="/">Bjørkeved i Follo</a> › Presse</nav>
    <h1>Presse: tall, bilder og kilder om ved</h1>
    <p class="lead">Skriver du om vedpriser, strømpris, vedfyring eller luftkvalitet? Her finner du tall du kan bruke, bilder med fri bruk og noen som kan svare på spørsmål om ved.</p>
    <h2>Tall og verktøy du kan bruke</h2>
    <ul>
      {idx}
      <li><a href="/fyre-i-dag/">Lønner det seg å fyre i dag?</a>: dagens strømpris mot ved, for alle prisområder, oppdatert hver time.</li>
      <li><a href="/data/">Åpne data</a>: vedfyring per kommune i Follo (CSV).</li>
      <li><a href="/artikler/ved-eller-strom/">Er ved billigere enn strøm i 2026?</a>: hele regnestykket med kilder.</li>
      <li><a href="/artikler/vedfyring-og-luftkvalitet-i-follo/">Vedfyring og luftkvalitet i Follo</a>.</li>
    </ul>
    <h2>Fakta om oss</h2>
    <ul>
      <li>{esc(C.BRAND)} selger tørr bjørkeved i 40-liters sekker og leverer i hele Follo.</li>
      <li>Drives av {esc(CO['legal_name'])} (org.nr. {CO['org_nr']}) i {esc(CO['city'])}, som også driver med vaktmester-, vinter- og hagetjenester.</li>
      <li>Pris: {P['price']} kr per sekk {esc(P['vat_text'])}, hjemlevering {kr(C.DELIVERY_FEE or 0)}.</li>
    </ul>
    <h2>Bilder med fri bruk</h2>
    <p>Bildene kan brukes gratis i redaksjonelt innhold og på nettsider. Krediter slik: <em>Foto: {esc(C.BRAND)}</em>, gjerne med lenke til follobjorkeved.no.</p>
    <div class="press-grid">{figs}</div>
    <h2>Kontakt</h2>
    <p>Vi svarer gjerne på spørsmål om vedpriser, hvor mye ved folk kjøper, tørr ved og riktig fyring. Ring <a href="tel:{tel}">{CO['phone_display']}</a> eller send e-post til <a href="mailto:{CO['email']}">{CO['email']}</a>.</p>
  </div>
</section>"""
    return head(f"Presse: vedpriser, tall og bilder med fri bruk | {C.BRAND}",
                "Tall om vedpriser og vedfyring, bilder av bjørkeved med fri bruk og kontakt for journalister.",
                path, ld_tags(breadcrumb_ld("Presse", path))) + body + footer()


# ---- vedprisindeksen

def load_vedpriser():
    import csv
    f = SRC / "data" / C.VEDPRIS["csv"]
    if not f.exists():
        return []
    rows = []
    with f.open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            try:
                r["liter"] = float(r["liter"])
                r["pris_kr"] = float(r["pris_kr"])
            except (ValueError, KeyError):
                continue
            r["per40"] = r["pris_kr"] / r["liter"] * 40
            rows.append(r)
    return rows


VEDPRISER = load_vedpriser()


def median(xs):
    xs = sorted(xs)
    n = len(xs)
    if not n:
        return 0
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def kr0(x):
    return f"{round(x):,}".replace(",", " ") + " kr"


KAT_NAVN = {"kjede": "Byggevare- og butikkjeder (henter selv)", "lokal": "Lokale vedselgere (før levering)",
            "storsekk": "Storsekk (1000–1500 L)"}


def vedpris_stats():
    out = {}
    for k in KAT_NAVN:
        rs = [r for r in VEDPRISER if r["kategori"] == k]
        if rs:
            out[k] = {"n": len(rs), "median40": median([r["per40"] for r in rs]),
                      "min": min(rs, key=lambda r: r["per40"]), "max": max(rs, key=lambda r: r["per40"])}
    return out


def page_vedpris():
    V = C.VEDPRIS
    path = "/vedpris/"
    st = vedpris_stats()
    small = [r for r in VEDPRISER if r["kategori"] != "storsekk"]
    alle = median([r["per40"] for r in small]) if small else 0
    tiles = "".join(
        f'<div class="stat"><span>{esc(KAT_NAVN[k])}</span><strong>{kr0(v["median40"])}</strong>'
        f'<small>median per 40 liter · {v["n"]} priser</small></div>' for k, v in st.items())
    bars = hbar_svg(sorted([(f'{r["selger"]} ({r["sted"]})' if r["sted"] else r["selger"], r["per40"],
                             r["selger"].startswith(C.BRAND), f'{kr0(r["per40"])}')
                            for r in small], key=lambda x: x[1]),
                    label_w=260, title="Pris per 40 liter ved hos norske selgere")
    def row(r):
        lev = r.get("levering_kr") or ""
        lev = kr0(float(lev)) if lev.replace(".", "").isdigit() else esc(lev or "–")
        return (f'<tr><td><a href="{esc(r["kilde_url"])}" rel="noopener nofollow">{esc(r["selger"])}</a></td>'
                f'<td>{esc(r["sted"])}</td><td>{esc(r["produkt"])}</td><td>{nb(r["liter"])} L</td>'
                f'<td>{kr0(r["pris_kr"])}</td><td><strong>{kr0(r["per40"])}</strong></td><td>{lev}</td>'
                f'<td class="small">{esc(r.get("notat", ""))}</td></tr>')
    trs = "".join(
        f'<tr class="grp"><th colspan="8">{esc(navn)}</th></tr>'
        + "".join(row(r) for r in sorted((r for r in VEDPRISER if r["kategori"] == k), key=lambda r: r["per40"]))
        for k, navn in KAT_NAVN.items())
    funn = "".join(f"<li>{inline_md(x)}</li>" for x in V.get("funn", []))
    kilde = f'Kilde: {V["name"]} {V["year"]}, {C.BRAND} (follobjorkeved.no/vedpris/)'
    cite = esc(f'<a href="{URL}{path}">{V["name"]} {V["year"]}</a> fra {C.BRAND}')
    items = [(f"Hva koster en sekk ved i {V['year']}?",
              f"Medianprisen for en 40-liters sekk ved var {kr0(alle)} i vår gjennomgang av {len(small)} priser høsten {V['year']}. "
              + " ".join(f"{KAT_NAVN[k]}: {kr0(v['median40'])}." for k, v in st.items())),
             ("Hvordan er prisene samlet inn?",
              f"Vi har lest av prisene på selgernes egne nettsider {nb_date(V['collected'])}. Alle priser er inkl. mva. For å kunne sammenligne regner vi om til pris per 40 liter. Hver pris har lenke til kilden.")]
    ld = ld_tags(faq_ld(items), breadcrumb_ld(f"{V['name']} {V['year']}", path), {
        "@context": "https://schema.org", "@type": "Dataset", "name": f"{V['name']} {V['year']}",
        "description": f"Priser på ved hos {len(VEDPRISER)} norske selgere, samlet inn {V['collected']}.",
        "url": f"{URL}{path}", "license": "https://creativecommons.org/licenses/by/4.0/deed.no",
        "creator": {"@id": f"{URL}/#business"}, "isAccessibleForFree": True, "temporalCoverage": V["collected"],
        "spatialCoverage": "Norge", "distribution": [{"@type": "DataDownload", "encodingFormat": "text/csv",
                                                       "contentUrl": f"{URL}/data/{V['csv']}"}]})
    faq = "".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in items)
    body = f"""
<section class="section">
  <div class="wrap narrow prose wide-table">
    <nav class="crumbs" aria-label="Brødsmuler"><a href="/">Bjørkeved i Follo</a> › {V['name']} {V['year']}</nav>
    <h1>{V['name']} {V['year']}: dette koster ved i Norge</h1>
    <p class="meta muted small">Av {esc(CO['legal_name'])} · Prisene er samlet inn {nb_date(V['collected'])}</p>
    <aside class="callout kort"><p class="cta-title">Kort svar</p><p>En 40-liters sekk ved kostet {kr0(alle)} i median høsten {V['year']}, målt over {len(small)} priser hos kjeder og lokale selgere i hele Norge. Levering kommer ofte i tillegg.</p></aside>
    <div class="stats">{tiles}</div>
    {'<h2>Det viktigste</h2><ul>' + funn + '</ul>' if funn else ''}
    <h2>Pris per 40 liter hos hver selger</h2>
    <p>Alle priser er regnet om til 40 liter, slik at store og små sekker kan sammenlignes. Levering er ikke med.</p>
    <figure class="chart">{bars}<figcaption class="muted small">Pris inkl. mva, omregnet til 40 liter. Kilde: selgernes nettsider {nb_date(V['collected'])}.</figcaption></figure>
    <h2>Alle prisene</h2>
    <div class="table-wrap"><table><thead><tr><th>Selger</th><th>Sted</th><th>Produkt</th><th>Størrelse</th><th>Pris</th><th>Per 40 L</th><th>Levering</th><th>Merknad</th></tr></thead><tbody>{trs}</tbody></table></div>
    <p><a class="btn btn-ghost" href="/data/{V['csv']}" download>Last ned alle prisene (CSV)</a></p>
    <h2>Slik har vi gjort det</h2>
    <ul>
      <li>Prisene er lest av på selgernes egne nettsider {nb_date(V['collected'])}. Klikk på selgeren i tabellen for å se kilden.</li>
      <li>Alle priser er inkl. mva. Tilbud og mengderabatter er merket.</li>
      <li>Vi har regnet om til pris per 40 liter. Tresort og fuktighet varierer, så sammenlign også kvaliteten.</li>
      <li>Vi selger selv ved, og prisen vår er med i tabellen. Ser du en feil, eller vil du ha med din pris? Send en e-post til <a href="mailto:{CO['email']}">{CO['email']}</a>.</li>
    </ul>
    <p>Andre prisoversikter bygger på annonser og storsekker, ikke butikkpriser per sekk: {" · ".join(f'<a href="{u}" rel="noopener">{esc(t)}</a>' for t, u in V.get("andre", []))}.</p>
    <h2>Bruk tallene fritt</h2>
    <p>Tallene kan brukes fritt (CC BY 4.0). Oppgi kilden, for eksempel slik: <em>{esc(kilde)}</em>. På nett kan du lime inn denne lenken:</p>
    <textarea class="embed" readonly rows="2" onclick="this.select()">{cite}</textarea>
    <p>Journalist? Se <a href="/presse/">pressesiden</a>, eller ring {CO['phone_display']}.</p>
    <h2 id="sporsmal">Spørsmål og svar</h2>
    {faq}
    <p>Les også: <a href="/fyre-i-dag/">Lønner det seg å fyre med ved i dag?</a> · <a href="/artikler/bjorkeved-pris-follo/">Hva koster bjørkeved levert i Follo?</a></p>
    {cta_block()}
  </div>
</section>""" + order_form()
    return head(f"{V['name']} {V['year']}: hva koster en sekk ved? | {C.BRAND}",
                f"Vi sammenlignet {len(VEDPRISER)} vedpriser i Norge høsten {V['year']}. Median {kr0(alle)} per 40 liter. Se alle prisene med kilde, og last ned tallene.",
                path, ld) + body + footer()


def inline_md(t):
    return AB.inline(t)


# ---------------------------------------------------------------- machine-readable files

def llms_txt():
    areas = "\n".join(f"- [Ved i {a['name']}]({URL}/{a['slug']}/): {', '.join(a['places'])} (postnr. {a['postnr']})"
                      for a in C.AREAS)
    carry = "\n".join(f"- {label}: {'ingen tillegg' if fee == 0 else f'+{fee} kr per bestilling'}" for _, label, fee in C.CARRY_OPTIONS)
    faq = "\n\n".join(f"### {q}\n{a}" for q, a in faq_items())
    arts = "\n".join(f"- [{a['title']}]({URL}/artikler/{a['slug']}/): {a.get('kort') or a['description']}" for a in ARTICLES)
    tools = "\n".join(
        ([f"- [{C.VEDPRIS['name']} {C.VEDPRIS['year']}]({URL}/vedpris/): vedpriser hos {len(VEDPRISER)} norske selgere, med kilde og CSV"] if VEDPRISER else [])
        + [f"- [Lønner det seg å fyre i dag?]({URL}/fyre-i-dag/): dagens strømpris time for time mot varme fra ved, alle prisområder",
           f"- [Gratis verktøy]({URL}/verktoy/): vedkalkulator og strøm-mot-ved som kan bygges inn på andre nettsider",
           f"- [Åpne data]({URL}/data/): vedfyring per kommune i Follo som CSV (CC BY 4.0)",
           f"- [Presse]({URL}/presse/): tall, bilder med fri bruk og kontakt"])
    return f"""# {C.BRAND}

> {C.BRAND} selger og leverer tørr bjørkeved i 40-liters sekker til privatpersoner og hytteeiere i Follo (Akershus): Ås, Nordre Follo (Ski, Langhus, Kolbotn, Oppegård), Vestby, Frogn (Drøbak), Nesodden og Enebakk. Pris {P['price']} kr per sekk {P['vat_text']}. Veden kan bæres inn. Drives av {CO['legal_name']}, org.nr. {CO['org_nr']}, {CO['street']}, {CO['postal_code']} {CO['city']}.

## Fakta
- Produkt: {P['name']}, ca. {P['kg']} kg, kubber ca. {P['length_cm']} cm lange og {P['diameter_cm']} cm i diameter
- Kvalitet: tørket og lagret under tak, produsert etter norsk standard
- Pris: {P['price']} kr per sekk {P['vat_text']} (10 sekker = {kr(10 * P['price'])})
- Hjemlevering: {kr(C.DELIVERY_FEE) + ' per bestilling' if C.DELIVERY_FEE else 'avtales'}
- Bestilling: skjema på {URL}/#bestill eller telefon {CO['phone']}
- E-post: {CO['email']}
- Oppdatert: {TODAY}

## Tillegg for bæring
{carry}

## Leveringsområder
{areas}

## Spørsmål og svar
{faq}

## Artikler
{arts}

## Verktøy og data
{tools}
"""


def sitemap(paths):
    urls = "\n".join(
        f"  <url><loc>{URL}{p}</loc><lastmod>{TODAY}</lastmod><priority>{'1.0' if p == '/' else '0.8'}</priority></url>"
        for p in paths)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n'


def robots():
    return f"User-agent: *\nAllow: /\nDisallow: {BASE}/takk/\n\nSitemap: {URL}/sitemap.xml\n"


def manifest():
    return json.dumps({
        "name": C.BRAND, "short_name": C.BRAND, "start_url": f"{BASE}/", "display": "browser",
        "background_color": "#faf7f0", "theme_color": "#1f3a2b",
        "icons": [{"src": f"{BASE}/img/icon-192.png", "sizes": "192x192", "type": "image/png"}],
    }, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------- build

def with_base(content):
    if not BASE:
        return content
    content = re.sub(r'((?:href|src|srcset|imagesrcset|action)=")/(?!/)', rf"\1{BASE}/", content)
    return re.sub(r", /(img|assets)/", rf", {BASE}/\1/", content)


def write(rel, content):
    if rel.endswith(".html"):
        content = with_base(content)
    f = OUT / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(content, encoding="utf-8")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC, OUT)

    write("index.html", page_index())
    for a in C.AREAS:
        write(f"{a['slug']}/index.html", page_area(a))
    write("takk/index.html", page_takk())
    write("personvern/index.html", page_personvern())
    write("404.html", page_404())

    write("fyre-i-dag/index.html", page_fyre())
    write("verktoy/index.html", page_verktoy())
    write("widget/vedkalkulator/index.html", widget_kalkulator())
    write("widget/fyre-i-dag/index.html", widget_fyre())
    write("data/index.html", page_data())
    write("data/vedfyring-follo-kommuner.csv", to_csv(kommune_rows(), KOMMUNE_COLS))
    write("presse/index.html", page_presse())
    extra = ["/fyre-i-dag/", "/verktoy/", "/data/", "/presse/"]
    if VEDPRISER:
        write("vedpris/index.html", page_vedpris())
        extra.insert(0, "/vedpris/")

    write("artikler/index.html", page_articles_index())
    for a in ARTICLES:
        write(f"artikler/{a['slug']}/index.html", page_article(a))
    indexable = (["/"] + [f"/{a['slug']}/" for a in C.AREAS] + ["/artikler/"]
                 + [f"/artikler/{a['slug']}/" for a in ARTICLES] + extra + ["/personvern/"])
    write("sitemap.xml", sitemap(indexable))
    write("robots.txt", robots())
    write("llms.txt", llms_txt())
    write("site.webmanifest", manifest())
    write(".nojekyll", "")
    print(f"Bygget {len(indexable) + 4} sider til {OUT}/ for {URL}")


if __name__ == "__main__":
    main()
