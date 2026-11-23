"""Filesystem layout of the dashboard. Everything per profile lives under data/."""
from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


class Paths:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.data = self.root / "data"
        self.env_file = self.root / ".env"
        self.profiles_json = self.data / "profiles.json"

    def profile_dir(self, pid: str) -> Path:
        return self.data / pid

    def db(self, pid: str) -> Path:
        return self.profile_dir(pid) / "garmin.db"

    def tokens(self, pid: str) -> Path:
        return self.data / "tokens" / pid

    def status(self, pid: str) -> Path:
        return self.profile_dir(pid) / "sync_status.json"

    def goals(self, pid: str) -> Path:
        return self.profile_dir(pid) / "goals.json"

    def log(self, pid: str) -> Path:
        return self.profile_dir(pid) / "sync.log"


def get_paths() -> Paths:
    return Paths(Path(os.environ.get("DASHBOARD_ROOT", REPO_ROOT)))
