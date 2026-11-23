"""Demo profile "Voorbeeld" built from garmin-claude-dashboard's fictional sample athlete.

Dates are shifted so the newest sample day is today. Metrics the sample set lacks
(readiness, HRV, Body Battery, SpO2, load, VO2max, GPS) are synthesised deterministically.
"""
from __future__ import annotations

import json
import math
import random
import sqlite3
from datetime import date, datetime, timedelta
from importlib import resources

from garmin_grafana.sqlite_manager import GarminDB

from .config import Paths
from .profiles import Profile, ProfileStore

DEMO_ID = "demo"


def _load(name: str) -> list[dict]:
    return json.loads(resources.files("dashboard.sample_data").joinpath(f"{name}.json").read_text("utf-8"))


def _shift_date(d: str, delta: timedelta) -> str:
    return (date.fromisoformat(d[:10]) + delta).isoformat()


def _shift_ts(ts: str, delta: timedelta) -> str:
    return (datetime.fromisoformat(ts) + delta).isoformat()


def seed_demo(paths: Paths, store: ProfileStore) -> Profile:
    try:
        profile = store.get(DEMO_ID)
    except KeyError:
        profile = store.add("Voorbeeld", "", pid=DEMO_ID)
    db = paths.db(DEMO_ID)
    db.parent.mkdir(parents=True, exist_ok=True)
    if db.exists():
        db.unlink()
    GarminDB(str(db))

    daily = _load("daily_summary")
    delta = date.today() - date.fromisoformat(daily[-1]["summary_date"])
    rnd = random.Random(42)
    con = sqlite3.connect(db)
    try:
        sleep_by_day = {}
        for s in _load("sleep"):
            d = _shift_date(s["sleep_date"], delta)
            total = s["total_sleep_s"] or 0
            score = s["sleep_score"] or max(40, min(95, round(total / 3600 * 10 + rnd.gauss(0, 5))))
            hrv = round(58 + (score - 75) * 0.4 + rnd.gauss(0, 4), 1)
            sleep_by_day[d] = (score, hrv)
            con.execute(
                "INSERT INTO sleep_summary (date, time, sleep_time_seconds, deep_sleep_seconds,"
                " light_sleep_seconds, rem_sleep_seconds, awake_sleep_seconds, sleep_score,"
                " average_respiration_value, avg_sleep_stress, avg_overnight_hrv, average_spo2_value)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (d, f"{d}T06:30:00+00:00", total, s["deep_s"], s["light_s"], s["rem_s"], s.get("awake_s"),
                 score, s.get("avg_respiration"), s.get("avg_stress"), hrv, round(95.5 + rnd.gauss(0, 0.8), 1)),
            )

        for r in daily:
            d = _shift_date(r["summary_date"], delta)
            score, _ = sleep_by_day.get(d, (70, 55))
            wake = max(20, min(100, round(score * 0.9 + rnd.gauss(0, 6))))
            con.execute(
                "INSERT INTO daily_stats (date, time, total_steps, total_distance_meters, active_kilocalories,"
                " resting_heart_rate, min_heart_rate, max_heart_rate, moderate_intensity_minutes,"
                " vigorous_intensity_minutes, floors_ascended, stress_percentage, body_battery_highest_value,"
                " body_battery_lowest_value, body_battery_at_wake_time, average_spo2, lowest_spo2)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (d, f"{d}T12:00:00+00:00", r["total_steps"], r["distance_m"], r.get("active_calories"),
                 r["resting_hr"], r.get("min_hr"), r.get("max_hr"), r.get("moderate_min"), r.get("vigorous_min"),
                 r.get("floors_ascended"), max(5, min(80, round(28 + rnd.gauss(0, 8)))), wake,
                 max(5, wake - 55 + round(rnd.gauss(0, 8))), wake,
                 round(95.5 + rnd.gauss(0, 0.8), 1), round(89 + rnd.gauss(0, 1.5), 1)),
            )
            level = "HIGH" if score >= 80 else "MODERATE" if score >= 60 else "LOW"
            con.execute(
                "INSERT INTO training_readiness (time, device, level, score, sleep_score, recovery_time)"
                " VALUES (?,?,?,?,?,?)",
                (f"{d}T06:45:00+00:00", "demo", level, max(5, min(100, round(score + rnd.gauss(0, 8)))),
                 score, max(0, round(rnd.gauss(600, 400)))),
            )

        load_by_day: dict[str, float] = {}
        acts = _load("activities")
        for a in acts:
            start = _shift_ts(a["started_at"], delta)
            dur = a["duration_s"] or 0
            dist = a["distance_m"] or 0
            con.execute(
                "INSERT INTO activity_summary (activity_id, time, device, activity_name, activity_type, distance,"
                " elapsed_duration, moving_duration, average_speed, calories, average_hr, max_hr,"
                " hr_time_in_zone_1, hr_time_in_zone_2, hr_time_in_zone_3, hr_time_in_zone_4, hr_time_in_zone_5)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (a["activity_id"], start, "demo", a["name"], a["activity_type"], dist, dur, dur * 0.97,
                 dist / dur if dur else None, a["calories"], a["avg_hr"], a.get("max_hr"),
                 dur * 0.1, dur * 0.35, dur * 0.3, dur * 0.2, dur * 0.05),
            )
            d = start[:10]
            load_by_day[d] = load_by_day.get(d, 0) + (a.get("training_load") or 0)

        acute = chronic = 0.0
        day = date.fromisoformat(daily[0]["summary_date"]) + delta
        while day <= date.today():
            d = day.isoformat()
            load = load_by_day.get(d, 0)
            acute += (load - acute) / 7
            chronic += (load - chronic) / 28
            ratio = acute / chronic if chronic else None
            status = ("PRODUCTIVE" if ratio and 0.8 <= ratio <= 1.3 else
                      "OVERREACHING" if ratio and ratio > 1.3 else "MAINTAINING")
            con.execute(
                "INSERT INTO training_status (time, device, training_status, daily_training_load_acute,"
                " daily_training_load_chronic, daily_acute_chronic_workload_ratio) VALUES (?,?,?,?,?,?)",
                (f"{d}T12:00:00+00:00", "demo", status, round(acute * 7, 1), round(chronic * 7, 1),
                 round(ratio, 2) if ratio else None),
            )
            if day.weekday() == 0:
                weeks = (date.today() - day).days / 7
                con.execute(
                    "INSERT INTO vo2_max (time, device, vo2_max_value, vo2_max_value_cycling) VALUES (?,?,?,?)",
                    (f"{d}T12:00:00+00:00", "demo", round(52 - weeks * 0.03 + rnd.gauss(0, 0.3), 1),
                     round(55 - weeks * 0.03 + rnd.gauss(0, 0.3), 1)),
                )
            day += timedelta(days=1)

        for w in _load("weigh_ins"):
            con.execute(
                "INSERT INTO body_composition (time, device, weight, bmi, body_fat, body_water, bone_mass,"
                " muscle_mass) VALUES (?,?,?,?,?,?,?,?)",
                (_shift_ts(w["measured_at"], delta), "INDEX_SCALE", w["weight_kg"], w["bmi"], w["body_fat_pct"],
                 w["body_water_pct"], w["bone_mass_kg"], w["muscle_mass_kg"]),
            )

        outdoor = [a for a in acts if a["activity_type"] in ("running", "road_biking")][-15:]
        for a in outdoor:
            _seed_route(con, a, delta, rnd)
        con.commit()
    finally:
        con.close()
    return profile


def _seed_route(con: sqlite3.Connection, a: dict, delta: timedelta, rnd: random.Random) -> None:
    """A loop around Utrecht scaled to the activity's distance."""
    n = 400
    dist_km = (a["distance_m"] or 5000) / 1000
    radius = dist_km / (2 * math.pi) / 111
    lat0, lon0 = 52.09 + rnd.uniform(-0.02, 0.02), 5.12 + rnd.uniform(-0.03, 0.03)
    start = datetime.fromisoformat(a["started_at"]) + delta
    step = (a["duration_s"] or 1800) / n
    rows = []
    for i in range(n):
        ang = 2 * math.pi * i / n
        wobble = 1 + 0.15 * math.sin(ang * 5)
        rows.append((
            (start + timedelta(seconds=i * step)).isoformat(), a["activity_id"], "demo",
            lat0 + radius * wobble * math.sin(ang), lon0 + radius * wobble * math.cos(ang) * 1.6,
            round((a["avg_hr"] or 140) + 10 * math.sin(ang * 3)),
        ))
    con.executemany(
        "INSERT INTO activity_gps (time, activity_id, device, latitude, longitude, heart_rate) VALUES (?,?,?,?,?,?)",
        rows,
    )
