# Plan: «Levert» på eiersiden lager fakturagrunnlag i Duett

> **2026-10-28.** Koden er skrevet (fase 2) etter ja fra Anders, men står av
> (`duett_på` = `nei`) til Duett har gitt skrivetilgang. Den er testet med et
> falskt regneark og et falskt Duett, ikke mot det ekte Duett. Planen bygger
> på det som er lest fra Duett-API-et (bare GET) og Duetts dokumentasjon.

## Mål

Når vi trykker **Bare levert** på eiersiden (follobjorkeved.no/admin/), skal
kalenderskriptet:

1. finne kunden i Duett, eller opprette den hvis den ikke finnes,
2. opprette en ordre for leveringen i **FOLLO EIENDOMSSERVICE AS**,
3. la ordren ligge i Duett uten å fakturere eller sende den.

**Betalt og levert** og **Marker som betalt** gjør ingenting i Duett
(avklart med Anders 2026-10-28).

Vi går gjennom og sender fakturaene selv fra Duett. Statusendringen i arket
skal alltid lykkes, også når Duett feiler.

## Hva som er observert i Duett (2026-10-28)

Skilt mellom **observert** (sett i API-svar eller dokumentasjon) og **antatt**.

| Tema | Status | Kilde |
|---|---|---|
| Nøkkelen gjelder FOLLO EIENDOMSSERVICE AS, integrasjonen «Datauttrekk», rolle `ReportRead` | observert | `GET /System/v2/integration` |
| `POST /Customer/v2` krever rollen `HourWrite`, `OrderWrite` eller `VoucherWrite` | observert | Swagger V2 |
| `POST /Order/v2` krever `OrderWrite` | observert | Swagger V2 |
| `GET /Article/v2` krever `OrderRead` (eller `HourRead`/`VoucherRead`), gir 403 i dag | observert | Swagger V2 og kall |
| Integrasjonsnøkkelen følger integrasjonen; egne integrasjoner går via avtale med Duett | observert | api.duett.no/documentation |
| Modulene Ordre, Faktura, Sende faktura og Vare er aktive for selskapet | observert | `/System/v2/integration` |
| Ingen vanlige ordrer står som startet (`saved`) eller klar til sending nå. Fem tilbud står som `saved`. Enkelte ordrer gir `500` når de leses, så lesing må tåle det | observert | `GET /Order/v2` filtrert på status |
| Kundesøk med `filter[contactInfo.email][EQ]` og `filter[contactInfo.mobile][LIKE]` virker | observert | `GET /Customer/v2` |
| Kundenummer ligger i serien 10000–19999 | observert | `/Register/v2/AccountIntervals` |
| Duett lager kundenummer selv når `customerNumber` ikke sendes med | antatt | dokumentasjonen sier «automatically generated» |

### Ordren i Duett

Fra dokumentasjonen for Order v2 (observert):

- Påkrevd: `customerId`, `invoiceYear`, `orderCategory`, `ourReference`, `payType`, `status`.
- Ordren må ha minst én linje, høre til en kunde som finnes, og **bare bruke
  varer som finnes i Duett**. Varer må altså finnes på forhånd.
- `status` kan bare være `saved` (startet ordre) eller `orderReadyToSend`
  (klar til sending) når ordren opprettes.
- `config.directInvoicing` er `false` som standard. Bare med `true` blir
  ordren fakturert med en gang. Vi sender aldri `true`.
- POST med samme innhold innen 120 sekunder gir `409 Conflict`. Da skal man
  sjekke om ordren likevel ble laget.

### Varene som finnes (Vareregister)

Duett-prisene er **uten mva**, og tidligere vedfakturaer er ført med
mva-kode `vat` (25 %). 71,20 × 1,25 = 89 kr, og 399,20 × 1,25 = 499 kr,
som er prisene på nettsiden. Observert i `Report/v2/Vareregister`,
`Report/v2/Varestatistikk` og ordrelinjene i `Order/v2`.

| Varenr. | Navn i Duett | Salgspris 1 (eks. mva) | Intern `articleId` | Brukt på |
|---|---|---|---|---|
| 51938591 | Ved (40l) | 71,20 | 189 | de fleste vedfakturaene i 2026 |
| 51938592 | Hjemlevering | 399,20 | 190 | de fleste vedfakturaene i 2026 |
| 51938593 | Bæring - Garasje | 12,00 | ikke sett | én faktura |
| 51938596 | Bæring - 1.etasje | 12,80 | 194 | to fakturaer |
| 51938560, 4910579 | Ved per sekk / Bjørkeved, per sekk | 71,20 | – | eldre, samme pris |
| 51938561, 4910580 | Levering, bjørkeved / Freakt Bjørkeved | 399,20 | – | eldre, samme pris |

Vedfakturaene har som regel bæreren **prosjekt 198 «Ved»** (`carrierId` 247).

**Bæring mangler som vare for de fleste valgene.** Nettsiden har 12 valg fra
12 til 36 kr per sekk (inkl. mva), Duett har bare garasje (15 kr inkl.) og
1. etasje (16 kr inkl.). Valgt løsning: varen «Tjeneste» (51938574, intern
`articleId` 172), med pris og tekst per linje. Den er brukt slik før på
vedfakturaer, med linjeteksten «Bæring» (observert). API-et tillater å
overstyre `salesPrice` og `name` per linje. Vil regnskapsfører ha en egen
vare, endres `DUETT_VARER` i `kalender.gs`.

## Det som mangler før fase 2

1. **Skrivetilgang.** Datauttrekk gir bare `ReportRead`. Vi trenger en
   integrasjon med `OrderWrite` (og helst `OrderRead`, så varene kan leses
   med `articleId`). Må avklares med Duett (utkast til e-post ligger i
   Gmail-utkastene, ikke sendt).
2. ~~Bæringsvare~~ Løst med «Tjeneste» og pris per linje (over).
3. ~~Kundenavn fra nettbestillinger~~ Skjemaet har fått et påkrevd felt
   «Navn (står på fakturaen)», og kalenderen lagrer det. Gamle rader uten navn
   gir merknaden «mangler navn – skriv navnet i arket og prøv igjen».
4. ~~Postnummer~~ Står postnummeret i adressen, brukes det. Ellers hentes det
   fra Kartverket-oppslaget (`geokod_`). Det lagres ikke i arket, men står på
   kunden i Duett.

## Filer

| Fil | Endring |
|---|---|
| `kalender/kalender.gs` | Ny Duett-del: nøkler, oppslag, kunde, ordre, låsing, merknad. Nye kolonner. Menyvalg «Koble til Duett». Ny handling `duett` (prøv igjen). |
| `src/assets/admin.js` | Vis «Sendt til Duett #<ordrenr>» eller merknaden, og knappen «Prøv igjen». Ingen nye eksterne skript, ingen inline-stil (CSP). |
| `build.py` | Eventuelt nytt navnefelt i skjemaet (punkt 3 over), og knappestil hvis det trengs. |
| `src/assets/app.js` | Eventuelt sende navnet til kalenderen. |
| `kalender/README.md` | Oppsett av nøkler, hva som skjer ved «levert», hva du gjør når Duett feiler, ny versjon av implementeringen. |
| `regnskap-duett/docs/duett-api.md` | Det som er bekreftet om skrivetilgang. |

## Nye kolonner i «Bestillinger»

Legges bakerst av `ark_()`, som i dag.

| Kolonne | Innhold |
|---|---|
| Duett kunde | Kundenummeret i Duett. Kan også fylles inn for hånd for å velge kunde. |
| Duett ordre | Ordrenummeret og året, f.eks. `123/2026`. Finnes det, lages ingen ny ordre. |
| Duett merknad | Siste feil, f.eks. «ikke sendt til Duett – fant ikke postnummer». Tom når alt gikk bra. |

## Feltmapping

### Kunde (`POST /Customer/v2`), bare privatkunde

| Arket | Duett | Merknad |
|---|---|---|
| Navn | `name` | påkrevd, maks 250 tegn |
| Adresse (gate og nr.) | `address.address1` | delen før første komma |
| Postnummer | `address.zipCodeKey` | fra adressen eller Kartverket |
| E-post | `contactInfo.email`, `paymentInfo.invoiceEmail` | |
| E-post finnes | `paymentInfo.invoiceSendOption = "email"` | ellers tom, Duett velger selv |
| Telefon | `contactInfo.mobile` | normalisert til 8 siffer |

Ikke sendt: `customerNumber` (Duett lager det), `pidNumber`, `vatNumber`,
bankkonto.

**Finne kunden først:**

1. Står det et nummer i «Duett kunde», brukes det.
2. `GET /Customer/v2?filter[contactInfo.email][EQ]=<e-post>&extend=ContactInfo`.
3. Telefon: `filter[contactInfo.mobile][EQ]`, deretter `filter[contactInfo.phone1][EQ]`
   med 8 siffer. Gamle kunder har telefon i flere formater («12345678»,
   «123 45 678», «+47 …»), så treff er ikke garantert.
4. Ett treff: bruk det. Flere treff: ingen ordre, merknad «flere kunder
   passer – skriv kundenummeret i Duett kunde». Ingen treff: opprett.

### Ordre (`POST /Order/v2`)

| Duett | Verdi |
|---|---|
| `customerId` | fra kunden |
| `orderCategory` / `orderType` | `order` / `normal` |
| `status` | `saved` (startet ordre, avklart med Anders 2026-10-28) |
| `config.directInvoicing` | `false`, alltid |
| `payType` | `invoice` |
| `invoiceYear` | året for ordredatoen |
| `orderDate` | dagen knappen trykkes |
| `deliveryDate` | Leveringsdag |
| `deliveryAddress` | Adresse, postnr og poststed |
| `ourReference` | fra Script Properties (`duett_var_referanse`, settes i «Koble til Duett»), ellers «Follo Bjørkeved» |
| `orderReference` | `follobjorkeved-<ID>`, brukes også til å oppdage dobbeltordre. Rader uten ID får en. |
| `internalReference` | «follobjorkeved.no, bestilling <ID>» |
| `invoiceNote` | «Levering av bjørkeved <leveringsdag>.» |
| `carriers` | `[{ carrierId: 247 }]`, prosjekt 198 «Ved», som tidligere vedfakturaer |

Linjer (`lineType: "normal"`, `taxSaleId: "vat"`):

| Linje | `articleId` | `countAgreed` | `salesPrice` (eks. mva) |
|---|---|---|---|
| Ved | 189 (Ved (40l)) | Sekker | pris inkl. mva / 1,25 |
| Bæring (hvis valgt) | 172 (Tjeneste) | Sekker | tillegg per sekk inkl. mva / 1,25, linjetekst = valget |
| Hjemlevering | 190 (Hjemlevering) | 1 | gebyr inkl. mva / 1,25 |

Prisene hentes fra konstanter i `kalender.gs` som speiler `config.py`
(89 kr per sekk, 499 kr levering, bæring fra valget). Prisen i Duett settes
eksplisitt på linjen, så en prisendring i Duett ikke gir et annet beløp enn
kunden fikk oppgitt.

### Beløpskontroll (heltall i øre)

- Totalpris i arket er tekst, f.eks. «1 279 kr» eller «1 279 kr per levering».
  Tallet før «kr» leses ut, alle andre tegn fjernes. Kan det ikke leses,
  eller står det «avtales»: ingen ordre, merknad.
- Bæring per sekk leses fra valget: nettbestillinger har «(+16 kr/sekk)» i
  teksten. Telefonbestillinger har bare «Bæres inn» uten pris. Da regnes
  tillegget ut som (Totalpris − sekker × 89 − 499) / sekker, og må være et
  av tilleggene i `CARRY_OPTIONS`. Ellers: merknad.
- Sum i øre: `sekker × 8900 + sekker × bæring × 100 + 49900` skal være lik
  Totalpris × 100. Avviker den: ingen ordre, merknad med begge tallene.
- Eks. mva per enhet i øre = inkl. øre × 4 / 5. Alle dagens priser er hele
  kroner, så det går opp. Gjør det ikke det: ingen ordre, merknad.
- Etter POST: `grossAmount` i svaret sammenlignes med Totalpris. Avvik gir
  merknad (ordren er da laget, og må sjekkes i Duett).

## Flyt i `kalender.gs`

```
endreStatus_(id, status, betalt)
  ├─ skriver Status og Betalt som i dag            ← alltid først, alltid ferdig
  └─ hvis status går fra noe annet til «Levert», og ikke betalt:
       duettKladd_(id)                              ← feil fanges, gir bare merknad

duettKladd_(id)
  0. duett_på ≠ «ja» → hopp over (ingen merknad)
  1. LockService.getScriptLock().waitLock(20000)
  2. les raden på nytt; «Duett ordre» finnes → ferdig
  3. GET /Order/v2?filter[orderReference][EQ]=follobjorkeved-<ID>
     → finnes: skriv ordrenummeret i arket, ferdig (ingen ny ordre)
  4. kontroller navn, postnr, beløp (over)       → feil: merknad, stopp
  5. finn eller opprett kunde → skriv «Duett kunde»
  6. POST /Order/v2 → skriv «Duett ordre», tøm merknad
     409 → gjenta steg 3
  7. slipp låsen
```

- **Selskapskontroll:** før første skriving i hver kjøring:
  `GET /System/v2/integration`, og navnet må være «FOLLO EIENDOMSSERVICE AS».
  Svaret huskes i 6 timer i CacheService. Annet selskap: stopp, merknad.
- **«Betalt og levert»** og **«Marker som betalt»** lager ingen ordre.
- **«Angre»** sletter ingenting i Duett. Eiersiden viser «Ordre #N ligger i
  Duett – slett den der for hånd hvis den ikke skal faktureres». Blir raden
  levert igjen, finnes ordrenummeret, og det lages ingen ny ordre.
- **Avbestill** etter levert: samme som Angre.
- **Prøv igjen:** ny handling `{action: "duett", id}` fra eiersiden, krever
  innlogging som de andre. Kjører `duettKladd_` for raden, bare når den er
  levert og ikke betalt.
- **Tidsbruk:** 3–5 kall mot Duett per levering, langt under grensen på
  2 500 kall i timen.

## Nøkler og bryter

- Menyvalg **Vedlevering → Koble til Duett** spør etter integrasjonsnøkkel og
  klientnøkkel med `ui.prompt`, og lagrer dem som `DUETT_INTEGRATION_KEY` og
  `DUETT_CLIENT_KEY` i Script Properties. Tester med
  `GET /System/v2/integration` og viser selskap og rolle, ikke nøklene.
- Ikke i koden, ikke i GitHub, ikke i nettleseren. Eiersiden får aldri
  nøklene eller rå svar fra Duett.
- Bryter `duett_på` = `ja`/`nei` i Script Properties. Standard er `nei`.
- Feilmeldinger fra Duett: HTTP-status og `title`/`detail` fra svaret,
  forkortet til 200 tegn. Aldri headere, URL med filter eller nøkler.

## Eiersiden (`admin.js`)

På leverte bestillinger:

- «Sendt til Duett #123» når «Duett ordre» finnes.
- «Ikke sendt til Duett – <merknad>» og knappen **Prøv igjen** når det er en merknad.
- Etter «Angre» med ordrenummer: varsel om at ordren må slettes i Duett for hånd.

Ingen nye eksterne skript, ingen inline-stil. Kundedata går fortsatt bare fra
Apps Script til api.duett.no, aldri via nettleseren.

## Testtilfeller

Alle tilfellene under er kjørt 2026-10-28 i Node med et falskt regneark og et
falskt Duett-API (28 tester, alle grønne). Eiersiden er sjekket i Chromium med
en falsk kalender. Ekte test mot Duett gjenstår: én testbestilling med Anders
som kunde, etter at skrivetilgangen er på plass.

| # | Tilfelle | Forventet |
|---|---|---|
| 1 | Ny kunde, 20 sekker, ingen bæring, «Bare levert» | Kunde opprettes, ordre med 2 linjer, sum 2 279 kr inkl. mva, ligger som kladd |
| 2 | Samme e-post som en eksisterende kunde | Ingen ny kunde, ordre på eksisterende |
| 3 | Bare telefon, finnes i Duett | Kunden finnes på telefon |
| 4 | To kunder med samme e-post | Ingen ordre, merknad |
| 5 | 25 sekker, «Til 2. etasje (+20 kr/sekk)» | 3 linjer, bæring 25 × 16,00 eks. mva |
| 6 | Telefonbestilling «Bæres inn», pris passer med et tillegg | Tillegget regnes ut, ordre lages |
| 7 | Totalpris stemmer ikke med sekker og bæring | Ingen ordre, merknad med begge tallene |
| 8 | Totalpris «avtales» eller tom | Ingen ordre, merknad |
| 9 | Nettbestilling uten navn | Ingen ordre, merknad «mangler navn» |
| 10 | Adresse Kartverket ikke finner | Ingen ordre, merknad «fant ikke postnummer» |
| 11 | Trykk «levert» to ganger raskt (to faner) | Én ordre (lås + `orderReference`-sjekk) |
| 12 | «Betalt og levert», eller «Marker som betalt» etterpå | Ingen kall mot Duett |
| 13 | «Angre», så «levert» igjen | Ingen ny ordre, varsel om ordren i Duett |
| 14 | Duett svarer 401/403/500, eller nett nede | Status i arket er endret, merknad og «Prøv igjen» |
| 15 | `duett_på` = nei | Bare status i arket, ingen kall mot Duett |
| 16 | Nøkler for et annet selskap | Stopp før skriving, merknad |
| 17 | POST gir 409 | Ordren finnes via `orderReference`, nummeret skrives i arket |
| 18 | Vedabonnement («… per levering») | Beløpet leses riktig, én ordre per levert rad |

## Senere: automatisk sending (ikke en del av denne runden)

Anders har spurt om fakturaen kan sendes automatisk når han trykker
«levert». API-et kan det (`config.directInvoicing: true` og
`sendMethod: "email"`), men en sendt faktura kan bare rettes med kreditnota.
Avtalt 2026-10-28: først bare kladd, for å teste. Når tallene har stemt en
stund, kan det vurderes:

- automatisk sending bare for «Bare levert», og bare når navn, postnummer,
  e-post og sum er i orden; ellers blir ordren liggende som kladd,
- «Betalt og levert» gjør fortsatt ingenting i Duett,
- en bryter `duett_send` = `ja`/`nei` i Script Properties,
- `CLAUDE.md` i regnskap-duett oppdateres først, siden regelen i dag er at
  ingenting skrives i Duett uten godkjenning.

## Avklart med Anders 2026-10-28

1. Bare kladd (`saved`) i første omgang, for å teste.
2. «Betalt og levert» gjør ingenting i Duett.
3. «Lag alt»: standardvalgene over (navnefelt i skjemaet, prosjekt 198 «Ved»,
   bæring på «Tjeneste», vår referanse settes i «Koble til Duett») er brukt.
   Kan endres.

## Det som gjenstår

- Skrivetilgang (OrderWrite) fra Duett. E-postutkast til api@duett.no ligger i
  Gmail, ikke sendt.
- Nøklene legges inn med «Koble til Duett», og bryteren slås på.
- Én ekte testbestilling med Anders som kunde. Bekreft i Duett at kladden
  havner under «Startede ordre», at kundenummeret ble laget, og at summen er
  riktig. Oppdater `regnskap-duett/docs/duett-api.md` med det som da er
  observert.
