"""Weekly training goals per profile."""
from __future__ import annotations

import json
import os

from pydantic import BaseModel, Field

from .config import Paths


class Goals(BaseModel):
    hardlopen_km: float = Field(20, ge=0, le=1000)
    fietsen_km: float = Field(60, ge=0, le=5000)
    zwemmen_km: float = Field(0, ge=0, le=200)
    kracht_sessies: int = Field(2, ge=0, le=21)
    stappen_per_dag: int = Field(10000, ge=0, le=100000)


def load(paths: Paths, pid: str) -> Goals:
    f = paths.goals(pid)
    if f.exists():
        try:
            return Goals(**json.loads(f.read_text(encoding="utf-8")))
        except (ValueError, TypeError):
            pass
    return Goals()


def save(paths: Paths, pid: str, goals: Goals) -> Goals:
    f = paths.goals(pid)
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(goals.model_dump_json(), encoding="utf-8")
    os.replace(tmp, f)
    return goals
