# Follo Bjørkeved – nettside for vedsalg

Dette er en rask, statisk nettside for salg av bjørkeved i Follo. Den er laget for lokalt søk på Google og for AI-søk som ChatGPT, Gemini og Perplexity. Bestillinger går til appen Nettsideferdig, som sender dem til oss på e-post.

Markedsplan og analyse med tall og kilder finner du i **[ANALYSE.md](ANALYSE.md)**.

## Innhold

| Side | Mål i søk |
|---|---|
| `/` | «bjørkeved Follo», «kjøp ved», «ved levering», «bjørkeved pris» |
| `/ved-as/`, `/ved-ski/`, `/ved-kolbotn/`, `/ved-vestby/`, `/ved-drobak/`, `/ved-nesodden/`, `/ved-enebakk/` | «ved Ås», «ved Ski», «ved Kolbotn» osv. Hver side har egen tittel, egne FAQ-er og et bestillingsskjema der området er valgt på forhånd |
| `/vedpris/` | Sekkprisindeksen: vedpriser i hele Norge med kilde og CSV. Laget for å få lenker fra aviser (se LENKEBYGGING.md) |
| `/fyre-i-dag/` | «Lønner det seg å fyre i dag?»: dagens strømpris time for time mot ved. Innstillingene ligger i `STROM` i `config.py` |
| `/verktoy/`, `/widget/…` | Vedkalkulator og strøm mot ved som andre kan bygge inn på sine nettsider |
| `/data/`, `/presse/` | Åpne data (CSV, CC BY 4.0) og en side for journalister |
| `/admin/` | Ikke i søk. Sender videre til eiersiden i appen: https://folloes.app.nettsideferdig.no/admin/ |
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

## Bestillinger: appen Nettsideferdig

Bestillingsskjemaet går til appen Nettsideferdig (`APP_URL` i `config.py`, https://folloes.app.nettsideferdig.no), ikke til FormSubmit eller Google-regnearket:

- Leveringsdagene og «Fullt»/«Ledig» kommer fra `GET /api/leveringsdager` når adressen er skrevet (kjøretid, lossing og bæring regnes i appen). Området legges til adressen som kommune, så Kartverket finner den.
- Bestillingen sendes til `POST /api/bestill-levering` (bare ID-er og antall, ingen beløp; appen regner prisen og sender kunden bekreftelse på e-post). Er dagen blitt full (409), velger kunden en ny dag.
- Varen heter «Bjørkeved 40 L» i appen (`APP_VARE`), og bæringen er tillegg med nøyaktig samme navn som i `CARRY_OPTIONS`. Vedabonnement sendes som fast levering (`fast_uker` 2, 4 eller 6).
- Eiersiden (bestillinger, fulle dager, ferie) er appens admin. `/admin/` på nettsiden sender dit.
- Prisene på siden står i `config.py`, men det er prisene i appen som gjelder. Endres de, endres begge.
- `APP_URL=http://127.0.0.1:8790 python3 build.py` bygger mot en lokal (falsk) app.

Svarer ikke appen, får kunden en feilmelding med telefonnummeret.

`kalender/` (Google-regnearket) og workflowen `kalender.yml` brukes ikke lenger av nettsiden.

Tester for skjemaet ligger i `tests/` (kjøres lokalt, se [tests/README.md](tests/README.md)).

## Leveringsdager

Kunden velger leveringsdag i skjemaet. Dere kjører mandag og fredag. Hvilke dager som har plass til adressen og bestillingen, avgjør appen. Før kunden har skrevet adressen (og hvis appen ikke svarer), vises dagene i `DELIVERY_DAYS` i `config.py`. Ferie og fulle dager settes i appen (og ferie gjerne også i `closed`).

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
«Sjekket pris i skjemaet» (endret antall eller bæring), «Begynte på bestilling» (begynte på adresse eller kontaktinfo), «Trykket Send, men et felt manglet: …» (ett per felt, f.eks. Telefon), «Endret antall sekker til: …» (faste grupper: under-10, 10-19, 20-29, 30-49, 50-99, 100+; standardantallet har egen gruppe), «Valgte leveringsdag», «Bestilling sendt», «Bestilte antall sekker: …», «Valgte hvor ofte: …» (en-gang, 2-uker, 4-uker eller 6-uker i skjemaet), «Bestilte med hyppighet: …» (vedabonnement eller én gang i sendt bestilling), «Trykket på telefonnummer» og «Feil ved sending av bestilling: …» (med grunnen, f.eks. «order_error:Failed to fetch»).
For hendelsene viser «kilde» (referrer) siden hendelsen skjedde på, for eksempel `follobjorkeved.no/ved-as`. Da ser du hvilke sider som gir bestillinger. Hvor besøkende kom fra, ser du på sidene selv.
GoatCounter bruker ingen cookies, så siden trenger ikke samtykkebanner.

## Folloes.no og denne siden

Begge sidene lever hver for seg. Den nye siden har egne tekster og er ikke en kopi av den gamle, så Google ser dem ikke som duplikater. Anbefalt: legg inn en lenke fra folloes.no/salg-av-bjorkeved/ til den nye siden.

## Google Analytics / Ads / Meta (valgfritt)

Fyll inn `GA4_ID`, `GADS_ID`/`GADS_CONVERSION` og `META_PIXEL_ID` i `config.py`. Siden sender da disse hendelsene:
- `generate_lead`: en bestilling er sendt. Verdien er i NOK.
- `click_tel`: noen har trykket på telefonnummeret.
- `begin_checkout`: noen har begynt å fylle ut skjemaet.

**Merk:** Slår du på Google Analytics eller Meta Pixel, krever norsk lov at besøkende samtykker til cookies. Da må du legge inn et samtykkebanner. Uten slike ID-er setter siden ingen cookies.
