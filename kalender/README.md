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

Kalenderen er et Google-regneark med et lite skript. Nettsiden spør regnearket hvor mye tid som alt er bestilt hver dag, og legger inn en ny rad for hver bestilling. Skriptet sender så bestillingen til dere på e-post og en bekreftelse til kunden. Det er også herfra eiersiden henter bestillingene.

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
- **Betalt og levert** eller **Bare levert** når veden er kjørt ut. Er den bare levert, står det «Levert, ikke betalt», og du kan trykke **Marker som betalt** når pengene er kommet. Øverst ser du hvor mange som er levert, men ikke betalt. Kolonnen **Betalt** i arket blir `ja`. **Avbestill** gjør tiden ledig igjen for andre kunder. Trykket feil? Trykk **Angre**.
- **Sett dagen som full:** knappen ved hver dag, eller «Sett en dag som full» for en dag uten bestillinger. Kundene ser da dagen som «Fullt» i skjemaet. Bestillinger som er lagt inn, blir stående. Trykk **Åpne dagen igjen** for å angre.
- **Legg inn telefonbestilling:** minuttene regnes ut av seg selv, og bestillingen teller med i kapasiteten.
- **Skriv ut:** gir en kjøreliste med én dag per side, uten knapper og avbestilte leveringer.
- **Tidligere:** viser leveringer som er gjennomført.

Siden er skjult for Google. Uten riktig passord får man ikke se noe, og kundedataene ligger bare i regnearket deres.

### Daglig bruk

- **Avbestilling:** trykk «Avbestill» på eiersiden. Tiden blir ledig med en gang.
- **Flytte en levering:** endre datoen i arket.
- **Telefonbestilling:** bruk «Legg inn telefonbestilling» på eiersiden.
- **Egne minutter:** endrer du minuttene for en telefonbestilling, brukes de som de er, og bestillingen tas ikke med i ruteberegningen. Det samme gjelder rader du skriver inn i arket selv (uten ID), og rader der kolonnen **Fast tid** er `ja`.
- **Steng en dag:** trykk «Sett dagen som full» på eiersiden. Eller legg datoen i `closed` i `config.py` (da vises dagen ikke i det hele tatt).
- **Levering samme dag** går ikke. Kunden kan tidligst velge dagen etter, og må bestille senest kl. 18 dagen før (`order_by_hour` i `config.py`). Kalenderen avviser også bestillinger til i dag eller tidligere.
- **Endre skriptet:** kjør `kalender/publiser.sh` (se «Publisere fra repoet» under). Gjør du det for hånd i stedet: lim inn koden, og velg **Implementer → Administrer implementeringer → Rediger → Ny versjon**, ellers brukes den gamle koden. Første gang etter at ruteberegningen kom med, ber Google om tilgang til å «koble til en ekstern tjeneste». Det er oppslagene hos Kartverket og OSRM.

Svarer ikke kalenderen (f.eks. nettfeil), går bestillingen likevel fram på e-post gjennom FormSubmit, med merknaden «ikke registrert i kalenderen». Da legger dere den inn i arket selv.

## E-posten om bestillingen kommer fra kalenderen (fra november 2026)

Før gikk bestillingen bare gjennom FormSubmit, og uke 44 i 2026 feilet 5 av 9 innsendinger fordi FormSubmit var nede. Nå sender skriptet selv e-posten, rett etter at raden er lagt i arket:

- Til `BESTILLING_TIL` med kopi til `BESTILLING_KOPI` (øverst i `kalender.gs`, hold dem like `ORDER_EMAIL` og `ORDER_CC` i `config.py`), med svar-til satt til kundens adresse.
- Bekreftelse til kunden, hvis e-postadressen ser gyldig ut.
- Svarer skriptet `mailed: true`, hopper nettsiden over FormSubmit. Svarer det `mailed: false` (kvote, manglende tilgang) eller mangler feltet (gammel versjon av skriptet), sendes bestillingen gjennom FormSubmit som før. Dere får derfor aldri to e-poster om samme bestilling fra én innsending.
- Google tillater 100 mottakere per dag fra en vanlig Gmail-konto. Hver bestilling bruker 2–3, så grensen er ca. 30 bestillinger om dagen.

**Dette må du gjøre én gang for at det skal virke:**

1. Lim inn den nye `kalender/kalender.gs` i Apps Script, og lagre.
2. Velg **Implementer → Administrer implementeringer → Rediger → Ny versjon → Implementer**.
3. Google ber om ny tilgang, fordi skriptet nå skal «sende e-post på dine vegne». Godkjenn den (enklest: kjør `godkjennEpost` fra editoren, se under). Til det er gjort, svarer skriptet `mailed: false`, og bestillingene går gjennom FormSubmit som før. Gjort 5.11.2026.
4. Send én testbestilling fra nettsiden, og sjekk at e-posten kommer fra skriptet (avsender er Google-kontoen som eier regnearket, med navnet «Follo Bjørkeved»). Fjern testbestillingen på eiersiden etterpå.

I GoatCounter ser du hvilken vei bestillingen gikk: «Bestillingen gikk via: kalender» eller «… formsubmit».

## Publisere fra repoet (clasp)

Googles verktøy [clasp](https://github.com/google/clasp) laster `kalender.gs` opp til Apps Script og lager ny versjon av nettappen fra kommandolinjen, så Claude kan oppdatere skriptet selv. Adressen som slutter på `/exec` blir den samme.

**Én gang, må gjøres av deg:**

1. Slå på Apps Script API for kontoen som eier regnearket (amkleven@gmail.com): https://script.google.com/home/usersettings → **Google Apps Script API: På**.
2. I en terminal: `npm i -g @google/clasp` (allerede gjort på denne maskinen), så `clasp login`. Nettleseren åpner seg, og du logger inn med samme konto. Innloggingen lagres i `~/.clasprc.json`.
3. Finn skript-ID-en: åpne regnearket → **Utvidelser → Apps Script → Prosjektinnstillinger (tannhjulet) → Skript-ID**. Legg den inn i `.clasp.json` i repoet (erstatt `SETT_INN_SKRIPT_ID`).

**Hver gang skriptet er endret:**

```bash
kalender/publiser.sh                 # clasp push + ny versjon av implementeringen i config.py
```

Trenger den nye koden ny tilgang (for eksempel «sende e-post» første gang), må du godkjenne det én gang: åpne Apps Script, last siden på nytt, velg funksjonen `godkjennEpost` i nedtrekksmenyen ved siden av **Kjør**, trykk **Kjør**, og godkjenn (Avansert → Gå til … → Tillat). Den sender en testmelding til `BESTILLING_TIL`, så du ser at det virker. `onOpen` kan ikke kjøres fra editoren. Til det er gjort, svarer skriptet `mailed: false` med grunnen i `mailError`, og bestillinger går gjennom FormSubmit.

### Automatisk publisering (GitHub Actions)

Hver push til `main` som endrer `kalender/` publiserer skriptet automatisk (`.github/workflows/kalender.yml`), så Claude kan oppdatere kalenderen uten at du kjører noe. Det trenger innloggingen din som en hemmelighet i GitHub. **Én gang:**

1. Slå på Apps Script API (punkt 1 over), hvis det ikke er gjort.
2. På PC-en, i en terminal: `npx @google/clasp@2.4.2 login` og logg inn med amkleven@gmail.com. (Bruk akkurat denne versjonen, så filen passer med den GitHub bruker.)
3. Vis innloggingen: `cat ~/.clasprc.json` (Mac/Linux) eller `type %USERPROFILE%\.clasprc.json` (Windows). Kopier hele teksten.
4. GitHub → repoet → **Settings → Secrets and variables → Actions → New repository secret**. Navn: `CLASPRC_JSON`, verdi: teksten du kopierte. Lagre.
5. Test: **Actions → Publiser kalenderskriptet → Run workflow**. Grønn hake = ferdig.

Innloggingen gir tilgang til Apps Script-prosjektene på kontoen. Del den aldri andre steder enn i GitHub-hemmeligheten. Vil du trekke tilgangen tilbake: https://myaccount.google.com/permissions → fjern clasp.

Filene `.clasp.json`, `.claspignore` og `kalender/appsscript.json` hører til dette. Manifestet sier at nettappen kjører som deg og er åpen for alle, som i oppsettet over.
