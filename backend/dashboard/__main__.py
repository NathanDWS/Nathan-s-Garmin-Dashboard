"""python -m dashboard  →  start the dashboard on the home network."""
from __future__ import annotations

import logging
import os
import socket

import uvicorn
from dotenv import load_dotenv

from .api import create_app
from .coach import Coach
from .config import REPO_ROOT, get_paths
from .garmin_auth import AuthService
from .profiles import ProfileStore
from .sample import seed_demo
from .scheduler import start_daily
from .sync import SyncManager


def _lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.168.1.1", 1))  # no packet is sent; picks the LAN interface
            return s.getsockname()[0]
    except OSError:
        return "localhost"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    paths = get_paths()
    load_dotenv(paths.env_file, interpolate=False)
    paths.data.mkdir(parents=True, exist_ok=True)
    store = ProfileStore(paths)
    if not store.list():
        seed_demo(paths, store)
    sync = SyncManager(paths, store)
    start_daily(sync, store, hour=int(os.environ.get("SYNC_HOUR", "7")))
    app = create_app(paths, store=store, auth=AuthService(paths, store), sync=sync, coach=Coach(paths, store),
                     static_dir=REPO_ROOT / "frontend" / "dist")
    port = int(os.environ.get("PORT", "8765"))
    print(f"\n  Dashboard draait op  http://localhost:{port}")
    print(f"  Op je telefoon (zelfde wifi):  http://{_lan_ip()}:{port}\n")
    uvicorn.run(app, host=os.environ.get("HOST", "0.0.0.0"), port=port, log_level="warning")


if __name__ == "__main__":
    main()
