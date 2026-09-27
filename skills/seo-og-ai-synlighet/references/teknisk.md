# Teknisk oppsett – maler

Eksemplene er Python-f-strenger fra follobjorkeved.no (`build.py`). `URL`, `C` (config), `P` (produkt) og `CO` (firma) kommer fra konfigfila. Tilpass til rammeverket i prosjektet.

## `<head>`

```html
<html lang="nb">
<title>{søkeord} i {sted} – {fordel}, {pris} | {Merke}</title>
<meta name="description" content="{sted, pris, handling – maks ca. 155 tegn}">
<link rel="canonical" href="{URL}{path}">
<meta property="og:type" content="website">
<meta property="og:locale" content="nb_NO">
<meta property="og:site_name" content="{Merke}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{URL}/img/og.jpg">   <!-- 1200×630 -->
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="geo.region" content="NO-32">          <!-- ISO 3166-2, lokale bedrifter -->
<meta name="geo.placename" content="{område}">
<meta name="google-site-verification" content="…"> <!-- kun forsiden -->
<link rel="preload" as="image" href="/img/hero-768.webp"
      imagesrcset="/img/hero-768.webp 768w, /img/hero-1536.webp 1536w" imagesizes="(min-width: 900px) 50vw, 100vw">
<!-- takkesider: <meta name="robots" content="noindex"> -->
```

## JSON-LD

Legg hvert objekt i sin egen `<script type="application/ld+json">` (bruk `json.dumps(o, ensure_ascii=False)`). Bruk `@id` så objektene peker på hverandre.

**Hvilke typer på hvilke sider**

| Side | Typer |
|---|---|
| Forside | LocalBusiness, Product+Offer, FAQPage |
| Stedsside | LocalBusiness, Product+Offer, FAQPage, BreadcrumbList |
| Artikkel | Article, LocalBusiness, BreadcrumbList, FAQPage (hvis FAQ) |
| Artikkeloversikt | CollectionPage med `hasPart` Article |
| Verktøy/kalkulator | WebApplication (gratis Offer, `publisher` → `#business`) |
| Data/prisindeks | Dataset med `DataDownload` (text/csv), `license`, `spatialCoverage`, `dateModified` |

```python
def business_ld():
    return {
        "@context": "https://schema.org", "@type": "LocalBusiness",
        "@id": f"{URL}/#business",
        "name": BRAND, "legalName": LEGAL_NAME, "description": "…pris og område i én setning…",
        "url": f"{URL}/", "telephone": PHONE, "email": EMAIL,
        "image": f"{URL}/img/og.jpg", "logo": f"{URL}/img/icon-192.png",
        "priceRange": "89 kr per sekk", "taxID": ORG_NR,
        "address": {"@type": "PostalAddress", "streetAddress": …, "postalCode": …,
                    "addressLocality": …, "addressRegion": …, "addressCountry": "NO"},
        "areaServed": [{"@type": "Place", "name": a} for a in AREAS]
                      + [{"@type": "AdministrativeArea", "name": REGION}],
        "sameAs": [FACEBOOK, OTHER_SITE],
        "makesOffer": {"@id": f"{URL}/#offer"},
    }

def product_ld():
    return {
        "@context": "https://schema.org", "@type": "Product", "@id": f"{URL}/#product",
        "name": …, "description": …, "image": …, "brand": {"@type": "Brand", "name": BRAND},
        "offers": {
            "@type": "Offer", "@id": f"{URL}/#offer",
            "price": "89", "priceCurrency": "NOK",
            "availability": "https://schema.org/InStock",
            "url": f"{URL}/#bestill", "seller": {"@id": f"{URL}/#business"},
            "shippingDetails": {"@type": "OfferShippingDetails",
                "shippingRate": {"@type": "MonetaryAmount", "value": "499", "currency": "NOK"},
                "shippingDestination": {"@type": "DefinedRegion", "addressCountry": "NO"}},
        },
    }

def faq_ld(items):   # items = [(spørsmål, svar)] – samme liste som vises på siden
    return {"@context": "https://schema.org", "@type": "FAQPage",
            "mainEntity": [{"@type": "Question", "name": q,
                            "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in items]}

def breadcrumb_ld(name, path):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Forside", "item": f"{URL}/"},
        {"@type": "ListItem", "position": 2, "name": name, "item": f"{URL}{path}"}]}

def article_ld(a):
    return {"@context": "https://schema.org", "@type": "Article",
            "headline": a["title"], "description": a["description"],
            "datePublished": a["date"], "dateModified": a["updated"], "inLanguage": "nb-NO",
            "mainEntityOfPage": f"{URL}/artikler/{a['slug']}/", "image": …,
            "author": {"@type": "Organization", "name": LEGAL_NAME, "url": f"{URL}/"},
            "publisher": {"@id": f"{URL}/#business"}}
```

Test med Googles «Rich Results Test» og validator.schema.org.

## llms.txt

Generer fra samme konfig som resten av siden. Struktur:

```markdown
# {Merke}

> {Én avsnitt: hva, hvor (alle steder med navn), pris, hvem som driver, org.nr., adresse.}

## Fakta
- Produkt: …
- Pris: … (eksempel: 10 stk = …)
- Levering: …
- Bestilling: {URL}/#bestill eller telefon …
- Oppdatert: {dato}

## Leveringsområder
- [Ved i Ås]({URL}/ved-as/): steder… (postnr. …)

## Spørsmål og svar
### Spørsmål?
Svar.

## Artikler
- [Tittel]({URL}/artikler/slug/): {Kort svar}

## Verktøy og data
- [Navn]({URL}/…/): hva det er
```

## sitemap.xml og robots.txt

```python
def sitemap(paths):
    urls = "\n".join(f"  <url><loc>{URL}{p}</loc><lastmod>{TODAY}</lastmod></url>" for p in paths)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n'

def robots():
    return f"User-agent: *\nAllow: /\nDisallow: /takk/\n\nSitemap: {URL}/sitemap.xml\n"
```

Ikke blokker AI-crawlere (GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended, ClaudeBot) hvis målet er å bli sitert. Ta bare med indekserbare sider i sitemap.

## IndexNow (Bing, Yandex m.fl.) i GitHub Actions

1. Lag en tilfeldig nøkkel (32 hex-tegn) og legg fila `{nøkkel}.txt` med nøkkelen som innhold i rota på siden.
2. Etter publisering:

```yaml
      - name: Varsle Bing via IndexNow
        continue-on-error: true
        run: |
          sleep 60
          urls=$(grep -o '<loc>[^<]*' public/sitemap.xml | sed 's/<loc>//' | python3 -c "import sys,json;print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))")
          curl -sS -m 30 -X POST https://api.indexnow.org/indexnow \
            -H "Content-Type: application/json; charset=utf-8" \
            -d "{\"host\":\"DOMENE\",\"key\":\"NØKKEL\",\"keyLocation\":\"https://DOMENE/NØKKEL.txt\",\"urlList\":$urls}" \
            -w "IndexNow svarte: %{http_code}\n"
```

200/202 = godtatt.

## Ytelse

- Statisk HTML (generator i Python/Node, eller Astro/Eleventy). Unngå WordPress med mange plugins.
- Bilder i WebP i flere bredder, `srcset`/`sizes`, `width`/`height`, `loading="lazy"` under bretten, preload av hero.
- Én CSS-fil, lite JS (≈10 KB), ingen tredjeparts-skript som blokkerer.
- Sjekk med PageSpeed Insights (mål: grønt på Core Web Vitals, mobil).

## Måling uten cookies

GoatCounter (eller Plausible/Umami) + egne hendelser: «bestilling sendt», «begynte på bestilling», «trykket på telefon», «feil ved sending». Legg til felt «Hvor fant du oss?» og fang UTM-parametre i skjemaet. GA4/Meta Pixel krever samtykkebanner i Norge/EU.
