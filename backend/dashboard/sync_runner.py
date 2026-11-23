"""One-shot Garmin sync for one profile. Run as a subprocess by SyncManager:

    python -m dashboard.sync_runner --profile <id> [--start YYYY-MM-DD]

Exit codes: 0 ok, 1 error, 2 needs_reconnect, 3 rate_limited, 4 another sync for this
profile is still running. Never prompts.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import IO, Any

from . import envfile
from .bundle import build_bundle
from .config import get_paths
from .profiles import ProfileStore

EXIT_OK, EXIT_ERROR, EXIT_RECONNECT, EXIT_RATE, EXIT_BUSY = 0, 1, 2, 3, 4
FETCH_SELECTION = (
    "daily_avg,sleep,steps,heartrate,stress,breathing,hrv,vo2,activity,body_composition,"
    "training_readiness,training_status,endurance_score,race_prediction,blood_pressure"
)
BACKFILL_DAYS = 365
RESYNC_DAYS = 7
BACKFILL_MARKER = "backfill_done"


class _NeedsReconnect(Exception):
    pass


class _RateLimited(Exception):
    """Raised instead of Garmin's 429 error so the vendored fetch loop stops instead of retrying forever."""


def compute_start(last_data_date: str | None, today: date, backfilled: bool = True) -> str:
    if not last_data_date or not backfilled:
        return (today - timedelta(days=BACKFILL_DAYS)).isoformat()
    return (date.fromisoformat(last_data_date) - timedelta(days=RESYNC_DAYS - 1)).isoformat()


def acquire_lock(path: Path) -> IO[Any] | None:
    """Exclusive per-profile lock held for the life of the process. None if another process holds it."""
    path.parent.mkdir(parents=True, exist_ok=True)
    f = open(path, "a+")  # noqa: SIM115 - kept open as the lock
    try:
        if sys.platform == "win32":
            import msvcrt

            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return None
    return f


def _is_rate_limit(err: BaseException | None) -> bool:
    from garminconnect import GarminConnectTooManyRequestsError

    while err is not None:
        if isinstance(err, (GarminConnectTooManyRequestsError, _RateLimited)) or "429" in str(err):
            return True
        err = err.__context__
    return False


def _stop_on_rate_limit(module: Any, name: str) -> None:
    from garminconnect import GarminConnectTooManyRequestsError

    fn = getattr(module, name)

    def guarded(*a: Any, **k: Any) -> Any:
        try:
            return fn(*a, **k)
        except GarminConnectTooManyRequestsError as err:
            raise _RateLimited(str(err)) from None

    setattr(module, name, guarded)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", required=True)
    ap.add_argument("--start")
    args = ap.parse_args(argv)

    paths = get_paths()
    store = ProfileStore(paths)
    profile = store.get(args.profile)
    lock = acquire_lock(paths.profile_dir(profile.id) / "sync.lock")
    if lock is None:
        print("another sync for this profile is still running", file=sys.stderr)
        return EXIT_BUSY
    try:
        return _run(paths, store, profile, args.start)
    finally:
        lock.close()


def _run(paths: Any, store: ProfileStore, profile: Any, start_arg: str | None) -> int:
    db, tokens = paths.db(profile.id), paths.tokens(profile.id)
    db.parent.mkdir(parents=True, exist_ok=True)
    # Read literally: dotenv interpolation would turn "${X}" inside a password into something else.
    password = envfile.get_var(paths.env_file, store.password_var(profile.id))

    settings = {
        "SQLITE_DB_PATH": str(db),
        "TOKEN_DIR": str(tokens),
        "GARMINCONNECT_EMAIL": profile.email,
        "FETCH_SELECTION": FETCH_SELECTION,
        "KEEP_FIT_FILES": "false",
        "FETCH_FAILED_WAIT_SECONDS": "300",
        "RATE_LIMIT_CALLS_SECONDS": "3",
        "IGNORE_ERRORS": "false",
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
    garmin_fetch.IGNORE_ERRORS = False
    garmin_fetch.garmin_db = GarminDB(str(db))

    def no_prompt(prompt: str) -> str:
        raise _NeedsReconnect(prompt)

    garmin_fetch._prompt_interactive = no_prompt
    for name in ("daily_fetch_write", "get_last_sync"):
        _stop_on_rate_limit(garmin_fetch, name)

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
    marker = paths.profile_dir(profile.id) / BACKFILL_MARKER
    start = start_arg or compute_start(build_bundle(db)["last_data_date"], today, backfilled=marker.exists())
    try:
        garmin_fetch.fetch_write_bulk(start, today.isoformat())
    except Exception as err:  # noqa: BLE001
        if _is_rate_limit(err):
            return EXIT_RATE
        print(f"fetch failed: {err}", file=sys.stderr)
        return EXIT_ERROR
    if start <= (today - timedelta(days=BACKFILL_DAYS)).isoformat():
        marker.write_text(today.isoformat(), encoding="utf-8")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
