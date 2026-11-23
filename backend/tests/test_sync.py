import json
from datetime import date

import pytest

from dashboard import sync_runner
from dashboard.profiles import ProfileStore
from dashboard.sync import SyncManager


class FakeProc:
    def __init__(self):
        self.code = None

    def poll(self):
        return self.code


class FakeLauncher:
    def __init__(self):
        self.procs = []
        self.args = []

    def __call__(self, args, **kw):
        p = FakeProc()
        self.procs.append(p)
        self.args.append(args)
        return p


@pytest.fixture
def mgr(paths):
    store = ProfileStore(paths)
    store.add("A", "a@x.nl")
    launcher = FakeLauncher()
    return SyncManager(paths, store, launcher=launcher), launcher


def test_second_sync_rejected(mgr):
    m, launcher = mgr
    assert m.start("a") is True
    assert m.start("a") is False
    assert len(launcher.procs) == 1
    assert m.status("a")["state"] == "running"


def test_sync_allowed_again_after_finish(mgr):
    m, launcher = mgr
    m.start("a")
    launcher.procs[0].code = 0
    m.poll()
    assert m.start("a") is True


@pytest.mark.parametrize("code,state", [(0, "ok"), (2, "needs_reconnect"), (3, "rate_limited"), (1, "error")])
def test_runner_exit_codes_map_to_status(mgr, code, state):
    m, launcher = mgr
    m.start("a")
    launcher.procs[0].code = code
    m.poll()
    st = m.status("a")
    assert st["state"] == state
    assert (st["last_success"] is not None) == (code == 0)
    assert st["finished_at"]


def test_status_persisted(mgr, paths):
    m, launcher = mgr
    m.start("a", start="2026-01-01")
    assert "--start" in launcher.args[0] and "2026-01-01" in launcher.args[0]
    launcher.procs[0].code = 0
    m.poll()
    saved = json.loads(paths.status("a").read_text())
    assert saved["state"] == "ok"


def test_stale_running_marked_error_on_startup(paths):
    store = ProfileStore(paths)
    store.add("A", "a@x.nl")
    paths.status("a").parent.mkdir(parents=True, exist_ok=True)
    paths.status("a").write_text(json.dumps({"state": "running", "started_at": "x"}))
    m = SyncManager(paths, store, launcher=FakeLauncher())
    st = m.status("a")
    assert st["state"] == "error" and st["message"] == "Sync onderbroken"


def test_unknown_profile_status_idle(mgr):
    m, _ = mgr
    assert m.status("a")["state"] == "idle"


def test_runner_start_date():
    today = date(2026, 11, 23)
    assert sync_runner.compute_start(None, today) == "2025-11-23"
    assert sync_runner.compute_start("2026-11-20", today) == "2026-11-14"


def test_runner_never_prompts(paths, monkeypatch):
    import builtins

    import garminconnect

    def boom(*a, **k):
        raise AssertionError("input() called")

    monkeypatch.setattr(builtins, "input", boom)

    def no_tokens(self, tokenstore=None):
        raise FileNotFoundError(tokenstore)

    monkeypatch.setattr(garminconnect.Garmin, "login", no_tokens)
    store = ProfileStore(paths)
    store.add("A", "a@x.nl")
    monkeypatch.setenv("DASHBOARD_ROOT", str(paths.root))
    assert sync_runner.main(["--profile", "a"]) == 2


def test_daily_job_skips_demo_and_staggers(paths):
    from dashboard.scheduler import run_daily

    store = ProfileStore(paths)
    store.add("Voorbeeld", "", pid="demo")
    store.add("A", "a@x.nl")
    store.add("B", "b@x.nl")
    started, slept = [], []
    run_daily(type("M", (), {"start": lambda self, pid: started.append(pid) or True})(), store,
              sleep=slept.append)
    assert started == ["a", "b"]
    assert slept == [60]


def test_scheduler_registers_cron_hour(paths):
    from dashboard.scheduler import start_daily

    sched = start_daily(SyncManager(paths, ProfileStore(paths), launcher=FakeLauncher()),
                        ProfileStore(paths), hour=7, autostart=False)
    job = sched.get_job("daily-sync")
    assert str(job.trigger.fields[5]) == "7"  # hour field
