# Garmin Dashboard — ontwerp

Datum: 2026-11-23 · Map: `C:\Users\Nathan\Documents\Github\garmin-dashboard`

## Doel en waarom

Een persoonlijk dashboard om **gezondheid en trainingen** bij te houden, voor Nathan en zijn vader
(en eventueel anderen). Het combineert de beste delen van twee open-source projecten:

- **garmin-claude-dashboard** (MIT, Aaron Automates): mooie React/Tailwind-UI, pagina-indeling,
  periode-slicer, AI-coach-bubbel.
- **garmin-stats-ai** (BSD-3 / repo-licentie, dandwhelan): Python-ophaler voor Garmin Connect,
  lokale SQLite-opslag, analyses ten opzichte van je eigen baseline, multi-user, AI-agent met tools.

Succes = je opent het dashboard thuis, kiest een profiel bovenin, en ziet in één oogopslag hoe je
slaap, herstel en trainingen ervoor staan, zonder gedoe met inloggen of handmatig data ophalen.

## Doelen

- Strakke, rustige UI/UX: weinig ruis, duidelijke kaarten, goede grafieken, licht én donker thema.
- Draait lokaal op de pc; bereikbaar op het thuis-wifi (ook vanaf telefoon/laptop in huis).
- **Meerdere accounts** in hetzelfde dashboard, wisselen via een profielkeuze bovenin.
- **"Account toevoegen"** in de frontend: naam + Garmin-e-mail + wachtwoord (+ MFA-code indien nodig).
- Dagelijks automatisch nieuwe data ophalen per account, plus een "Nu verversen"-knop.
- AI-coach (Claude) die vragen beantwoordt over de data van het gekozen profiel.

## Niet-doelen

- Geen cloud-hosting, geen Vercel/Supabase, geen toegang van buiten het huis.
- Geen inlog/pincode per profiel — iedereen die het dashboard opent ziet alle profielen (bewust gekozen).
- Niet overgenomen (mijn voorstel, past niet bij "gezondheid + trainingen"): bloedwaarden, DEXA-scans,
  triathlon-raceplan, Grafana, Home Assistant, MCP-server, Bluetooth-weegschaaladapters, menstruatiecyclus.
  Kan later terugkomen.

## Anti-doelen

- Een dashboard dat vol staat met elke mogelijke grafiek (de valkuil van garmin-stats-ai).
- Data die stilletjes verouderd raakt: als ophalen faalt (verlopen login, 429), moet dat zichtbaar zijn.
- Medische uitspraken: de coach vergelijkt met je eigen baseline en stelt geen diagnoses.

## Beperkingen

- Garmin heeft geen API-key voor particulieren. Toegang gaat via de community-library
  `python-garminconnect` met je eigen login. Dat is officieel tegen Garmin's voorwaarden; risico ligt bij
  de gebruiker. Maximaal ~1× per dag automatisch ophalen (Garmin rate-limit).
- Eén Claude API-key (Anthropic) voor alle profielen, in `.env`. Nooit in de frontend of in git.
- Windows-pc als host.

## Aanpak (gekozen: 1)

1. **Lokaal: Python-backend + SQLite, React-frontend** — gekozen. Privé, gratis, geen cloud-accounts.
   Beste backend van de twee (ophaler + analyses uit garmin-stats-ai). Nadeel: alleen thuis — akkoord.
2. Cloud (Vercel + Supabase): overal bereikbaar, maar data + wachtwoorden extern en drie accounts beheren.
3. Hybride (lokaal ophalen, naar cloud pushen): dubbel bouw- en onderhoudswerk, overkill.

## Hoe het werkt (besloten)

**Architectuur**

```
garmin-dashboard/
  backend/    FastAPI (uit garmin-insights) + ophaler (uit garmin-grafana) + scheduler
  frontend/   React 19 + Vite + Tailwind 4 + Recharts (uit garmin-claude-dashboard)
  data/       per profiel: <profiel>.db (SQLite) + tokens/<profiel>/   (gitignored)
  .env        ANTHROPIC_API_KEY, optioneel per profiel GARMIN_PASSWORD_<PROFIEL>  (gitignored)
```

- De backend serveert de gebouwde frontend én de `/api/*`-endpoints op één poort, luisterend op het
  thuisnetwerk. Eén startscript (`start.ps1`) start alles.
- Frontend haalt data via `/api/...?profile=<id>` in plaats van via Supabase.

**Accounts en login**

- Formulier "Account toevoegen": weergavenaam, Garmin-e-mail, wachtwoord; als Garmin MFA vraagt,
  verschijnt een veld voor de code.
- Backend logt één keer in en bewaart de **Garmin-tokens** in `data/tokens/<profiel>/`. Daarmee hoeft
  niemand opnieuw in te loggen (tokens verversen zichzelf, ca. een jaar geldig).
- Vinkje **"Wachtwoord onthouden voor automatisch opnieuw inloggen"**: dan wordt het wachtwoord ook in
  `.env` gezet, zodat de ophaler zelf opnieuw kan inloggen als tokens ooit verlopen (wens van Nathan).
  Zonder vinkje: bij verlopen tokens toont het dashboard "Opnieuw verbinden".
- Profielenlijst in `data/profiles.json` (naam, e-mail, kleur, aangemaakt-op). Profiel verwijderen
  wist de database en tokens na bevestiging.
- Bij het toevoegen: eerste keer historie ophalen (standaard 1 jaar terug) op de achtergrond, met
  voortgang zichtbaar in de UI.

**Pagina's** (UI-basis uit garmin-claude-dashboard, opnieuw strak gestyled)

- **Vandaag / Overzicht**: herstel-score van vandaag (readiness, body battery, HRV-status, slaapscore),
  week-volume per sport, afwijkingen t.o.v. eigen baseline (uit garmin-stats-ai `insights`).
- **Trainingen**: lijst + filter per sport (hardlopen, fietsen, zwemmen, kracht, overig), maandvolume,
  tempo/HR-trend, VO2max, trainingsbelasting/-status. **Activiteit-detail** met kaart (GPS-route),
  splits en HR.
- **Slaap**: duur, score, fases over 60 nachten.
- **Herstel**: rust-HR, HRV, stress, body battery, ademhaling, bloedzuurstof (SpO2, als het horloge
  het meet), bloeddruk (alleen met Garmin Index BPM-meter of handmatig ingevoerd in Connect).
- **Lichaam**: gewicht/vetpercentage als er een weegschaal is, anders handmatige weging; stappen.
- **Trainingsdoelen**: weekdoelen per sport vs. wat je deed (instelbaar per profiel).
- **Coach**: chatpaneel (Claude, met de analyse-tools uit garmin-stats-ai) + "Kopieer prompt"-knop om
  gratis in een eigen chat te plakken.
- Op elke pagina de periode-slicer (Deze maand / 30 dagen / Dit jaar, met vergelijking).

**Ophalen**

- Scheduler in de backend: elke ochtend (bv. 07:00) per profiel incrementeel ophalen. "Nu verversen"-knop
  per profiel. Laatste sync-tijd + eventuele fout zichtbaar in de header.

## Aan de bouwer overgelaten (mijn keuzes, te corrigeren)

- UI-taal **Nederlands**, eenheden metrisch.
- Visuele stijl: neutraal, veel witruimte, één accentkleur per profiel, donker thema als standaard volgend
  op systeeminstelling.
- Exacte grafiekkeuzes per kaart, component-opbouw, API-vormen.
- Welke garmin-stats-ai-analyses op "Vandaag" komen (max. 3 meest relevante afwijkingen).
- Licenties: MIT- en BSD-licentieteksten meenemen in `LICENSES/`.
- Eerst bouwen en testen op voorbeelddata (uit garmin-claude-dashboard, omgezet naar het SQLite-schema);
  echte Garmin-koppeling als laatste stap.
