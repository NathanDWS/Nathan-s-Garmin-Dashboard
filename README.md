# Gezondheid & Training — persoonlijk Garmin-dashboard

Een rustig, lokaal dashboard voor je Garmin-data: slaap, herstel, trainingen, stappen en gewicht,
plus een Claude-coach die je vragen over je eigen data beantwoordt. Meerdere Garmin-accounts
(bijvoorbeeld jij en je vader) in één dashboard, te kiezen via de profielknop bovenin.

Alles draait op je eigen computer. Je data staat in `data/` en gaat nergens heen, behalve:
Garmin Connect (ophalen), Claude (alleen als je de coach gebruikt) en OpenStreetMap (kaartachtergrond bij routes).

Gebaseerd op twee open-source projecten (licenties in `LICENSES/`):
[garmin-claude-dashboard](https://github.com/aaronparton2-sketch/garmin-claude-dashboard) (MIT) voor de opzet van de UI, en
[garmin-stats-ai](https://github.com/dandwhelan/garmin-stats-ai) voor het ophalen bij Garmin, de analyses en de coach.

## Installeren

Nodig: **Python 3.12+** en **Node.js 20+**.

```powershell
.\start.ps1
```

De eerste keer maakt dit een Python-omgeving, installeert alles, bouwt de frontend en opent
`http://localhost:8765`. Daarna start je het steeds met hetzelfde commando (sneller met `-NoBuild`).

Je ziet eerst een **voorbeeldprofiel** met verzonnen data. Klik op **Koppel je Garmin** of kies
**Account toevoegen** in het profielmenu.

## Account toevoegen

Vul je naam, Garmin-e-mail en wachtwoord in. Vraagt Garmin om een verificatiecode, dan verschijnt
daar een veld voor. Het dashboard logt één keer in en bewaart daarna alleen een **login-token**
(`data/tokens/<profiel>/`, ongeveer een jaar geldig). Daarna wordt het afgelopen jaar opgehaald;
dat kan een half uur duren.

- **Wachtwoord onthouden** (optioneel): dan komt het wachtwoord in `.env`, zodat het dashboard zelf
  opnieuw kan inloggen als het token ooit verloopt. Zonder vinkje zie je dan "Verbinding verlopen"
  met een knop **Opnieuw verbinden**.
- Elke ochtend om 07:00 haalt het dashboard automatisch nieuwe data op (zolang het draait).
  Met **Nu verversen** kan het ook direct. Het uur pas je aan met `SYNC_HOUR` in `.env`.

## Coach

Zet je Anthropic API-key in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Herstart daarna het dashboard. Zonder key werkt de rest gewoon, en kun je met **Kopieer prompt** je
data in een eigen AI-chat plakken. De coach geeft geen medisch advies.

## Op je telefoon (thuis)

Bij het starten toont het venster een adres als `http://192.168.1.23:8765`. Open dat op je telefoon
op hetzelfde wifi-netwerk. Lukt het niet, sta dan poort 8765 toe in de Windows-firewall voor
**privénetwerken**.

## Voor iemand anders (bijv. je vader thuis)

Het dashboard is alleen bereikbaar in jouw huis. Woont hij ergens anders, dan kopieert hij deze map
(zonder `data/` en `.env`) naar zijn eigen pc, draait `.\start.ps1` en voegt daar zijn account toe.

## Let op: onofficiële Garmin-koppeling

Garmin heeft geen API voor particulieren. Dit dashboard logt in zoals de Garmin Connect-app, via de
community-library `python-garminconnect`. Dat is **niet officieel toegestaan** volgens Garmin's
voorwaarden; Garmin kan het op elk moment blokkeren. Gebruik een sterk, uniek wachtwoord.
Het dashboard haalt hooguit één keer per dag automatisch op.

## Ontwikkelen

```powershell
.venv\Scripts\python -m pytest backend/tests
```

```powershell
cd frontend; npm test
```

Frontend met hot reload: start de backend (`.\start.ps1 -NoBuild -NoBrowser`) en draai in `frontend/` `npm run dev`
(proxy naar poort 8765).
