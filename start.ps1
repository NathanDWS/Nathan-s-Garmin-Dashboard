# Start het Garmin-dashboard.  Gebruik:  .\start.ps1   (of  .\start.ps1 -NoBuild  /  -NoBrowser)
param([switch]$NoBuild, [switch]$NoBrowser)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw "Python 3.12 of nieuwer is nodig: https://www.python.org/downloads/" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Node.js 20 of nieuwer is nodig: https://nodejs.org/" }

$py = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "Eerste keer: Python-omgeving maken..."
    python -m venv .venv
    & $py -m pip install --quiet --upgrade pip
    & $py -m pip install --quiet -e backend/vendor/garmin_grafana -e backend/vendor/garmin_insights -e backend
    if ($LASTEXITCODE -ne 0) { throw "Installeren van de backend is mislukt." }
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Bestand .env aangemaakt. Zet je ANTHROPIC_API_KEY erin voor de coach (optioneel)."
}

if (-not $NoBuild -or -not (Test-Path "frontend\dist\index.html")) {
    Write-Host "Frontend bouwen..."
    Push-Location frontend
    try {
        if (-not (Test-Path "node_modules")) { npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw "npm ci mislukt" } }
        npm run build; if ($LASTEXITCODE -ne 0) { throw "Frontend bouwen mislukt" }
    } finally { Pop-Location }
}

$port = if ($env:PORT) { $env:PORT } else { "8765" }
if (-not $NoBrowser) { Start-Job -ScriptBlock { param($p) Start-Sleep 3; Start-Process "http://localhost:$p" } -ArgumentList $port | Out-Null }

Push-Location backend
try { & $py -m dashboard } finally { Pop-Location }
