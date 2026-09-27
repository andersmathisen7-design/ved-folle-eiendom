# Innhold som rangerer og blir sitert

## Stedssider (lokalt søk)

Folk søker «ved Ski», ikke «ved Follo». Lag én side per sted med reelt søkevolum:

- URL: `/{tjeneste}-{sted}/` (f.eks. `/ved-ski/`), uten æøå.
- Tittel: `{Tjeneste} i {sted} – {fordel}, {pris} | {Merke}`.
- H1: `{Produkt} levert i {sted}`.
- Liste over tettsteder og postnumre på stedet.
- 3 stedsspesifikke FAQ-er («Leverer dere i X?», «Hva koster det levert i X?», «Hvor raskt?») + noen felles.
- **Lokale fakta med kilde** så siden ikke er en tynn kopi: f.eks. innbyggere, husstander, andel eneboliger, hytter (SSB-tabeller), lokale regler (feiing, luftkvalitet) med lenker.
- Skjema med stedet forhåndsvalgt, prisblokk, «slik gjør du det», lenker til de andre stedene.

## Artikler

Mal (Markdown med hode):

```markdown
---
title: Er ved billigere enn strøm i 2026?
description: Kort tekst til Google (maks ca. 155 tegn), gjerne med tallet.
date: 2026-09-25
updated: 2026-09-25
kort: 2–4 setninger som svarer direkte, med konkrete tall og kilde. Dette er teksten AI-er og Google løfter ut.
faq: Spørsmål? || Svar med tall.
faq: Spørsmål 2? || Svar.
---
Innledning (1–2 setninger, ærlig vinkel).

## Regnestykket
Tabell med tall …

## Kilder
- [SSB tabell …](https://…)
```

Regler:
- **Kort svar først** (vises som boks øverst). Svar på spørsmålet i tittelen med tall.
- Tittelen er spørsmålet folk stiller. Bruk årstall når svaret endrer seg.
- Tabeller for sammenligninger – AI-er og Google leser dem godt.
- Alle tall har kilde med lenke (SSB, Miljødirektoratet, DSB, bransjeforeninger, NVE …).
- Vær ærlig også når tallene ikke taler for deg («Vi selger ved, men vil gi deg de ekte tallene»). Det bygger tillit og blir oftere sitert.
- Lenk til relevante stedssider, verktøy og andre artikler. Avslutt med bestillingsknapp.
- «Oppdatert {dato}» synlig + `dateModified`. Oppdater tall hver sesong.

Gode artikkeltyper: pris i området, hvor mye trenger jeg (med kalkulator), X mot Y, hvordan sjekke kvalitet, lagring/bruk, sikkerhet/regler lokalt, tall per kommune, sesong/når kjøpe.

## Lenkemagneter (gir lenker fra aviser og andre sider)

| Type | Eksempel | Hvorfor |
|---|---|---|
| Egen prisindeks | «Sekkprisindeksen 2026»: 42 priser fra 31 selgere, kilde-URL per pris, median, CSV | Journalister trenger en kilde å lenke til |
| Dagsaktuelt verktøy | «Lønner det seg å fyre i dag?» – strømpris time for time mot ved | Blir aktuelt hver gang strømprisen stiger |
| Innbyggbare widgets | Kalkulator i `<iframe>` med kreditt-lenke tilbake | Hver innbygging = lenke |
| Åpne data | CSV med CC BY 4.0 + ferdig kildehenvisning | Brukes av aviser, skoler, kommuner |
| Presseside | Tall, bilder med fri bruk, kontakt | Dit sender du journalister |

Merk alle med `Dataset`/`WebApplication`-JSON-LD og list dem i llms.txt.
