# Follo Bjørkeved – nettside for vedsalg

Dette er en rask, statisk nettside for salg av bjørkeved i Follo. Den er laget for lokalt søk på Google og for AI-søk som ChatGPT, Gemini og Perplexity. Bestillinger går rett til e-post.

Markedsplan og analyse med tall og kilder finner du i **[ANALYSE.md](ANALYSE.md)**.

## Innhold

| Side | Mål i søk |
|---|---|
| `/` | «bjørkeved Follo», «kjøp ved», «ved levering», «bjørkeved pris» |
| `/ved-as/`, `/ved-ski/`, `/ved-kolbotn/`, `/ved-vestby/`, `/ved-drobak/`, `/ved-nesodden/`, `/ved-enebakk/` | «ved Ås», «ved Ski», «ved Kolbotn» osv. Hver side har egen tittel, egne FAQ-er og et bestillingsskjema der området er valgt på forhånd |
| `/takk/` | Takkeside etter bestilling. Brukes til å måle konverteringer i Google Ads og Meta |
| `/llms.txt` | Faktaark skrevet for AI-søkemotorer |
| `sitemap.xml`, `robots.txt` | Lages automatisk |

Andre SEO-grep:
- Strukturerte data (JSON-LD) for `LocalBusiness`, `Product`/`Offer` med pris, `FAQPage` og `BreadcrumbList`.
- Ingen WordPress eller plugins. Siden er ren HTML og CSS med ca. 8 KB JavaScript, så den laster svært raskt og scorer høyt på Core Web Vitals.
- Bildet er i WebP, har flere størrelser og forhåndslastes. Alle sider har canonical-lenke, Open Graph og norsk språkkode.

## Endre priser eller tekst

Alt ligger i **`config.py`**, blant annet pris, bæringstillegg, leveringsgebyr, områder, FAQ og e-postadresse. Bygg siden på nytt etter endringer:

```bash
python3 build.py          # lager nettsiden i public/
```

Hver push til `main` publiseres automatisk med GitHub Actions.

## Bestillinger på e-post

Skjemaet sender til `ORDER_EMAIL` i `config.py` gjennom [FormSubmit](https://formsubmit.co). Tjenesten er gratis og trenger ingen server.

1. Når siden er ute, sender du én testbestilling.
2. FormSubmit sender da en aktiverings-e-post til adressen. Klikk **Activate**.
3. Etter det kommer alle bestillinger som e-post med en tabell over hva kunden har bestilt. Kunden får også en automatisk bekreftelse.
4. Anbefalt: I aktiverings-e-posten får du en tilfeldig kode. Sett den inn som `ORDER_EMAIL` i stedet for e-postadressen. Da vises ikke adressen i kildekoden, og du får mindre spam.

Hvis sending feiler, ser kunden telefonnummeret og kan ringe i stedet.

## Hosting (gratis): GitHub Pages

Siden er live på **https://follobjorkeved.no** (domenet er registrert hos Domeneshop og peker til GitHub Pages).
Hver push til `main` bygger siden og legger den på `gh-pages`-branchen, som GitHub Pages publiserer (se `.github/workflows/pages.yml`).

### Koble til eget domene
1. Kjøp **follobjorkeved.no** hos for eksempel Domeneshop. Se begrunnelsen i ANALYSE.md.
2. Legg inn disse DNS-postene hos domeneleverandøren:
   - `A` @ → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA` @ → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `CNAME` www → `andersmathisen7-design.github.io`
3. Gå til GitHub → Settings → Pages → Custom domain. Skriv inn `follobjorkeved.no` og kryss av for **Enforce HTTPS**.
4. Kjør workflowen «Publiser nettsiden» på nytt. Den finner det nye domenet selv, og oppdaterer alle lenker og sitemap.

## Besøksstatistikk

Dashbord: **https://follobjorkeved.goatcounter.com**. Du logger inn med amkleven@gmail.com.
Det viser besøk per side, hvor folk kommer fra (Google, Facebook osv.) og disse hendelsene:
«Bestilling sendt», «Begynte på bestilling», «Trykket på telefonnummer» og «Feil ved sending av bestilling».
GoatCounter bruker ingen cookies, så siden trenger ikke samtykkebanner.

## Folloes.no og denne siden

Begge sidene lever hver for seg. Den nye siden har egne tekster og er ikke en kopi av den gamle, så Google ser dem ikke som duplikater. Anbefalt: legg inn en lenke fra folloes.no/salg-av-bjorkeved/ til den nye siden.

## Google Analytics / Ads / Meta (valgfritt)

Fyll inn `GA4_ID`, `GADS_ID`/`GADS_CONVERSION` og `META_PIXEL_ID` i `config.py`. Siden sender da disse hendelsene:
- `generate_lead`: en bestilling er sendt. Verdien er i NOK.
- `click_tel`: noen har trykket på telefonnummeret.
- `begin_checkout`: noen har begynt å fylle ut skjemaet.

**Merk:** Slår du på Google Analytics eller Meta Pixel, krever norsk lov at besøkende samtykker til cookies. Da må du legge inn et samtykkebanner. Uten slike ID-er setter siden ingen cookies.
