---
name: seo-og-ai-synlighet
description: Gjør en nettside synlig i Google (vanlig og lokalt søk) og i AI-søk (ChatGPT, Perplexity, Gemini, Copilot, Google AI Overviews). Bruk når brukeren vil ha bedre treff på Google, bli nevnt av KI/AI, lage en ny nettside for en (lokal) bedrift, skrive artikler for SEO, legge inn strukturerte data/JSON-LD, llms.txt, sitemap, IndexNow, Search Console, Google-bedriftsprofil, kataloger eller lenkebygging. Oppskriften er hentet fra follobjorkeved.no (statisk side for vedsalg i Follo).
---

# SEO og AI-synlighet

Oppskrift for å få en side til å rangere på Google **og** bli sitert av AI-søk. Den er testet på follobjorkeved.no: en statisk Python-generert side (build.py + config.py) publisert med GitHub Pages. Prinsippene gjelder for alle rammeverk.

Grunntanken: **AI-søk og Google belønner det samme – tydelige fakta som er lette å lese maskinelt, som står likt mange steder, og som andre lenker til.**

## Arbeidsgang

1. **Kartlegg først** (se `references/analyse.md`): hva folk søker på (sted + produkt, f.eks. «ved Ski»), sesong, konkurrenter og priser, ledige domener. Skriv tall med kilde, og merk antakelser som **(antakelse)**.
2. **Bygg det tekniske grunnlaget** (sjekkliste under + `references/teknisk.md`).
3. **Lag innhold som kan siteres** (`references/innhold.md`): én side per sted/intensjon, artikler med «Kort svar», FAQ, egne tall med kilder.
4. **Gjør siden kjent** (`references/utenfor-siden.md`): Search Console, Bing/IndexNow, Google-bedriftsprofil, kataloger med lik NAP, lenkemagneter og pressepitch.
5. **Lag en gjøremålsliste** for det brukeren må gjøre selv (kontoer, bekreftelser, DNS), med «hvorfor» og steg-for-steg. Ikke send e-post eller publiser noe eksternt uten at brukeren har sagt ja – lag heller utkast.

## Sjekkliste: teknisk (hver side)

- [ ] Unik `<title>` med søkeord + sted + **pris/konkret fordel** (f.eks. «Ved i Ski – tørr bjørkeved levert, 89 kr/sekk | Merke»). Pris i tittelen gir flere klikk.
- [ ] Unik meta description (≤ ~155 tegn) med sted, pris og handling.
- [ ] `<html lang="nb">`, `<link rel="canonical">`, Open Graph (+ `og:locale`, bilde 1200×630), `twitter:card`, evt. `geo.region`/`geo.placename`.
- [ ] JSON-LD: `LocalBusiness` (med `@id`, NAP, org.nr., `areaServed`, `sameAs`), `Product`+`Offer` (pris, valuta, `InStock`, `shippingDetails`), `FAQPage`, `BreadcrumbList`. Artikler: `Article` med `datePublished`/`dateModified`/`author`. Verktøy: `WebApplication`. Data: `Dataset` med `DataDownload` og lisens.
- [ ] FAQ-tekst i JSON-LD skal være **identisk** med synlig tekst på siden.
- [ ] `/llms.txt`: faktaark i Markdown for KI – generert fra samme konfig som siden, så pris og fakta aldri spriker.
- [ ] `sitemap.xml` (med `lastmod`) og `robots.txt` (Allow alt, Disallow takk-/kvitteringssider, peker på sitemap). Takkesider får `noindex`.
- [ ] Rask side: ren HTML/CSS, lite JS, WebP i flere størrelser med `srcset`, forhåndslast hero-bilde, ingen tunge plugins. Mobil først, alltid synlig «Bestill»-knapp.
- [ ] Én kilde til sannhet: alle priser, NAP, områder og FAQ i én konfigfil som genererer HTML, JSON-LD, llms.txt og sitemap.
- [ ] Automatisk publisering (CI) + **IndexNow**-ping til Bing etter hver publisering (ChatGPT-søk og Copilot bruker Bing).
- [ ] Search Console-bekreftelse (meta-tag på forsiden eller DNS TXT).
- [ ] Personvernvennlig statistikk (f.eks. GoatCounter, ingen cookies ⇒ ikke samtykkebanner) med hendelser for bestilling, tlf-klikk og skjemastart. Felt «Hvor fant du oss?» + UTM i skjemaet.

Maler og kode: `references/teknisk.md`.

## Sjekkliste: innhold som AI siterer

- [ ] **Én landingsside per sted** folk faktisk søker på, med egen tittel, egne FAQ-er, stedsnavn/postnumre og skjema med stedet forhåndsvalgt. Ikke tynne kopier: legg inn **lokale fakta** (f.eks. SSB-tall per kommune, lokale regler) med kilde.
- [ ] Artikler som svarer på ekte spørsmål («Hvor mye … trenger jeg?», «Er X billigere enn Y?»). Hver starter med en **«Kort svar»-boks** på 2–4 setninger med konkrete tall – det er den AI-en løfter ut.
- [ ] Tall, tabeller og **kilder med lenke** (SSB, myndigheter, bransjeorganisasjoner). Vær ærlig også når tallene ikke taler for deg – det gir troverdighet.
- [ ] FAQ nederst på artikler og landingssider (og i `FAQPage`).
- [ ] Interne lenker: forside ↔ stedssider ↔ artikler ↔ verktøy.
- [ ] Datoer: «Oppdatert …» synlig og i `dateModified`.
- [ ] **Lenkemagneter**: egen prisindeks/undersøkelse med kilde per datapunkt, gratis verktøy/kalkulator som kan bygges inn (med lenke tilbake), åpne data (CSV, CC BY 4.0), presseside.

Detaljer og mal for artikkel: `references/innhold.md`.

## Sjekkliste: utenfor siden

- [ ] Google Search Console: bekreft, send inn sitemap, be om indeksering av viktigste sider.
- [ ] Bing Webmaster Tools (importer fra Search Console) + IndexNow.
- [ ] **Google-bedriftsprofil** – viktigste enkelttiltak for lokalt søk. Ekte navn uten søkeord, riktig kategori, tjenesteområde (skjul adresse hvis dere kjører ut), 10+ bilder, produkter, ukentlige innlegg, svar på anmeldelser.
- [ ] Anmeldelser: SMS med lenke etter hver levering, sett et mål (f.eks. 20 før jul).
- [ ] Kataloger med **nøyaktig lik NAP** overalt (navn, adresse, telefon, URL, org.nr.): Gule Sider, 1881, Proff, bransjekataloger, FINN.
- [ ] Lenker fra egne/eksisterende nettsider, næringsforening, lokale grupper.
- [ ] Pitch lenkemagnetene til lokalaviser/riksmedier/fagmiljøer når de er aktuelle (sesong, prishopp). Lag utkast; brukeren sender.

Detaljer: `references/utenfor-siden.md`.

## Leveranse til brukeren

Skriv enkelt og konkret, på brukerens språk. Lever gjerne disse filene i repoet:
- `ANALYSE.md` – marked, søk, konkurrenter, plan, måltall (med kilder).
- `GJOREMAL.md` – det brukeren må gjøre selv, med «Hvorfor» og steg.
- `LENKEBYGGING.md` – lenkemagneter, mottakere, ferdige e-postutkast.
- `README.md` – tabell «Side → mål i søk» og hvordan man endrer pris/tekst.
