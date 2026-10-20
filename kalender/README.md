# Leveringskalender (valgfritt, men anbefalt)

Kunden velger leveringsdag i skjemaet. Vi kjører bare **mandag og tirsdag**, og har satt av **5 timer** per dag.

## Slik regnes en dag som full

Kalenderen legger en rute for hver dag: fra lageret i Ås, innom alle som skal ha ved, og tilbake. Den velger rekkefølgen som gir kortest kjøretid. Dagen er brukt opp når

> kjøretiden for hele runden + lossing (10 min per bestilling + 0,5 min per sekk) + bæring (0,5 min per sekk, bare hvis kunden har valgt bæring)

blir mer enn 5 timer.

Kjøretiden hentes fra to gratis tjenester uten nøkkel eller konto:

- **Kartverket** finner koordinatene til adressen kunden skriver.
- **OSRM** (ruteberegning på OpenStreetMap) gir kjøretiden mellom alle stoppene. Tallet ganges med 1,2, fordi OSRM regner med personbil (`RUTE_TILLEGG` i `kalender.gs`).

Derfor koster to bestillinger i samme nabolag nesten bare lossetiden for den andre. Fem bestillinger i Ski samme dag blir én tur til Ski, ikke fem.

Når kunden har skrevet adressen i skjemaet, spør nettsiden kalenderen hvilke dager akkurat den adressen får plass, og viser de andre som **Fullt**. Før adressen er skrevet, vises et anslag ut fra kjøretiden per område i `config.py`.

Finner ikke Kartverket adressen, eller svarer ikke OSRM, brukes de faste minuttene per område for den bestillingen, akkurat som før. Lagerets plassering står i `LAGER` øverst i `kalender.gs`.

### Eiersiden viser ruten

På eiersiden står bestillingene for hver dag i kjørerekkefølge, nummerert, med minutter fra forrige stopp. Lenken **Åpne ruten i Google Maps** gir hele runden med stoppene som ikke er levert ennå. Gamle bestillinger og telefonbestillinger slås opp automatisk når eiersiden lastes.

Alle tallene endrer du i `DELIVERY_DAYS` i `config.py`: dager, timer per dag, kjøretid per område (brukes som anslag og reserve), lossing, bæring, hvor mange uker fram kunden kan velge og stengte dager (ferie). Helligdager (f.eks. 2. påskedag og 2. pinsedag) hoppes over automatisk.

## Uten kalender

Er `calendar_url` tom, vises alle mandager og tirsdager som ledige. Da må dere selv legge fulle dager inn i `closed` i `config.py` og publisere på nytt.

## Sett opp kalenderen (ca. 5 min, gratis)

Kalenderen er et Google-regneark med et lite skript. Nettsiden spør regnearket hvor mye tid som alt er bestilt hver dag, og legger inn en ny rad for hver bestilling. Det er også herfra eiersiden henter bestillingene.

Regnearket **«Follo Bjørkeved – leveringskalender»** er allerede laget i Google Drive (amkleven@gmail.com). Det er privat, så bare du har tilgang. Ikke del det med andre enn de som skal se kundedataene.

1. Åpne regnearket, og velg **Utvidelser → Apps Script**.
2. Slett det som står der, og lim inn alt fra `kalender/kalender.gs`. Trykk **lagre** (diskettikonet).
3. Trykk **Implementer → Ny implementering**. Klikk tannhjulet og velg **Nettapp**.
   - Kjør som: **Meg**
   - Hvem har tilgang: **Alle**. Dette må til for at kundene kan bestille. Uten innlogging får man bare vite hvor mange minutter som er bestilt per dag, aldri kundedata.
4. Trykk **Implementer**, og godkjenn tilgangen med Google-kontoen din. Google viser en advarsel om at appen «ikke er bekreftet». Det er vanlig for egne skript: velg **Avansert → Gå til … (usikkert)**. Det er ditt eget skript.
5. Kopier nettapp-adressen (slutter på `/exec`). Lim den inn som `calendar_url` i `DELIVERY_DAYS` i `config.py`, eller send den til Claude.
6. Gå tilbake til regnearket og last siden på nytt. Du får en ny meny, **Vedlevering**. Velg **Vedlevering → Lag nytt passord til eiersiden**, godkjenn én gang til, og velg menyvalget igjen. Passordet vises **én gang**. Lagre det i en passordbehandler eller skriv det ned.

## Sikkerhet

- **Passordet** lages tilfeldig av skriptet (20 tegn). Det lagres bare som en saltet SHA-256-sjekksum i skriptets egne innstillinger, ikke i koden, i GitHub eller i nettleseren.
- **Innlogging:** eiersiden får en tilfeldig billett som utløper etter 12 timer. Med «Husk meg» utløper den etter 30 dager. Passordet selv lagres ikke på telefonen. «Logg ut» gjør billetten ugyldig.
- **Mistet telefonen?** Velg **Vedlevering → Logg ut alle enheter**, eller lag et nytt passord. Da virker ingen gamle innlogginger.
- **Gjetting:** etter 10 feil passord på 15 minutter stenges innloggingen i 15 minutter.
- **Kundedata** sendes bare til den som er logget inn, og bare med POST, aldri i nettadressen. Eiersiden er skjult for Google og har en streng sikkerhetsregel (Content Security Policy), slik at bare sidens egen kode kan kjøre der.
- **Arket kan ikke lures:** tekst kundene skriver, lagres alltid som ren tekst. Noe som `=IMPORTXML(…)` blir aldri en formel.
- **Falske bestillinger:** kalenderen godtar bare mandager og tirsdager fra i morgen og 6 uker fram, og maks 30 nettbestillinger i timen. Avbestill eventuelle falske bestillinger på eiersiden.

## Eiersiden: follobjorkeved.no/admin/

Her ser dere alle bestillingene, sortert etter leveringsdag. Logg inn med passordet fra menyen **Vedlevering** i regnearket. Kryss av for «Husk meg» på din egen telefon.

- **Per dag:** antall leveringer, **antall sekker som skal på bilen**, og hvor mye av de 5 timene som er brukt.
- **Per bestilling:** navn, antall sekker, bæring, pris, beregnet tid og melding. Trykk på adressen for å åpne den i Google Maps, og på telefonnummeret for å ringe.
- **Levert** når veden er kjørt ut. **Avbestill** gjør tiden ledig igjen for andre kunder. Trykket feil? Trykk **Angre**.
- **Legg inn telefonbestilling:** minuttene regnes ut av seg selv, og bestillingen teller med i kapasiteten.
- **Skriv ut:** gir en kjøreliste med én dag per side, uten knapper og avbestilte leveringer.
- **Tidligere:** viser leveringer som er gjennomført.

Siden er skjult for Google. Uten riktig passord får man ikke se noe, og kundedataene ligger bare i regnearket deres.

### Daglig bruk

- **Avbestilling:** trykk «Avbestill» på eiersiden. Tiden blir ledig med en gang.
- **Flytte en levering:** endre datoen i arket.
- **Telefonbestilling:** bruk «Legg inn telefonbestilling» på eiersiden.
- **Egne minutter:** endrer du minuttene for en telefonbestilling, brukes de som de er, og bestillingen tas ikke med i ruteberegningen. Det samme gjelder rader du skriver inn i arket selv (uten ID), og rader der kolonnen **Fast tid** er `ja`.
- **Steng en dag:** legg inn en rad i arket med dato og `300` minutter. Eller legg datoen i `closed` i `config.py`.
- **Levering samme dag** går ikke. Kunden kan tidligst velge dagen etter, og må bestille senest kl. 18 dagen før (`order_by_hour` i `config.py`). Kalenderen avviser også bestillinger til i dag eller tidligere.
- **Endre skriptet:** etter endringer må du velge **Implementer → Administrer implementeringer → Rediger → Ny versjon**, ellers brukes den gamle koden. Første gang etter at ruteberegningen kom med, ber Google om tilgang til å «koble til en ekstern tjeneste». Det er oppslagene hos Kartverket og OSRM.

Svarer ikke kalenderen (f.eks. nettfeil), går bestillingen likevel fram på e-post, med merknaden «ikke registrert i kalenderen». Da legger dere den inn i arket selv.
