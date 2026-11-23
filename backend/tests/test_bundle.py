import sqlite3
from datetime import date

from garmin_grafana.sqlite_manager import GarminDB

from dashboard.bundle import activity_track, build_bundle, sport_for
from dashboard.profiles import ProfileStore
from dashboard.sample import seed_demo


def _schema_db(tmp_path):
    db = tmp_path / "garmin.db"
    GarminDB(str(db))
    return db


def test_bundle_empty_db(tmp_path):
    b = build_bundle(_schema_db(tmp_path))
    for key in ("daily", "sleep", "activities", "weigh_ins", "readiness",
                "training_status", "vo2max", "blood_pressure"):
        assert b[key] == [], key
    assert b["last_data_date"] is None


def test_bundle_missing_file_and_table(tmp_path):
    db = tmp_path / "bare.db"
    sqlite3.connect(db).close()
    b = build_bundle(db)
    assert b["vo2max"] == [] and b["daily"] == []
    assert build_bundle(tmp_path / "nope.db")["sleep"] == []


def test_sport_mapping():
    assert sport_for("treadmill_running") == "hardlopen"
    assert sport_for("indoor_cycling") == "fietsen"
    assert sport_for("lap_swimming") == "zwemmen"
    assert sport_for("strength_training") == "kracht"
    assert sport_for("hiking") == "wandelen"
    assert sport_for("yoga") == "overig"
    assert sport_for(None) == "overig"


def test_daily_row_fields(tmp_path):
    db = _schema_db(tmp_path)
    con = sqlite3.connect(db)
    con.execute(
        "INSERT INTO daily_stats (date, time, total_steps, resting_heart_rate, average_spo2,"
        " body_battery_at_wake_time) VALUES ('2026-11-20','2026-11-20T12:00:00+00:00',9000,52,96,80)"
    )
    con.commit()
    con.close()
    b = build_bundle(db)
    row = b["daily"][0]
    assert row["date"] == "2026-11-20"
    assert row["steps"] == 9000 and row["resting_hr"] == 52
    assert row["spo2_avg"] == 96 and row["body_battery_wake"] == 80
    assert b["last_data_date"] == "2026-11-20"


def test_demo_seed_has_recent_data(paths):
    store = ProfileStore(paths)
    profile = seed_demo(paths, store)
    assert profile.id == "demo"
    b = build_bundle(paths.db("demo"))
    assert len(b["sleep"]) >= 60
    assert b["last_data_date"] == date.today().isoformat()
    assert b["readiness"] and b["activities"]


def test_track_downsampled(tmp_path):
    db = _schema_db(tmp_path)
    con = sqlite3.connect(db)
    rows = [(f"2026-11-20T10:{i // 60:02d}:{i % 60:02d}+00:00", 7, "dev", 52.0 + i / 1e5, 4.9, 120 + i % 30)
            for i in range(5000)]
    con.executemany(
        "INSERT INTO activity_gps (time, activity_id, device, latitude, longitude, heart_rate)"
        " VALUES (?,?,?,?,?,?)", rows)
    con.commit()
    con.close()
    pts = activity_track(db, 7)
    assert len(pts) <= 1500
    assert pts[0]["lat"] == 52.0
    assert abs(pts[-1]["lat"] - (52.0 + 4999 / 1e5)) < 1e-9
