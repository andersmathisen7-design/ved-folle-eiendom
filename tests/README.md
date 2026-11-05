# Tester

Kjøres lokalt på PC-en, aldri i GitHub Actions.

```bash
python3 build.py                      # tests/bestilling.test.js tester det ferdige nettstedet i public/
node tests/kalender.test.js           # e-posten kalenderskriptet lager (Node, uten Google)
node tests/bestilling.test.js         # bestillingsskjemaet i Chromium, med kalenderen, FormSubmit og GoatCounter mocket
```

`bestilling.test.js` trenger Playwright. Installer den utenfor repoet og pek NODE_PATH dit, f.eks.:

```bash
mkdir -p ~/pwtest && cd ~/pwtest && npm init -y && npm i playwright && npx playwright install chromium
cd - && NODE_PATH=~/pwtest/node_modules node tests/bestilling.test.js
```

Ingen ekte bestilling sendes: alle kall til kalenderen og FormSubmit fanges opp i testen.
