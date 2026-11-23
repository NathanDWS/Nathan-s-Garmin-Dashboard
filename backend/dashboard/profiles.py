"""Profile registry stored in data/profiles.json."""
from __future__ import annotations

import json
import os
import re
import shutil
import threading
import time
import unicodedata
from dataclasses import asdict, dataclass
from datetime import datetime

from . import envfile
from .config import Paths

RESERVED_IDS = {"tokens", "demo"}  # data/tokens is the token root; demo is the sample profile
PALETTE = ["#2563eb", "#e11d48", "#059669", "#d97706", "#7c3aed", "#0891b2"]


@dataclass
class Profile:
    id: str
    name: str
    email: str
    color: str
    created_at: str


def slugify(name: str) -> str:
    ascii_name = "".join(
        c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c)
    ).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_")
    return slug or "profiel"


class ProfileStore:
    def __init__(self, paths: Paths) -> None:
        self._paths = paths
        self._lock = threading.Lock()

    def _load(self) -> list[Profile]:
        f = self._paths.profiles_json
        if not f.exists():
            return []
        return [Profile(**p) for p in json.loads(f.read_text(encoding="utf-8"))]

    def _save(self, profiles: list[Profile]) -> None:
        f = self._paths.profiles_json
        f.parent.mkdir(parents=True, exist_ok=True)
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps([asdict(p) for p in profiles], indent=2), encoding="utf-8")
        os.replace(tmp, f)

    def list(self) -> list[Profile]:
        return self._load()

    def get(self, pid: str) -> Profile:
        for p in self._load():
            if p.id == pid:
                return p
        raise KeyError(pid)

    def add(self, name: str, email: str, color: str | None = None, pid: str | None = None) -> Profile:
        with self._lock:
            profiles = self._load()
            taken = {p.id for p in profiles} | (set() if pid else RESERVED_IDS)
            base = pid or slugify(name)
            new_id, n = base, 2
            while new_id in taken:
                new_id, n = f"{base}_{n}", n + 1
            profile = Profile(
                id=new_id,
                name=name.strip() or new_id,
                email=email.strip(),
                color=color or PALETTE[len(profiles) % len(PALETTE)],
                created_at=datetime.now().isoformat(timespec="seconds"),
            )
            profiles.append(profile)
            self._save(profiles)
            return profile

    def remove(self, pid: str) -> None:
        """Delete files first, then the registry entry, so a failed delete can simply be retried.

        Raises OSError if a file stays locked (e.g. a sync that has not exited yet)."""
        for d in (self._paths.profile_dir(pid), self._paths.tokens(pid)):
            _rmtree_retry(d)
        envfile.remove_var(self._paths.env_file, self.password_var(pid))
        with self._lock:
            profiles = self._load()
            self._save([p for p in profiles if p.id != pid])

    @staticmethod
    def password_var(pid: str) -> str:
        return f"GARMIN_PASSWORD_{pid.upper()}"


def _rmtree_retry(path, attempts: int = 5) -> None:
    for i in range(attempts):
        if not path.exists():
            return
        try:
            shutil.rmtree(path)
            return
        except FileNotFoundError:
            return
        except OSError:
            if i == attempts - 1:
                raise
            time.sleep(0.5)
