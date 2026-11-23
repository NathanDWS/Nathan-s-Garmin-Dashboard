# Garmin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local, multi-profile Garmin health and training dashboard: Python backend that syncs Garmin Connect into SQLite per profile, a clean Dutch React UI, and a Claude coach.

**Architecture:** FastAPI app in `backend/dashboard/` wraps two vendored libraries: `garmin_grafana` (fetcher, writes SQLite) and `garmin_insights` (baseline analyses + Claude agent with tools). Each sync runs as a subprocess per profile so the fetcher's module-level env config stays isolated. The React frontend (taken from garmin-claude-dashboard, stripped and restyled) talks only to `/api/profiles/{id}/...` and is served by the same FastAPI process on the home network.

**Tech Stack:** Python 3.14, FastAPI, uvicorn, APScheduler, garminconnect, anthropic, pytest · React 19, Vite 6, Tailwind 4, Recharts, react-leaflet, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-23-garmin-dashboard-design.md`

**Sources (clone fresh, depth 1):**
- A = `https://github.com/aaronparton2-sketch/garmin-claude-dashboard` (MIT)
- B = `https://github.com/dandwhelan/garmin-stats-ai` (repo LICENSE + `garmin-grafana/LICENSE` BSD-3)

## Global Constraints

- Runs locally on Windows; binds `0.0.0.0:8765` so devices on the home wifi can open it. No cloud services, no Vercel/Supabase code left in the tree.
- No login/PIN per profile: every profile is visible to everyone.
- Garmin password is never stored unless the user ticks "Wachtwoord onthouden"; then it goes into `.env` as `GARMIN_PASSWORD_<PROFIEL_ID_UPPER>`. Tokens go to `data/tokens/<id>/`.
- One `ANTHROPIC_API_KEY` in `.env` for all profiles. Default model `claude-sonnet-5-5` (overridable via `CLAUDE_MODEL`). Key never reaches the frontend.
- Automatic sync max once per day per profile (07:00 local) plus a manual "Nu verversen" button. First sync of a new profile backfills 365 days.
- UI copy in Dutch, metric units. Light/dark follows system setting. One accent colour per profile.
- Dropped from both sources: bloods, DEXA, race plan, Grafana, Home Assistant, MCP server, BLE scale adapters, menstrual cycle, environment/weather fetch.
- `data/`, `.env`, `frontend/dist/`, `node_modules/` are gitignored. Licences of A and B kept in `LICENSES/`.
- Coach never diagnoses (keep B's system prompt guard rails).

## Review Focus

1. A profile that was just added and has no rows yet (sync still running): every page shows a Dutch empty state ("Nog geen data — de eerste sync loopt"), nothing crashes. → tests in Task 3 (`test_bundle_empty_db`) and Task 10 (`renders empty state`).
2. `ANTHROPIC_API_KEY` missing: coach returns a clear message, the rest of the dashboard works. → Task 6 `test_chat_without_key`.
3. Two syncs for one profile at once (button double-click while the 07:00 job runs): second request gets 409, never two fetchers on one DB. → Task 5 `test_second_sync_rejected`.
4. Tokens expired and no saved password, or Garmin returns 429: status becomes `needs_reconnect` / `rate_limited` and the header shows it with a "Opnieuw verbinden" action. → Task 5 `test_runner_exit_codes_map_to_status`, Task 9 `shows reconnect banner`.
5. Password with `#`, `=`, quotes, spaces or a trailing backslash round-trips through `.env`; profile names with spaces/accents ("Papa IJpma") give a safe id. → Task 2 `test_env_roundtrip_special_chars`, `test_slug`.

---

### Task 1: Project skeleton with both libraries vendored

**Files:**
- Create: `garmin-dashboard/.gitignore`, `.env.example`, `LICENSES/garmin-claude-dashboard-MIT.txt`, `LICENSES/garmin-stats-ai.txt`, `LICENSES/garmin-grafana-BSD3.txt`
- Create: `backend/pyproject.toml` (package `dashboard`, deps: `fastapi>=0.115`, `uvicorn[standard]>=0.32`, `apscheduler>=3.10`, `python-dotenv>=1.0`, `garminconnect>=0.2.35`; dev: `pytest>=8`, `httpx>=0.27`)
- Create: `backend/vendor/garmin_grafana/` = B `garmin-grafana/` (pyproject + `src/`), with `pandas==2.2.3` loosened to `pandas>=2.3` (3.14 wheels)
- Create: `backend/vendor/garmin_insights/` = B `garmin-insights/` minus `mcp_server.py`, `web/`, `cli.py`, `scales/wla37.py`, `scales/lefu.py`, `scales/fitdays.py`, `deploy/`; drop `mcp` and `scale-engine` extras
- Create: `backend/dashboard/__init__.py`, `backend/tests/test_imports.py`

- [ ] **Step 1:** `git init` in `garmin-dashboard/`, add `.gitignore` (`data/`, `.env`, `.venv/`, `node_modules/`, `frontend/dist/`, `__pycache__/`). `.env.example` lists `ANTHROPIC_API_KEY=`, `CLAUDE_MODEL=claude-sonnet-5-5`, `SYNC_HOUR=7`.
- [ ] **Step 2:** Copy the vendored trees as listed; fix any import of removed modules (grep `wla37|lefu|fitdays|mcp_server|web\.` inside `garmin_insights` and remove the registrations/branches that reference them).
- [ ] **Step 3: Write failing test** `test_imports.py::test_vendored_packages_import` — imports `garmin_grafana.garmin_fetch`, `garmin_grafana.sqlite_manager`, `garmin_insights.agent.HealthAgent`, `garmin_insights.insights.proactive.InsightScanner`.
- [ ] **Step 4:** `python -m venv .venv`; `.venv\Scripts\pip install -e backend/vendor/garmin_grafana -e backend/vendor/garmin_insights -e "backend[dev]"`.
- [ ] **Step 5:** Run `.venv\Scripts\pytest backend/tests -q` → PASS. If an import fails only on 3.14, pin the offending dep minimum up, do not patch library logic.
- [ ] **Step 6:** Commit (`chore: skeleton with vendored garmin_grafana and garmin_insights`), including the spec doc.

### Task 2: Profiles store and .env writer

**Files:**
- Create: `backend/dashboard/config.py`, `backend/dashboard/envfile.py`, `backend/dashboard/profiles.py`
- Test: `backend/tests/test_envfile.py`, `backend/tests/test_profiles.py`

**Interfaces — Produces:**
- `config.Paths(root: Path)` with `.data`, `.env_file`, `.profiles_json`, `db(pid) -> Path` (`data/<pid>/garmin.db`), `tokens(pid) -> Path` (`data/tokens/<pid>`), `status(pid) -> Path` (`data/<pid>/sync_status.json`), `goals(pid) -> Path`. `get_paths()` reads `DASHBOARD_ROOT` env, default repo root.
- `envfile.set_var(path: Path, key: str, value: str) -> None`, `envfile.remove_var(path, key) -> None`, `envfile.get_var(path, key) -> str | None`. Values written double-quoted with `\` and `"` escaped; other lines preserved untouched.
- `profiles.Profile` dataclass: `id: str, name: str, email: str, color: str, created_at: str`.
- `profiles.slugify(name: str) -> str` (ascii, lowercase, `[a-z0-9_]`, accents stripped).
- `profiles.ProfileStore(paths)`: `list() -> list[Profile]`, `get(pid) -> Profile` (KeyError), `add(name, email, color) -> Profile` (unique id: suffix `_2`, `_3`), `remove(pid) -> None` (deletes `data/<pid>/`, tokens dir, and `GARMIN_PASSWORD_<PID>` from .env), `password_var(pid) -> str` = `f"GARMIN_PASSWORD_{pid.upper()}"`.
- Colours cycle through a fixed palette of 6 (pick in Task 8's tokens; store as hex).

- [ ] **Step 1: Failing tests**
  - `test_env_roundtrip_special_chars`: for `'p#ss = "x" \\'`, `set_var` then `get_var` returns it exactly; also `dotenv_values(path)[key]` returns it exactly.
  - `test_set_var_preserves_other_lines`: existing `ANTHROPIC_API_KEY=abc` and a comment line survive; setting an existing key replaces in place (one occurrence).
  - `test_slug`: `slugify("Papa IJpma") == "papa_ijpma"`, `slugify("Zoë") == "zoe"`.
  - `test_add_duplicate_name_gets_suffix`, `test_remove_cleans_files_and_env`, `test_profiles_persist_across_instances`.
- [ ] **Step 2:** Run `pytest backend/tests/test_envfile.py backend/tests/test_profiles.py -q` → FAIL.
- [ ] **Step 3:** Implement. `profiles.json` written atomically (temp file + `os.replace`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (`feat: profile store and .env writer`).

### Task 3: Bundle builder (SQLite → frontend JSON) and demo profile

**Files:**
- Create: `backend/dashboard/bundle.py`, `backend/dashboard/sample.py`
- Test: `backend/tests/test_bundle.py`

**Interfaces — Produces:**
- `bundle.build_bundle(db: Path, days: int = 400) -> dict` with keys and per-row fields (frontend types in Task 8 mirror these exactly):
  - `daily`: `date, steps, step_goal, distance_m, active_kcal, resting_hr, stress_avg, body_battery_high, body_battery_low, body_battery_wake, spo2_avg, spo2_low, moderate_min, vigorous_min, floors` ← `daily_stats`
  - `sleep`: `date, total_s, deep_s, light_s, rem_s, awake_s, score, hrv_overnight, respiration_avg, spo2_avg` ← `sleep_summary`
  - `activities`: `id, date, start, type, sport, name, duration_s, moving_s, distance_m, avg_speed, avg_hr, max_hr, kcal, avg_power, hr_zones: [z1..z5 seconds]` ← `activity_summary`. `sport` = one of `hardlopen|fietsen|zwemmen|kracht|wandelen|overig` mapped from Garmin `activity_type` (`running, trail_running, treadmill_running → hardlopen`; `cycling, road_biking, indoor_cycling, mountain_biking, virtual_ride → fietsen`; `lap_swimming, open_water_swimming → zwemmen`; `strength_training → kracht`; `walking, hiking → wandelen`).
  - `weigh_ins`: `date, weight_kg, body_fat_pct, muscle_kg, bmi` ← `body_composition`
  - `readiness`: `date, score, level, recovery_time_min` ← `training_readiness` (last row per day)
  - `training_status`: `date, status, acute_load, chronic_load, acwr` ← `training_status`
  - `vo2max`: `date, value, sport` ← `vo2_max`
  - `blood_pressure`: `date, systolic, diastolic, pulse` ← `blood_pressure`
  - `last_data_date: str | None`
  - Missing tables or columns → empty list / None, never an exception.
- `bundle.activity_track(db, activity_id) -> list[dict]` (`lat, lon, hr, t`) ← `activity_gps`, downsampled to ≤ 1500 points.
- `sample.seed_demo(paths, store) -> Profile`: creates profile `demo` ("Voorbeeld") and fills its DB via `garmin_grafana.sqlite_manager` schema creation, converting A's `data/sample/*.json` (copied to `backend/dashboard/sample_data/`). Shift dates so the newest sample day = today.

- [ ] **Step 1: Failing tests**
  - `test_bundle_empty_db`: fresh DB with only the schema → all lists empty, `last_data_date is None`.
  - `test_bundle_missing_table`: DB file without `vo2_max` table → `vo2max == []`.
  - `test_sport_mapping`: rows with `treadmill_running`, `indoor_cycling`, `yoga` → `hardlopen`, `fietsen`, `overig`.
  - `test_demo_seed_has_recent_data`: after `seed_demo`, `build_bundle` returns ≥ 60 sleep rows and `last_data_date == today`.
  - `test_track_downsampled`: 5000 GPS rows → ≤ 1500 points, first and last preserved.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (read actual column names from `sqlite_manager.py`; build tables via its schema function rather than copying DDL).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (`feat: sqlite bundle builder and demo profile`).

### Task 4: Garmin login with MFA (tokens, optional saved password)

**Files:**
- Create: `backend/dashboard/garmin_auth.py`
- Test: `backend/tests/test_garmin_auth.py`

**Interfaces — Produces:**
- `garmin_auth.LoginResult` dataclass: `status: Literal["ok","needs_mfa","bad_credentials","rate_limited","error"]`, `login_id: str | None`, `message: str | None`.
- `garmin_auth.AuthService(paths, store, client_factory=Garmin)`:
  - `start(pid: str, email: str, password: str, remember: bool) -> LoginResult` — `client_factory(email=..., password=..., return_on_mfa=True).login()`; on `"needs_mfa"` keep `(client, state, pid, password, remember)` in memory under a random `login_id` for 10 minutes; on success `client.client.dump(tokens(pid))`, write token owner via `garmin_grafana.token_owner.write_token_owner`, and if `remember` call `envfile.set_var(..., store.password_var(pid), password)`.
  - `finish_mfa(login_id: str, code: str) -> LoginResult` — `client.resume_login(state, code)` then same success path; unknown/expired id → `status="error"`.
  - Exception mapping: `GarminConnectAuthenticationError → bad_credentials`, `GarminConnectTooManyRequestsError` or HTTP 429 → `rate_limited`, other → `error` with message.
  - Password never logged, never returned.

- [ ] **Step 1: Failing tests** with a fake `client_factory`:
  - `test_login_ok_writes_tokens_not_password` (remember=False → tokens dir exists, `.env` has no `GARMIN_PASSWORD_*`).
  - `test_login_remember_writes_password`.
  - `test_mfa_flow` (first call `needs_mfa`, `finish_mfa("123456")` → ok, tokens written).
  - `test_mfa_unknown_id`, `test_bad_credentials_mapped`, `test_rate_limit_mapped`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (`feat: garmin login with mfa and token storage`).

### Task 5: Sync runner, sync manager, daily scheduler

**Files:**
- Create: `backend/dashboard/sync_runner.py`, `backend/dashboard/sync.py`, `backend/dashboard/scheduler.py`
- Test: `backend/tests/test_sync.py`

**Interfaces — Produces:**
- `python -m dashboard.sync_runner --profile <pid> [--start YYYY-MM-DD]`: sets env before importing the fetcher — `SQLITE_DB_PATH`, `TOKEN_DIR`, `GARMINCONNECT_EMAIL`, `GARMINCONNECT_PASSWORD` (only if the `.env` var exists), `FETCH_SELECTION=daily_avg,sleep,steps,heartrate,stress,breathing,hrv,vo2,activity,body_composition,training_readiness,training_status,endurance_score,race_prediction,blood_pressure`, `KEEP_FIT_FILES=false`. Then `garmin_fetch.garmin_obj = garmin_fetch.garmin_login()`, `fetch_write_bulk(start, today)`. Start = `--start`, else day after `last_data_date` minus 7 days, else 365 days ago. Must never call `input()`: if login needs a prompt (no tokens, no password) exit 2. Exit codes: `0` ok, `2` needs_reconnect, `3` rate_limited, `1` other.
- `sync.SyncStatus` dict persisted at `status(pid)`: `state: "idle"|"running"|"ok"|"needs_reconnect"|"rate_limited"|"error"`, `started_at`, `finished_at`, `last_success`, `message`.
- `sync.SyncManager(paths, store, launcher=subprocess.Popen)`: `start(pid, start: str | None = None) -> bool` (False if already running — guarded by a per-profile lock plus a check on the live process), `status(pid) -> dict`, `poll() -> None` (reaps finished processes, maps exit code → state). On app startup, a stale `running` with no live process → `error` ("Sync onderbroken").
- `scheduler.start_daily(manager, store, hour: int) -> BackgroundScheduler` — cron job at `hour:00` that calls `manager.start(pid)` for every profile except `demo`, staggered 60 s apart; `manager.poll` every 5 s.

- [ ] **Step 1: Failing tests** (fake launcher returning a controllable fake process):
  - `test_second_sync_rejected`: `start("a")` True, `start("a")` again False while running.
  - `test_runner_exit_codes_map_to_status`: exit 0/2/3/1 → `ok`/`needs_reconnect`/`rate_limited`/`error`; `last_success` set only on 0.
  - `test_stale_running_marked_error_on_startup`.
  - `test_runner_start_date`: unit-test the pure helper `sync_runner.compute_start(last_data_date: str | None, today: date) -> str` (None → today−365; "2026-11-20" → "2026-11-14").
  - `test_runner_never_prompts`: monkeypatch `builtins.input` to raise; runner with no tokens/password exits 2 (patch `Garmin.login` to raise `FileNotFoundError`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (`feat: per-profile sync subprocess, status and daily schedule`).

### Task 6: Insights and coach

**Files:**
- Create: `backend/dashboard/insights.py`, `backend/dashboard/coach.py`
- Test: `backend/tests/test_coach.py`

**Interfaces — Produces:**
- `insights.today(paths, pid) -> list[dict]` — max 3 items `{title, detail, severity: "info"|"let_op"}` from `InsightScanner(memory, analysis).scan_anomalies() + scan_trends()`, sorted by severity, in Dutch (translate B's finding titles via a small mapping; untranslated → B's text). Any exception or < 14 days of data → `[]`.
- `coach.Coach(paths, store, agent_factory=HealthAgent)`:
  - `chat(pid, session_id: str, message: str) -> str` — one `HealthAgent` per profile (built with `garmin_insights.config.Settings(sqlite_db_path=db(pid), anthropic_api_key=..., claude_model=..., display_name=profile.name)`), history per `(pid, session_id)` in memory, capped at 40 turns. Add a Dutch instruction: answer in Dutch.
  - `reset(pid, session_id) -> None`
  - `copy_prompt(pid) -> str` — builds the same context (last 30 days summary from `build_bundle`) as a pasteable Dutch prompt, no API key needed.
  - No `ANTHROPIC_API_KEY` → `chat` raises `CoachUnavailable("Geen Claude API-key ingesteld. Zet ANTHROPIC_API_KEY in .env.")`.

- [ ] **Step 1: Failing tests:** `test_chat_without_key`, `test_history_isolated_per_profile` (fake agent records history lengths), `test_copy_prompt_contains_recent_numbers` (demo DB → prompt contains latest resting HR), `test_insights_short_history_empty`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (`feat: insights and claude coach per profile`).

### Task 7: HTTP API

**Files:**
- Create: `backend/dashboard/api.py`, `backend/dashboard/goals.py`, `backend/dashboard/__main__.py`
- Test: `backend/tests/test_api.py`

**Interfaces — Produces** (`create_app(paths, *, auth, sync, coach) -> FastAPI`; all JSON):

| Method + path | Body | Response |
|---|---|---|
| `GET /api/profiles` | – | `[{id,name,color,email,has_saved_password,last_data_date,sync: SyncStatus}]` |
| `POST /api/profiles` | `{name,email,password,remember_password}` | `201 {status:"ok",profile}` and starts first sync · `200 {status:"needs_mfa",login_id}` · `400 {status:"bad_credentials"}` · `429 {status:"rate_limited"}` |
| `POST /api/profiles/mfa` | `{login_id,code}` | as above |
| `POST /api/profiles/{id}/reconnect` | `{password,remember_password}` | as above, then starts a sync |
| `DELETE /api/profiles/{id}` | – | `204` |
| `POST /api/profiles/{id}/sync` | – | `202` · `409 {status:"already_running"}` |
| `GET /api/profiles/{id}/bundle` | – | `build_bundle` output |
| `GET /api/profiles/{id}/activities/{aid}/track` | – | `activity_track` output |
| `GET /api/profiles/{id}/insights` | – | `insights.today` |
| `GET/PUT /api/profiles/{id}/goals` | `{hardlopen_km,fietsen_km,zwemmen_km,kracht_sessies,stappen_per_dag}` | same object; defaults `20, 60, 0, 2, 10000` |
| `POST /api/profiles/{id}/chat` | `{session_id,message}` | `{reply}` · `503 {error}` on `CoachUnavailable` |
| `POST /api/profiles/{id}/chat/reset` | `{session_id}` | `204` |
| `GET /api/profiles/{id}/prompt` | – | `{text}` |

- Unknown profile → `404`. Static: mount `frontend/dist` at `/` with SPA fallback to `index.html` when the folder exists.
- `python -m dashboard` (from `backend/`): loads `.env`, seeds `demo` if no profiles exist, starts scheduler, runs uvicorn on `0.0.0.0:8765`, prints the LAN URL (`http://<lan-ip>:8765`).

- [ ] **Step 1: Failing tests** (FastAPI `TestClient`, fakes from Tasks 4–6): one test per row's main path + `test_unknown_profile_404` + `test_password_not_in_any_response` (scan all response bodies of the add flow for the password string).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `pytest backend/tests -q` → all PASS.
- [ ] **Step 5:** Commit (`feat: http api`).

### Task 8: Frontend base — strip A, new data layer, design tokens

**Files:**
- Create: `frontend/` from A's `index.html, package.json, vite.config.ts, tsconfig*.json, src/, public/`; delete `src/pages/Bloods.tsx, BodyComp.tsx, RacePlan.tsx`, `src/lib/marker-info.ts, next-panel.ts, racePlan.ts`, all Supabase/login code, A's `api/`.
- Modify: `frontend/package.json` (add `react-leaflet`, `leaflet`, `vitest`, `@testing-library/react`, `jsdom`; script `"test": "vitest run"`), `vite.config.ts` (dev proxy `/api → http://localhost:8765`)
- Create: `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`, `frontend/src/lib/profile-context.tsx`, `frontend/src/styles/tokens.css`
- Modify: `frontend/src/lib/data.ts`, `metrics.ts` to the new field names
- Test: `frontend/src/lib/api.test.ts`, `frontend/src/lib/metrics.test.ts`

**Interfaces — Produces:**
- `types.ts`: `Profile`, `SyncStatus`, `Bundle` (+ row types) mirroring Task 3/7 field names exactly; `Sport = "hardlopen"|"fietsen"|"zwemmen"|"kracht"|"wandelen"|"overig"`.
- `api.ts`: `listProfiles()`, `addProfile(body)`, `submitMfa(loginId, code)`, `reconnect(id, body)`, `deleteProfile(id)`, `startSync(id)`, `getBundle(id)`, `getTrack(id, aid)`, `getInsights(id)`, `getGoals(id)`, `putGoals(id, g)`, `chat(id, sessionId, msg)`, `resetChat(id, sessionId)`, `getPrompt(id)` — each returns the typed JSON or throws `ApiError {status, body}`.
- `profile-context.tsx`: `ProfileProvider`, `useProfiles() -> {profiles, active, setActive(id), refresh()}` (active id persisted in `localStorage["profiel"]`, polls `listProfiles` every 5 s while any sync is `running`), `useBundle() -> {data, loading, error}` for the active profile (refetch when its sync goes `running → ok`).
- `tokens.css`: CSS variables for surface, text, muted, border, 6 profile accents, chart series; `prefers-color-scheme` dark variant. Inter (or system-ui) font, 8px spacing grid, cards with 1px border + 16px radius, no shadows heavier than `0 1px 2px`.
- Keep A's period slicer (`Deze maand / 30 dagen / Dit jaar`) and its period-comparison helpers in `metrics.ts`.

- [ ] **Step 1: Failing tests:** `api.test.ts` — `getBundle` hits `/api/profiles/x/bundle`, non-2xx throws `ApiError` with status; `metrics.test.ts` — period comparison on fixture rows (port A's existing expectations to new field names).
- [ ] **Step 2:** `npm install`, `npm test` → FAIL. **Step 3:** Implement. **Step 4:** `npm test` → PASS; `npm run build` → no TS errors (pages may be stubbed `Binnenkort` until Tasks 10–12).
- [ ] **Step 5:** Commit (`feat(frontend): strip sample app, profile-aware data layer, tokens`).

### Task 9: App shell — navigation, profile switcher, add account, sync status

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/components/Nav.tsx`
- Create: `frontend/src/components/ProfileSwitcher.tsx`, `AddAccountDialog.tsx`, `SyncBadge.tsx`, `EmptyState.tsx`
- Test: `frontend/src/components/AddAccountDialog.test.tsx`, `SyncBadge.test.tsx`

**Behaviour (pins):**
- Nav (left rail on ≥1024px, bottom tab bar on mobile): **Vandaag, Trainingen, Slaap, Herstel, Lichaam, Doelen, Coach**. Hash routing like A.
- Header: profile switcher (coloured dot + name, dropdown with all profiles + "Account toevoegen"), `SyncBadge`, "Nu verversen" button (disabled while running).
- `SyncBadge` texts: running "Bezig met ophalen… (t/m <last_data_date>)" so the first-year backfill shows progress, ok "Bijgewerkt <relatieve tijd>", needs_reconnect "Verbinding verlopen" + button "Opnieuw verbinden" (opens dialog in reconnect mode), rate_limited "Garmin vraagt even geduld — later opnieuw", error "Ophalen mislukt" + message tooltip.
- `AddAccountDialog` steps: (1) naam, Garmin-e-mail, wachtwoord, checkbox "Wachtwoord onthouden voor automatisch opnieuw inloggen" (default off) with one-line hint "Anders bewaren we alleen een login-token."; (2) if `needs_mfa`: 6-digit code field "Code uit je e-mail of sms"; (3) success "Account toegevoegd — we halen het afgelopen jaar op." Errors: bad_credentials "E-mail of wachtwoord klopt niet", rate_limited "Garmin blokkeert tijdelijk, probeer het over een uur opnieuw". Delete profile lives in the switcher's item menu with a confirm dialog.
- `EmptyState` used by every page when the active bundle has no rows for that page.

- [ ] **Step 1: Failing tests:** `AddAccountDialog` — `submits then shows MFA step` (mock api returns needs_mfa), `shows bad credentials error`, `remember checkbox off by default`; `SyncBadge` — `shows reconnect banner` for `needs_reconnect`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit (`feat(frontend): shell, profile switcher, add account flow`).

### Task 10: Vandaag and Trainingen (with activity detail map)

**Files:**
- Modify: `frontend/src/pages/Overview.tsx` → `Vandaag.tsx`; `ActivityDetail.tsx`
- Create: `frontend/src/pages/Trainingen.tsx`, `frontend/src/components/RouteMap.tsx`
- Test: `frontend/src/pages/Vandaag.test.tsx`

**Content (pins):**
- **Vandaag:** top row of 4 stat tiles — Trainingsgereedheid (readiness score + level), Body Battery bij opstaan, Slaapscore vannacht, HRV vannacht vs 30-dagen gemiddelde. Below: up to 3 insight cards from `/insights`. Below: deze week per sport (sessions, km, tijd) vs vorige week. Below: laatste 5 trainingen (click → detail).
- **Trainingen:** sport filter chips (Alles + sports present in data), period slicer, monthly volume bar chart, pace (run, min/km) or speed (bike, km/u) trend for outdoor sessions only (indoor excluded like A), VO2max line, training status + acute/chronic load chart, session list.
- **Activity detail:** header (naam, datum, sport), stats grid (afstand, duur, tempo/snelheid, gem./max HR, kcal, vermogen if present), HR-zones bar, `RouteMap` (react-leaflet, OSM tiles, polyline in profile accent; hidden when no GPS points).

- [ ] **Step 1: Failing tests:** `Vandaag` — `renders empty state` with empty bundle; `renders readiness tile` with fixture bundle.
- [ ] **Step 2–4:** FAIL → implement → PASS. Run `npm run build` → OK.
- [ ] **Step 5:** Commit (`feat(frontend): vandaag and trainingen pages`).

### Task 11: Slaap, Herstel, Lichaam, Doelen

**Files:**
- Modify: `SleepPage.tsx` → `Slaap.tsx`, `Recovery.tsx` → `Herstel.tsx`, `Health.tsx` + `StepsPage.tsx` → `Lichaam.tsx`, `TrainingPlan.tsx` → `Doelen.tsx`
- Test: `frontend/src/pages/Doelen.test.tsx`

**Content (pins):**
- **Slaap:** duur + score per nacht (60 nachten), stacked fasen (diep/licht/REM/wakker).
- **Herstel:** rust-HR, HRV vannacht, stress gemiddeld, Body Battery hoog/laag, ademhaling, SpO2 and bloeddruk (each only rendered if any value present), each 60 days with 7-day rolling line.
- **Lichaam:** gewicht + vet% (only if `weigh_ins` non-empty, otherwise a small note "Geen weegschaaldata — weeg je via Garmin Connect of een Index-weegschaal"), stappen per dag vs doel, maandgemiddelde, intensiteitsminuten per week vs 150.
- **Doelen:** weekly goals form (the 5 fields of Task 7) saved via `putGoals`, progress bars this week vs goal.

- [ ] **Step 1: Failing test:** `Doelen` — `saves goals` (edit km, click Opslaan → `putGoals` called with new value).
- [ ] **Step 2–4:** FAIL → implement → PASS; `npm run build` OK.
- [ ] **Step 5:** Commit (`feat(frontend): slaap, herstel, lichaam, doelen`).

### Task 12: Coach page

**Files:**
- Modify: `frontend/src/components/ChatWidget.tsx` → `frontend/src/pages/Coach.tsx`
- Test: `frontend/src/pages/Coach.test.tsx`

**Pins:** full-page chat for the active profile (session id per profile in `sessionStorage`), 3 starter prompts ("Hoe is mijn herstel deze week?", "Hoe gaat mijn hardlopen vergeleken met vorige maand?", "Wat valt op aan mijn slaap?"), markdown rendering of replies, "Nieuw gesprek" (reset), "Kopieer prompt" button (copies `getPrompt` text, toast "Gekopieerd — plak in je eigen AI-chat"). On 503 show the API-key message inline with the copy-prompt button still usable. Footer line: "Geen medisch advies."

- [ ] **Step 1: Failing tests:** `shows key missing message on 503`, `copy prompt writes clipboard`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit (`feat(frontend): coach page`).

### Task 13: Start script, README, end-to-end check

**Files:**
- Create: `start.ps1`, `README.md` (Dutch), `.claude/launch.json` (`name: "dashboard"`, runs `start.ps1 -NoBuild`, port 8765)

**Pins:**
- `start.ps1`: creates `.venv` + installs backend if missing, `npm ci && npm run build` in `frontend/` unless `-NoBuild`, copies `.env.example` → `.env` if absent, runs `.venv\Scripts\python -m dashboard` from `backend/`, opens `http://localhost:8765`.
- README: wat het is, installatie (Python 3.12+, Node 20+), `.env` invullen (alleen `ANTHROPIC_API_KEY`), account toevoegen via de UI, waarschuwing over de onofficiële Garmin-route (as in spec), hoe je vader het op zijn eigen pc installeert, telefoon in huis via LAN-URL (Windows-firewall: allow port 8765 on private networks).

- [ ] **Step 1:** Run full backend suite `pytest backend/tests -q` and `npm test` → all PASS.
- [ ] **Step 2:** Start via preview (`dashboard`), on the demo profile check every page in the browser pane: no console errors, empty states correct for a second freshly-added fake profile (create with a stubbed auth by temporarily inserting a profile row in `profiles.json`, then remove it).
- [ ] **Step 3:** Check mobile width (375px) and dark mode render cleanly; screenshot Vandaag + Trainingen.
- [ ] **Step 4:** Commit (`chore: start script, readme, launch config`).
- [ ] **Step 5 (with the user):** user adds their own Garmin account through the UI; confirm first sync completes and real data shows.
