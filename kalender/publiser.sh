#!/usr/bin/env bash
# Laster kalender.gs opp til Apps Script og oppdaterer nettapp-versjonen, så nettsiden bruker den nye koden.
# Krever: `npm i -g @google/clasp`, `clasp login` (én gang, med Google-kontoen som eier regnearket),
# og skript-ID-en i .clasp.json. Se kalender/README.md.
set -euo pipefail
cd "$(dirname "$0")/.."

if grep -q SETT_INN_SKRIPT_ID .clasp.json; then
  echo "Legg skript-ID-en inn i .clasp.json først (Apps Script → Prosjektinnstillinger → Skript-ID)." >&2; exit 1
fi
if [ ! -f "$HOME/.clasprc.json" ]; then
  echo "Ikke logget inn. Kjør: clasp login" >&2; exit 1
fi

# Nettapp-adressen i config.py inneholder implementerings-ID-en. Vi oppdaterer den, så adressen er den samme.
DEPLOYMENT_ID="$(grep -o 'macros/s/[^/"]*' config.py | head -1 | sed 's#macros/s/##')"
[ -n "$DEPLOYMENT_ID" ] || { echo "Fant ingen calendar_url i config.py." >&2; exit 1; }

BESKRIVELSE="${1:-$(git log -1 --format='%h %s' -- kalender/kalender.gs)}"
echo "Laster opp kalender.gs …"
clasp push --force
echo "Ny versjon av implementeringen $DEPLOYMENT_ID …"
clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "$BESKRIVELSE"
echo "Ferdig. Sjekk at kalenderen svarer:"
curl -s -L -m 30 "$(grep -o 'https://script.google.com/macros/s/[^"]*' config.py | head -1)" | head -c 200; echo
