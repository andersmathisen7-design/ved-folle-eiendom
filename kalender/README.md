# Leveringskalender (valgfritt, men anbefalt)

Kunden velger leveringsdag i skjemaet. Vi kjører bare **mandag og tirsdag**, og har satt av **5 timer** per dag.

## Slik regnes en dag som full

Hver bestilling får en beregnet tid:

> kjøretid tur/retur fra Ås + lossing (10 min) + bæring (0,5 min per sekk, bare hvis kunden har valgt bæring)

| Eksempel | Tid | Antall per dag (5 t) |
|---|---|---|
| Ås, 50 sekker, ingen bæring | 20 + 10 = 30 min | ca. 10 |
| Ås, 50 sekker, bæring | 20 + 10 + 25 = 55 min | ca. 5 |
| Ski, 50 sekker, ingen bæring | 35 + 10 = 45 min | ca. 6 |
| Nesodden, 50 sekker, bæring | 70 + 10 + 25 = 105 min | ca. 2–3 |

Fordi kjøretiden i Ås er kort, får dere plass til flere bestillinger i Ås på samme dag. Når tiden som er igjen ikke rekker til en bestilling, vises dagen som **Fullt** for den kunden. En liten Ås-bestilling kan altså fortsatt få plass på en dag som er full for en kunde på Nesodden.

Alle tallene endrer du i `DELIVERY_DAYS` i `config.py`: dager, timer per dag, kjøretid per område, lossing, bæring, hvor mange uker fram kunden kan velge og stengte dager (ferie). Helligdager (f.eks. 2. påskedag og 2. pinsedag) hoppes over automatisk.

## Uten kalender

Er `calendar_url` tom, vises alle mandager og tirsdager som ledige. Da må dere selv legge fulle dager inn i `closed` i `config.py` og publisere på nytt.

## Sett opp kalenderen (ca. 10 min, gratis)

Kalenderen er et Google-regneark med et lite skript. Nettsiden spør regnearket hvor mye tid som alt er bestilt hver dag, og legger inn en ny rad for hver bestilling. Det er også herfra eiersiden henter bestillingene.

1. Lag et nytt Google-regneark, for eksempel «Vedlevering – kalender».
2. Velg **Utvidelser → Apps Script**. Slett det som står der, og lim inn alt fra `kalender/kalender.gs`.
3. Bytt ut `bytt-meg` øverst i skriptet (`ADMIN_NOKKEL`) med et langt, hemmelig passord på minst 12 tegn. Det er passordet til eiersiden. Ikke legg det inn i GitHub. Trykk lagre.
4. Trykk **Implementer → Ny implementering**. Velg type **Nettapp**.
   - Kjør som: **Meg**
   - Hvem har tilgang: **Alle**
5. Trykk **Implementer**, og godkjenn tilgangen med Google-kontoen din.
6. Kopier nettapp-adressen (slutter på `/exec`), og lim den inn som `calendar_url` i `DELIVERY_DAYS` i `config.py`. Publiser.

Etter første bestilling dukker arket **Bestillinger** opp, med én rad per levering:
ID, Leveringsdag, Minutter, Status, Navn, Telefon, Adresse, Område, Sekker, Bæring, Totalpris, E-post, Melding og Registrert.

## Eiersiden: follobjorkeved.no/admin/

Her ser dere alle bestillingene, sortert etter leveringsdag. Logg inn med `ADMIN_NOKKEL`. Nøkkelen huskes på telefonen eller PC-en til dere trykker «Logg ut».

- **Per dag:** antall leveringer, **antall sekker som skal på bilen**, og hvor mye av de 5 timene som er brukt.
- **Per bestilling:** navn, antall sekker, bæring, pris, beregnet tid og melding. Trykk på adressen for å åpne den i Google Maps, og på telefonnummeret for å ringe.
- **Status:** Ny (oransje strek, ikke ringt ennå) → **Bekreftet** → **Levert**. **Avbestill** gjør tiden ledig igjen for andre kunder.
- **Legg inn telefonbestilling:** minuttene regnes ut av seg selv, og bestillingen teller med i kapasiteten.
- **Skriv ut:** gir en kjøreliste med én dag per side, uten knapper og avbestilte leveringer.
- **Tidligere:** viser leveringer som er gjennomført.

Siden er skjult for Google. Uten riktig nøkkel får man ikke se noe, og kundedataene ligger bare i regnearket deres.

### Daglig bruk

- **Avbestilling:** trykk «Avbestill» på eiersiden. Tiden blir ledig med en gang.
- **Flytte en levering:** endre datoen i arket.
- **Telefonbestilling:** bruk «Legg inn telefonbestilling» på eiersiden.
- **Steng en dag:** legg inn en rad i arket med dato og `300` minutter. Eller legg datoen i `closed` i `config.py`.
- **Levering samme dag** går ikke. Kunden kan tidligst velge dagen etter, og må bestille senest kl. 18 dagen før (`order_by_hour` i `config.py`). Kalenderen avviser også bestillinger til i dag eller tidligere.
- **Endre skriptet:** etter endringer må du velge **Implementer → Administrer implementeringer → Rediger → Ny versjon**, ellers brukes den gamle koden.

Svarer ikke kalenderen (f.eks. nettfeil), går bestillingen likevel fram på e-post, med merknaden «ikke registrert i kalenderen». Da legger dere den inn i arket selv.
