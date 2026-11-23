"""One-shot Garmin sync for one profile. Run as a subprocess by SyncManager:

    python -m dashboard.sync_runner --profile <id> [--start YYYY-MM-DD]

Exit codes: 0 ok, 1 error, 2 needs_reconnect, 3 rate_limited. Never prompts.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta

from dotenv import dotenv_values

from .bundle import build_bundle
from .config import get_paths
from .profiles import ProfileStore

EXIT_OK, EXIT_ERROR, EXIT_RECONNECT, EXIT_RATE = 0, 1, 2, 3
FETCH_SELECTION = (
    "daily_avg,sleep,steps,heartrate,stress,breathing,hrv,vo2,activity,body_composition,"
    "training_readiness,training_status,endurance_score,race_prediction,blood_pressure"
)
BACKFILL_DAYS = 365
RESYNC_DAYS = 7


class _NeedsReconnect(Exception):
    pass


def compute_start(last_data_date: str | None, today: date) -> str:
    if not last_data_date:
        return (today - timedelta(days=BACKFILL_DAYS)).isoformat()
    return (date.fromisoformat(last_data_date) - timedelta(days=RESYNC_DAYS - 1)).isoformat()


def _is_rate_limit(err: BaseException | None) -> bool:
    from garminconnect import GarminConnectTooManyRequestsError

    while err is not None:
        if isinstance(err, GarminConnectTooManyRequestsError) or "429" in str(err):
            return True
        err = err.__context__
    return False


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", required=True)
    ap.add_argument("--start")
    args = ap.parse_args(argv)

    paths = get_paths()
    store = ProfileStore(paths)
    profile = store.get(args.profile)
    db, tokens = paths.db(profile.id), paths.tokens(profile.id)
    db.parent.mkdir(parents=True, exist_ok=True)
    password = dotenv_values(paths.env_file).get(store.password_var(profile.id)) if paths.env_file.exists() else None

    settings = {
        "SQLITE_DB_PATH": str(db),
        "TOKEN_DIR": str(tokens),
        "GARMINCONNECT_EMAIL": profile.email,
        "FETCH_SELECTION": FETCH_SELECTION,
        "KEEP_FIT_FILES": "false",
        "FETCH_FAILED_WAIT_SECONDS": "300",
        "RATE_LIMIT_CALLS_SECONDS": "3",
    }
    os.environ.update(settings)
    os.environ.pop("GARMINCONNECT_BASE64_PASSWORD", None)
    if password:
        os.environ["GARMINCONNECT_PASSWORD"] = password
    else:
        os.environ.pop("GARMINCONNECT_PASSWORD", None)

    from garmin_grafana import garmin_fetch
    from garmin_grafana.sqlite_manager import GarminDB

    # The fetcher reads its config at import time; set it again in case it was imported earlier.
    garmin_fetch.SQLITE_DB_PATH = str(db)
    garmin_fetch.TOKEN_DIR = str(tokens)
    garmin_fetch.GARMINCONNECT_EMAIL = profile.email
    garmin_fetch.GARMINCONNECT_PASSWORD = password or None
    garmin_fetch.FETCH_SELECTION = FETCH_SELECTION
    garmin_fetch.KEEP_FIT_FILES = False
    garmin_fetch.FETCH_FAILED_WAIT_SECONDS = 300
    garmin_fetch.RATE_LIMIT_CALLS_SECONDS = 3
    garmin_fetch.garmin_db = GarminDB(str(db))

    def no_prompt(prompt: str) -> str:
        raise _NeedsReconnect(prompt)

    garmin_fetch._prompt_interactive = no_prompt

    try:
        garmin_fetch.garmin_obj = garmin_fetch.garmin_login()
    except _NeedsReconnect:
        return EXIT_RECONNECT
    except Exception as err:  # noqa: BLE001
        if _is_rate_limit(err):
            return EXIT_RATE
        print(f"login failed: {err}", file=sys.stderr)
        return EXIT_RECONNECT

    today = date.today()
    start = args.start or compute_start(build_bundle(db)["last_data_date"], today)
    try:
        garmin_fetch.fetch_write_bulk(start, today.isoformat())
    except Exception as err:  # noqa: BLE001
        if _is_rate_limit(err):
            return EXIT_RATE
        print(f"fetch failed: {err}", file=sys.stderr)
        return EXIT_ERROR
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
