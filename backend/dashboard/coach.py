"""Claude coach per profile (garmin_insights' HealthAgent with its data tools) and a copy-paste prompt."""
from __future__ import annotations

import os
import threading
from statistics import mean
from typing import Any, Callable

from .bundle import build_bundle
from .config import Paths
from .profiles import ProfileStore

DEFAULT_MODEL = "claude-sonnet-5-5"
MAX_HISTORY_MESSAGES = 80  # 40 turns
DUTCH = "\n\n(Antwoord in het Nederlands, kort en concreet, als een coach. Geen diagnoses.)"


class CoachUnavailable(Exception):
    pass


def _default_factory(settings: Any) -> Any:
    from garmin_insights.agent import HealthAgent

    return HealthAgent(settings)


class Coach:
    def __init__(self, paths: Paths, store: ProfileStore,
                 agent_factory: Callable[[Any], Any] = _default_factory) -> None:
        self._paths = paths
        self._store = store
        self._factory = agent_factory
        self._agents: dict[str, Any] = {}
        self._histories: dict[tuple[str, str], list[dict]] = {}
        self._lock = threading.Lock()

    def _agent(self, pid: str) -> Any:
        key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not key:
            raise CoachUnavailable("Geen Claude API-key ingesteld. Zet ANTHROPIC_API_KEY in .env.")
        with self._lock:
            if pid not in self._agents:
                from garmin_insights.config import Settings

                profile = self._store.get(pid)
                settings = Settings(
                    sqlite_db_path=str(self._paths.db(pid)),
                    anthropic_api_key=key,
                    claude_model=os.environ.get("CLAUDE_MODEL", DEFAULT_MODEL),
                    display_name=profile.name,
                )
                self._agents[pid] = self._factory(settings)
            return self._agents[pid]

    def chat(self, pid: str, session_id: str, message: str) -> str:
        agent = self._agent(pid)
        history = self._histories.setdefault((pid, session_id), [])
        reply = agent.chat(message + DUTCH, history=history)
        if len(history) > MAX_HISTORY_MESSAGES:
            del history[: len(history) - MAX_HISTORY_MESSAGES]
            while history and history[0].get("role") != "user":
                history.pop(0)
        return reply

    def reset(self, pid: str, session_id: str) -> None:
        self._histories.pop((pid, session_id), None)

    def forget(self, pid: str) -> None:
        with self._lock:
            self._agents.pop(pid, None)
        for k in [k for k in self._histories if k[0] == pid]:
            del self._histories[k]

    def copy_prompt(self, pid: str) -> str:
        profile = self._store.get(pid)
        b = build_bundle(self._paths.db(pid), days=60)

        def avg(rows: list[dict], key: str, n: int) -> str:
            vals = [r[key] for r in rows[-n:] if r.get(key) is not None]
            return f"{mean(vals):.0f}" if vals else "onbekend"

        daily, sleep = b["daily"], b["sleep"]
        last = next((d for d in reversed(daily) if d.get("resting_hr")), {})
        lines = [
            f"Je bent mijn persoonlijke sport- en gezondheidscoach. Hieronder staan mijn Garmin-gegevens "
            f"({profile.name}). Geef concrete, korte adviezen. Dit is geen medisch advies; stel geen diagnoses.",
            "",
            f"Laatste dag met data: {b['last_data_date'] or 'onbekend'}",
            f"Rusthartslag laatst: {last.get('resting_hr', 'onbekend')} bpm "
            f"(7 dagen gem. {avg(daily, 'resting_hr', 7)}, 30 dagen gem. {avg(daily, 'resting_hr', 30)})",
            f"Slaapscore 7 dagen gem.: {avg(sleep, 'score', 7)}, 30 dagen gem.: {avg(sleep, 'score', 30)}",
            f"HRV vannacht 7 dagen gem.: {avg(sleep, 'hrv_overnight', 7)} ms, "
            f"30 dagen gem.: {avg(sleep, 'hrv_overnight', 30)} ms",
            f"Stappen 7 dagen gem.: {avg(daily, 'steps', 7)}",
            f"Body Battery bij opstaan 7 dagen gem.: {avg(daily, 'body_battery_wake', 7)}",
            "",
            "Trainingen laatste 30 dagen:",
        ]
        cutoff = sorted({a["date"] for a in b["activities"] if a["date"]})[-30:]
        for a in b["activities"]:
            if a["date"] in cutoff:
                km = f"{a['distance_m'] / 1000:.1f} km" if a.get("distance_m") else ""
                mins = f"{(a['duration_s'] or 0) / 60:.0f} min"
                hr = f"gem. HR {a['avg_hr']:.0f}" if a.get("avg_hr") else ""
                lines.append(f"- {a['date']} {a['sport']}: {a['name'] or ''} {km} {mins} {hr}".rstrip())
        lines += ["", "Mijn vraag: "]
        return "\n".join(lines)
