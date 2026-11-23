"""Up to three "what stands out today" cards, from garmin_insights' baseline anomaly scan."""
from __future__ import annotations

import logging
from typing import Any

from .config import Paths

log = logging.getLogger(__name__)
MIN_BASELINE_DAYS = 14
MAX_ITEMS = 3

# metric → (Dutch label, unit, direction that is good: +1 higher is better, -1 lower is better)
LABELS: dict[str, tuple[str, str, int]] = {
    "restingHeartRate": ("Rusthartslag", "bpm", -1),
    "avgOvernightHrv": ("HRV vannacht", "ms", 1),
    "sleepScore": ("Slaapscore", "", 1),
    "deepSleepSeconds": ("Diepe slaap", "min", 1),
    "remSleepSeconds": ("REM-slaap", "min", 1),
    "stressPercentage": ("Stress", "%", -1),
    "highStressPercentage": ("Hoge stress", "%", -1),
    "bodyBatteryAtWakeTime": ("Body Battery bij opstaan", "", 1),
    "bodyBatteryHighestValue": ("Body Battery hoogste", "", 1),
    "averageRespirationValue": ("Ademhaling", "/min", -1),
    "averageSpo2": ("Bloedzuurstof", "%", 1),
    "lowestSpo2Value": ("Laagste bloedzuurstof", "%", 1),
    "totalSteps": ("Stappen", "", 1),
    "avgSleepStress": ("Stress tijdens slaap", "", -1),
}


def _fmt(metric: str, v: float) -> str:
    if metric.endswith("Seconds"):
        v = v / 60
    return f"{v:.0f}" if abs(v) >= 10 else f"{v:.1f}"


def _card(f: dict[str, Any]) -> dict[str, Any] | None:
    meta = LABELS.get(f.get("metric", ""))
    if not meta:
        return None
    label, unit, good = meta
    higher = f["direction"] == "above"
    favourable = (1 if higher else -1) == good
    word = "hoger" if higher else "lager"
    unit_s = unit if unit in ("%", "/min") else (f" {unit}" if unit else "")
    return {
        "title": f"{label} {word} dan normaal",
        "detail": f"{_fmt(f['metric'], f['value'])}{unit_s} op {f['date']}, je gemiddelde is "
                  f"{_fmt(f['metric'], f['baseline_mean'])}{unit_s}.",
        "severity": "info" if favourable or abs(f["z_score"]) < 2 else "let_op",
        "metric": f["metric"],
        "date": f["date"],
        "_z": abs(f["z_score"]),
    }


def today(paths: Paths, pid: str) -> list[dict[str, Any]]:
    db = paths.db(pid)
    if not db.exists():
        return []
    try:
        from garmin_insights.config import Settings
        from garmin_insights.db.cache import CacheBuilder
        from garmin_insights.db.memory import MemoryStore
        from garmin_insights.db.sqlite_repo import SqliteRepo
        from garmin_insights.insights.proactive import InsightScanner
        from garmin_insights.tools.analysis_tools import AnalysisEngine

        settings = Settings(sqlite_db_path=str(db), anthropic_api_key="")
        memory = MemoryStore(settings)
        memory.initialise_schema()
        CacheBuilder(SqliteRepo(settings), memory).refresh(days=45)
        analysis = AnalysisEngine(memory)
        if analysis.baseline_days_available() < MIN_BASELINE_DAYS:
            return []
        findings = InsightScanner(memory, analysis).scan_anomalies()
    except Exception:  # noqa: BLE001 - insights are a nice-to-have
        log.exception("insights failed for %s", pid)
        return []

    latest: dict[str, dict[str, Any]] = {}
    for f in findings:
        card = _card(f)
        if card and (card["metric"] not in latest or card["date"] > latest[card["metric"]]["date"]):
            latest[card["metric"]] = card
    cards = sorted(latest.values(), key=lambda c: (c["severity"] != "let_op", -c["_z"]))[:MAX_ITEMS]
    for c in cards:
        del c["_z"]
    return cards
