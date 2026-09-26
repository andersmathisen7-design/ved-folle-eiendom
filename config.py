"""
Alt som skal kunne endres uten å røre resten av koden ligger her.
Endre verdiene, kjør `python3 build.py`, og nettsiden i public/ er oppdatert.
"""

# Domenet siden skal ligge på (brukes i canonical-lenker, sitemap og strukturerte data).
SITE_URL = "https://follobjorkeved.no"

BRAND = "Follo Bjørkeved"

# Bestillinger sendes hit (via FormSubmit.co). Første bestilling utløser en
# aktiverings-e-post til denne adressen som må bekreftes én gang.
# Etter aktivering gir FormSubmit en tilfeldig kode (f.eks. "a1b2c3...") som kan
# settes inn her i stedet for e-postadressen, slik at adressen ikke er synlig i kildekoden.
ORDER_EMAIL = "amkleven@gmail.com"

COMPANY = {
    "legal_name": "Follo Eiendomsservice AS",
    "org_nr": "926 837 087",
    "phone": "+47 48 99 39 00",
    "phone_display": "48 99 39 00",
    "email": "post@min-eiendom.no",
    "street": "Smebølveien 3",
    "postal_code": "1433",
    "city": "Ås",
    "region": "Akershus",
    "facebook": "https://www.facebook.com/profile.php?id=100063745684398",
    "main_site": "https://folloes.no/",
}

# Priser hentet fra folloes.no/salg-av-bjorkeved/ (september 2026).
PRODUCT = {
    "name": "Bjørkeved i 40-liters sekk",
    "price": 89,              # kr per sekk
    "vat_text": "inkl. mva",  # sjekk med regnskapsfører at prisen er inkl. mva
    "liters": 40,
    "kg": 14,
    "length_cm": 30,
    "diameter_cm": "5–12",
}

# Bæring, tillegg per bestilling (fra gammel side: legges på én gang, ikke per sekk).
CARRY_OPTIONS = [
    ("ingen", "Ingen bæring – settes ved innkjørsel", 0),
    ("ute-15", "Utendørs 0–15 meter", 12),
    ("ute-50", "Utendørs 15–50 meter", 16),
    ("garasje", "Inn i garasje", 15),
    ("kjeller-15", "Til kjeller, 0–15 meter", 16),
    ("kjeller-50", "Til kjeller, 15–50 meter", 20),
    ("etg-1", "Til 1. etasje", 16),
    ("etg-2", "Til 2. etasje", 20),
    ("etg-3", "Til 3. etasje", 24),
    ("etg-4", "Til 4. etasje", 28),
    ("etg-5", "Til 5. etasje", 34),
    ("etg-6", "Til 6. etasje", 36),
]

# Hjemlevering i kroner per bestilling (samme som gammel side). None = "avtales".
DELIVERY_FEE = 499

# Google Search Console-bekreftelse (meta-tag på forsiden).
GOOGLE_SITE_VERIFICATION = "vnXKmoMZizKbBLImYNoyt1EmqXKDaXkpEYQngFIkxhA"

# Besøksstatistikk (GoatCounter: gratis, uten cookies, trenger ikke samtykkebanner).
# Dashbord: https://follobjorkeved.goatcounter.com
GOATCOUNTER = "follobjorkeved"

# Valgfritt: måle-ID-er. La stå tomme til kontoene er opprettet.
# GA4: "G-XXXXXXX". Google Ads: "AW-XXXXXXX" og konverteringsetikett "AW-XXXXXXX/abcDEF".
GA4_ID = ""
GADS_ID = ""
GADS_CONVERSION = ""
META_PIXEL_ID = ""

# Leveringsområder. Hvert område får sin egen landingsside (viktig for lokalt søk).
AREAS = [
    {
        "slug": "ved-as",
        "name": "Ås",
        "kommune": "Ås kommune",
        "places": ["Ås sentrum", "Nordby", "Vinterbro", "Kroer", "Brekke", "Togrenda", "Solberg"],
        "postnr": "1430–1435 og 1407",
        "intro": "Vi holder til i Smebølveien i Ås. Her er vi raskest ute, og det er her vi kjører flest turer.",
    },
    {
        "slug": "ved-ski",
        "name": "Ski og Langhus",
        "kommune": "Nordre Follo kommune",
        "places": ["Ski sentrum", "Langhus", "Siggerud", "Kråkstad", "Skotbu", "Finstadjordet", "Hebekk"],
        "postnr": "1400–1409",
        "intro": "Ski og Langhus ligger rett ved lageret vårt i Ås. Vi kjører hit flere ganger i uka i fyringssesongen.",
    },
    {
        "slug": "ved-kolbotn",
        "name": "Kolbotn og Oppegård",
        "kommune": "Nordre Follo kommune",
        "places": ["Kolbotn", "Oppegård", "Sofiemyr", "Tårnåsen", "Greverud", "Myrvoll", "Svartskog"],
        "postnr": "1410–1421",
        "intro": "Mange i Kolbotn og Oppegård bor i leilighet eller rekkehus. Vi bærer veden opp trapper eller ned i kjelleren.",
    },
    {
        "slug": "ved-vestby",
        "name": "Vestby og Son",
        "kommune": "Vestby kommune",
        "places": ["Vestby sentrum", "Son", "Hølen", "Pepperstad", "Garder", "Hvitsten"],
        "postnr": "1540–1556",
        "intro": "Fra Ås er vi kort unna Vestby, Son og Hølen. Vi leverer både til hytter ved sjøen og til boliger inne i landet.",
    },
    {
        "slug": "ved-drobak",
        "name": "Drøbak",
        "kommune": "Frogn kommune",
        "places": ["Drøbak sentrum", "Heer", "Dal", "Seiersten", "Ullerud", "Skiphelle"],
        "postnr": "1440–1449",
        "intro": "Trange gater og bratte bakker i Drøbak? Vi bærer sekkene helt inn, så du slipper å dra dem selv.",
    },
    {
        "slug": "ved-nesodden",
        "name": "Nesodden",
        "kommune": "Nesodden kommune",
        "places": ["Nesoddtangen", "Fagerstrand", "Bjørnemyr", "Fjellstrand", "Berger", "Tangenåsen"],
        "postnr": "1450–1459",
        "intro": "Vi kjører ved til hele Nesodden, fra Fagerstrand til Nesoddtangen. Det gjelder både boliger og hytter.",
    },
    {
        "slug": "ved-enebakk",
        "name": "Enebakk",
        "kommune": "Enebakk kommune",
        "places": ["Ytre Enebakk", "Kirkebygda", "Flateby", "Mjær"],
        "postnr": "1911–1914",
        "intro": "Vi leverer tørr bjørkeved i hele Enebakk. Er du usikker på om vi kommer til deg, ring oss.",
    },
]

FAQ = [
    ("Hva koster bjørkeved hos dere?",
     "En 40-liters sekk med tørr bjørkeved koster {price} kr {vat}. Vil du ha veden båret inn, koster det 12–36 kr ekstra per bestilling. Prisen avhenger av hvor langt og hvor høyt den skal bæres. Hjemlevering koster {delivery} kr per bestilling. Du ser totalprisen i skjemaet før du sender bestillingen."),
    ("Hvor leverer dere ved?",
     "Vi leverer i hele Follo: Ås, Ski, Langhus, Kolbotn, Oppegård, Vestby, Son, Drøbak, Nesodden og Enebakk."),
    ("Hva koster levering?",
     "Hjemlevering koster {delivery} kr per bestilling, uansett hvor mange sekker du bestiller. Vi leverer i hele Follo. Bæring kommer i tillegg hvis du vil ha det."),
    ("Hvor mye ved er det i en sekk?",
     "Hver sekk er på 40 liter og veier ca. {kg} kg. Kubbene er ca. {length} cm lange og {dia} cm tykke, så de passer i de fleste ovner og peiser."),
    ("Er veden tørr?",
     "Ja. Veden er tørket og lagret under tak, så den holder seg tørr og er klar til bruk med en gang. Den er produsert etter norsk standard og har høy brennverdi."),
    ("Hvor mange sekker trenger jeg?",
     "Det kommer an på hvor mye du fyrer. Tenk på det slik: En sekk rekker omtrent 1–2 kvelder med peisen. Fyrer du nesten hver kveld hele vinteren, går det gjerne 30–60 sekker. Ring oss hvis du vil ha hjelp til å regne ut."),
    ("Kan dere bære veden inn?",
     "Ja. Vi kan sette sekkene i garasjen, i kjelleren eller helt opp til 6. etasje. Du velger dette i bestillingsskjemaet."),
    ("Hvordan bestiller jeg?",
     "Fyll ut skjemaet på siden. Da får vi bestillingen med en gang, og vi tar kontakt for å avtale leveringsdag. Du kan også ringe oss på {phone}."),
    ("Hvordan betaler jeg?",
     "Vi avtaler betaling når vi ringer for å bekrefte bestillingen. Du betaler ingenting når du sender skjemaet."),
]

# Lokale tall per kommune (vises på områdesidene og i artikkelen om vedfyring i Follo).
# Kilder: SSB 07459 (innbyggere 1.1.2026), 14917 (husstander 2025), 05467 (fritidsbygg 2026).
# Vedfyrende husstander er et anslag: Akershus-snittet 51 % (SSB 09703, 2025) × husstander.
KOMMUNE_STATS = {
    "Nordre Follo kommune": {"innbyggere": 65381, "husstander": 26593, "enebolig": 9562, "enebolig_pst": 36, "smahus_pst": 65.9, "hytter": 463},
    "Ås kommune": {"innbyggere": 22725, "husstander": 10925, "enebolig": 4569, "enebolig_pst": 42, "smahus_pst": 59.9, "hytter": 544},
    "Nesodden kommune": {"innbyggere": 21005, "husstander": 8770, "enebolig": 5009, "enebolig_pst": 57, "smahus_pst": 84.5, "hytter": 1432},
    "Vestby kommune": {"innbyggere": 20167, "husstander": 8467, "enebolig": 4472, "enebolig_pst": 53, "smahus_pst": 78.2, "hytter": 1545},
    "Frogn kommune": {"innbyggere": 16429, "husstander": 7590, "enebolig": 4295, "enebolig_pst": 57, "smahus_pst": 74.3, "hytter": 2886},
    "Enebakk kommune": {"innbyggere": 11697, "husstander": 4682, "enebolig": 3182, "enebolig_pst": 68, "smahus_pst": 89.6, "hytter": 1032},
}
WOOD_SHARE = 0.51        # andel husstander i Akershus som fyrer med ved (SSB 09703, 2025)
KG_PER_HOUSEHOLD = 655   # kg ved per vedfyrende husstand i Akershus (SSB 09703, 2025)
FEIER = {"default": "Follo Brannvesen IKS (tlf. 64 85 10 00)", "Vestby kommune": "Vestby kommune – sjekk kommunens nettside for hvem som feier"}

# «Lønner det seg å fyre i dag?» (/fyre-i-dag/). Dagens strømpris hentes fra hvakosterstrommen.no i nettleseren.
# Verdiene under brukes til å regne ut hva strømmen faktisk koster per kWh, og hva varmen fra ved koster.
STROM = {
    "zone": "NO1",                 # Follo ligger i prisområde NO1 (Øst-Norge)
    "support_threshold": 0.77,     # strømstøtte 2026: terskel i kr/kWh eks. mva, per time (NVE)
    "support_share": 0.90,         # strømstøtte: andel av prisen over terskelen som dekkes
    "norgespris_kr": 0.50,         # Norgespris i kr/kWh inkl. mva (ut 2026)
    "markup_kr": 0.0,              # påslag i strømavtalen, kr/kWh eks. mva (vanlige spotavtaler: ca. −2 til +7 øre)
    # Elvia energiledd fra 1.7.2026, inkl. elavgift, Enova-avgift og mva (elvia.no):
    "nett_day_ore": 46.40,         # hverdager kl. 06–22
    "nett_night_ore": 31.40,       # natt (22–06), helg og helligdager
    "kwh_per_kg": 4.32,            # NIBIO: 1 kg tørr ved (20 % fuktighet) gir 4,32 kWh
    "efficiency": 0.75,            # virkningsgrad i ny, rentbrennende ovn (SSB: 70–80 %)
    "cop": 3,                      # luft-til-luft-varmepumpe, årsvarmefaktor (Norsk Varmepumpeforening)
    "no_mva_zones": ["NO4"],       # Nord-Norge: ingen mva på strøm
}

# Vedprisindeksen (/vedpris/). Dataene ligger i src/data/vedpriser-2026.csv.
VEDPRIS = {
    "name": "Sekkprisindeksen",
    "year": 2026,
    "collected": "2026-09-26",
    "csv": "vedpriser-2026.csv",
    # Hovedfunnene (vises øverst på siden). Oppdater når prisene samles inn på nytt.
    "funn": [
        "**Kjedene har nesten samme pris.** Seks av ni kjeder tar 89 kr (Byggmax 88,95 kr) for en 40-liters sekk bjørk. Billigst er Obs Bygg og jem & fix med 77,90 kr.",
        "**Levering kan koste mer enn veden.** Lokale selgere tar 350–590 kr for levering. Kjøper du 10 sekker, legger det til 35–59 kr per sekk.",
        "**Storsekk er ca. 20 prosent billigere per liter.** Medianen er ca. 72 kr per 40 liter, mot 89 kr for en sekk fra en kjede. Da må du ha plass og kunne stable selv.",
        "**Samme pris i fire byer.** Nettbutikkene Oslo, Bergen, Trondheim og Stavanger Vedsentral tar alle 109 kr for 40 liter norsk bjørk.",
        "**Tørr ved er utsolgt flere steder på Østlandet.** Lier ASVO, Vedslottet og Empo i Ski var utsolgt da vi sjekket, og Oslo Vedhandel var tom for den billigste sekken.",
        "**Dyrest var Julelevering med 149 kr per sekk**, inkludert levering. Billigst per sekk var Vedhandel på Gjerdrum med 69 kr, men da må du hente selv og kjøpe minst 10.",
    ],
    # Andre prisoversikter vi viser til (bygger på annonser, ikke butikkpriser).
    "andre": [
        ("Vedbod: vedprisindeks fra annonser", "https://www.vedbod.no/vedprisindeks/"),
        ("Vednett: vedpriser", "https://www.vednett.no/vedpriser"),
    ],
}
