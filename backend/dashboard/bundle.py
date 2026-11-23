"""Turn a profile's SQLite database (written by garmin_grafana) into the JSON the frontend reads.

Missing tables, missing columns or a missing file never raise: the matching list is empty.
"""
from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

SPORTS = {
    "hardlopen": {"running", "trail_running", "treadmill_running", "track_running",
                  "street_running", "indoor_running", "virtual_run"},
    "fietsen": {"cycling", "road_biking", "indoor_cycling", "mountain_biking", "virtual_ride",
                "gravel_cycling", "e_bike_fitness", "e_bike_mountain"},
    "zwemmen": {"lap_swimming", "open_water_swimming", "swimming"},
    "kracht": {"strength_training"},
    "wandelen": {"walking", "hiking", "casual_walking", "speed_walking"},
}
INDOOR = {"treadmill_running", "indoor_running", "indoor_cycling", "virtual_ride", "virtual_run"}


def sport_for(activity_type: str | None) -> str:
    t = (activity_type or "").lower()
    for sport, types in SPORTS.items():
        if t in types:
            return sport
    return "overig"


def _local_date(iso: str | None) -> str | None:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return iso[:10]
    if dt.tzinfo is not None:
        dt = dt.astimezone()
    return dt.date().isoformat()


def _rows(con: sqlite3.Connection, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    try:
        return con.execute(sql, params).fetchall()
    except sqlite3.OperationalError:
        return []


def _cols(con: sqlite3.Connection, table: str) -> set[str]:
    try:
        return {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
    except sqlite3.OperationalError:
        return set()


def _pick(con, table: str, mapping: dict[str, str], where: str, params: tuple, order: str):
    """SELECT only the columns that exist; absent ones come back as None."""
    have = _cols(con, table)
    if not have:
        return []
    select = ", ".join(f"{src} AS {dst}" if src in have else f"NULL AS {dst}"
                       for dst, src in mapping.items())
    return [dict(r) for r in _rows(con, f"SELECT {select} FROM {table} {where} ORDER BY {order}", params)]


def _last_per_day(rows: list[dict], key: str = "time") -> list[dict]:
    by_day: dict[str, dict] = {}
    for r in rows:
        d = _local_date(r.pop(key))
        if d:
            r["date"] = d
            by_day[d] = r
    return [by_day[d] for d in sorted(by_day)]


def _empty() -> dict[str, Any]:
    return {k: [] for k in ("daily", "sleep", "activities", "weigh_ins", "readiness",
                            "training_status", "vo2max", "blood_pressure")} | {"last_data_date": None}


def build_bundle(db: Path, days: int = 400) -> dict[str, Any]:
    db = Path(db)
    if not db.exists():
        return _empty()
    since = (date.today() - timedelta(days=days)).isoformat()
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        out = _empty()
        out["daily"] = _pick(con, "daily_stats", {
            "date": "date", "steps": "total_steps", "distance_m": "total_distance_meters",
            "active_kcal": "active_kilocalories", "resting_hr": "resting_heart_rate",
            "stress_avg": "stress_percentage", "body_battery_high": "body_battery_highest_value",
            "body_battery_low": "body_battery_lowest_value", "body_battery_wake": "body_battery_at_wake_time",
            "spo2_avg": "average_spo2", "spo2_low": "lowest_spo2",
            "moderate_min": "moderate_intensity_minutes", "vigorous_min": "vigorous_intensity_minutes",
            "floors": "floors_ascended",
        }, "WHERE date >= ?", (since,), "date")
        out["sleep"] = _pick(con, "sleep_summary", {
            "date": "date", "total_s": "sleep_time_seconds", "deep_s": "deep_sleep_seconds",
            "light_s": "light_sleep_seconds", "rem_s": "rem_sleep_seconds", "awake_s": "awake_sleep_seconds",
            "score": "sleep_score", "hrv_overnight": "avg_overnight_hrv",
            "respiration_avg": "average_respiration_value", "spo2_avg": "average_spo2_value",
        }, "WHERE date >= ?", (since,), "date")

        acts = _pick(con, "activity_summary", {
            "id": "activity_id", "start": "time", "type": "activity_type", "name": "activity_name",
            "duration_s": "elapsed_duration", "moving_s": "moving_duration", "distance_m": "distance",
            "avg_speed": "average_speed", "avg_hr": "average_hr", "max_hr": "max_hr", "kcal": "calories",
            "avg_power": "avg_power", "z1": "hr_time_in_zone_1", "z2": "hr_time_in_zone_2",
            "z3": "hr_time_in_zone_3", "z4": "hr_time_in_zone_4", "z5": "hr_time_in_zone_5",
        }, "WHERE time >= ?", (since,), "time")
        for a in acts:
            a["date"] = _local_date(a["start"])
            a["sport"] = sport_for(a["type"])
            a["indoor"] = (a["type"] or "").lower() in INDOOR
            a["hr_zones"] = [a.pop(z) or 0 for z in ("z1", "z2", "z3", "z4", "z5")]
        out["activities"] = acts

        out["weigh_ins"] = _last_per_day(_pick(con, "body_composition", {
            "time": "time", "weight_kg": "weight", "body_fat_pct": "body_fat",
            "muscle_kg": "muscle_mass", "bmi": "bmi",
        }, "WHERE time >= ? AND weight IS NOT NULL", (since,), "time"))
        out["readiness"] = _last_per_day(_pick(con, "training_readiness", {
            "time": "time", "score": "score", "level": "level", "recovery_time_min": "recovery_time",
        }, "WHERE time >= ?", (since,), "time"))
        out["training_status"] = _last_per_day(_pick(con, "training_status", {
            "time": "time", "status": "training_status", "acute_load": "daily_training_load_acute",
            "chronic_load": "daily_training_load_chronic", "acwr": "daily_acute_chronic_workload_ratio",
        }, "WHERE time >= ?", (since,), "time"))
        vo2 = _last_per_day(_pick(con, "vo2_max", {
            "time": "time", "run": "vo2_max_value", "bike": "vo2_max_value_cycling",
        }, "WHERE time >= ?", (since,), "time"))
        out["vo2max"] = [
            {"date": v["date"], "value": v[k], "sport": s}
            for v in vo2 for k, s in (("run", "hardlopen"), ("bike", "fietsen")) if v[k]
        ]
        out["blood_pressure"] = _last_per_day(_pick(con, "blood_pressure", {
            "time": "time", "systolic": "systolic", "diastolic": "diastolic", "pulse": "pulse",
        }, "WHERE time >= ?", (since,), "time"))

        dates = [r["date"] for key in ("daily", "sleep") for r in out[key][-1:]]
        dates += [a["date"] for a in out["activities"][-1:] if a["date"]]
        out["last_data_date"] = max(dates) if dates else None
        return out
    finally:
        con.close()


def activity_track(db: Path, activity_id: int, max_points: int = 1500) -> list[dict]:
    db = Path(db)
    if not db.exists():
        return []
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        rows = _rows(con, "SELECT latitude, longitude, heart_rate, time FROM activity_gps "
                          "WHERE activity_id = ? AND latitude IS NOT NULL AND longitude IS NOT NULL "
                          "ORDER BY time", (activity_id,))
    finally:
        con.close()
    if len(rows) > max_points:
        step = (len(rows) - 1) / (max_points - 1)
        rows = [rows[round(i * step)] for i in range(max_points)]
    return [{"lat": r[0], "lon": r[1], "hr": r[2], "t": r[3]} for r in rows]
