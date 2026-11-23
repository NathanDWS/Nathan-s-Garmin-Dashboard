"""Daily 07:00 sync for every real profile, plus a 5 s poll that reaps finished syncs."""
from __future__ import annotations

import time
from typing import Any, Callable

from apscheduler.schedulers.background import BackgroundScheduler

from .profiles import ProfileStore
from .sample import DEMO_ID

STAGGER_S = 60


def run_daily(manager: Any, store: ProfileStore, sleep: Callable[[float], None] = time.sleep) -> None:
    pids = [p.id for p in store.list() if p.id != DEMO_ID]
    for i, pid in enumerate(pids):
        if i:
            sleep(STAGGER_S)
        manager.start(pid)


def start_daily(manager: Any, store: ProfileStore, hour: int, autostart: bool = True) -> BackgroundScheduler:
    sched = BackgroundScheduler()
    sched.add_job(run_daily, "cron", hour=hour, minute=0, args=[manager, store], id="daily-sync",
                  max_instances=1, coalesce=True, misfire_grace_time=3600)
    sched.add_job(manager.poll, "interval", seconds=5, id="poll", max_instances=1, coalesce=True)
    if autostart:
        sched.start()
    return sched
