"""Starts sync_runner subprocesses, one at most per profile, and tracks their status."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from datetime import datetime
from typing import Any, Callable

from .config import Paths
from .profiles import ProfileStore

STATE_BY_EXIT = {0: "ok", 2: "needs_reconnect", 3: "rate_limited"}


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _idle() -> dict[str, Any]:
    return {"state": "idle", "started_at": None, "finished_at": None, "last_success": None, "message": None}


class SyncManager:
    def __init__(self, paths: Paths, store: ProfileStore, launcher: Callable[..., Any] = subprocess.Popen) -> None:
        self._paths = paths
        self._store = store
        self._launch = launcher
        self._procs: dict[str, Any] = {}
        self._logs: dict[str, Any] = {}
        self._lock = threading.Lock()
        for p in store.list():
            st = self._read(p.id)
            if st["state"] == "running":
                self._write(p.id, st | {"state": "error", "finished_at": _now(), "message": "Sync onderbroken"})

    def _read(self, pid: str) -> dict[str, Any]:
        f = self._paths.status(pid)
        if not f.exists():
            return _idle()
        try:
            return _idle() | json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return _idle()

    def _write(self, pid: str, st: dict[str, Any]) -> None:
        f = self._paths.status(pid)
        f.parent.mkdir(parents=True, exist_ok=True)
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps(st), encoding="utf-8")
        os.replace(tmp, f)

    def status(self, pid: str) -> dict[str, Any]:
        return self._read(pid)

    def is_running(self, pid: str) -> bool:
        proc = self._procs.get(pid)
        return proc is not None and proc.poll() is None

    def start(self, pid: str, start: str | None = None) -> bool:
        with self._lock:
            self._store.get(pid)
            if self.is_running(pid):
                return False
            args = [sys.executable, "-m", "dashboard.sync_runner", "--profile", pid]
            if start:
                args += ["--start", start]
            log_path = self._paths.log(pid)
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log = open(log_path, "w", encoding="utf-8")  # noqa: SIM115 - closed in poll()
            env = os.environ | {"DASHBOARD_ROOT": str(self._paths.root), "PYTHONUNBUFFERED": "1"}
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            try:
                proc = self._launch(args, stdout=log, stderr=subprocess.STDOUT, env=env, creationflags=flags)
            except Exception as err:
                log.close()
                self._write(pid, self._read(pid) | {"state": "error", "message": str(err), "finished_at": _now()})
                return False
            self._procs[pid] = proc
            self._logs[pid] = log
            self._write(pid, self._read(pid) | {"state": "running", "started_at": _now(),
                                                "finished_at": None, "message": None})
            return True

    def poll(self) -> None:
        with self._lock:
            for pid, proc in list(self._procs.items()):
                code = proc.poll()
                if code is None:
                    continue
                del self._procs[pid]
                log = self._logs.pop(pid, None)
                if log:
                    log.close()
                state = STATE_BY_EXIT.get(code, "error")
                st = self._read(pid) | {"state": state, "finished_at": _now(), "message": None}
                if state == "ok":
                    st["last_success"] = st["finished_at"]
                elif state == "error":
                    st["message"] = f"Ophalen mislukt (code {code}). Zie data/{pid}/sync.log"
                self._write(pid, st)

    def forget(self, pid: str) -> None:
        with self._lock:
            proc = self._procs.pop(pid, None)
            if proc is not None and hasattr(proc, "terminate"):
                proc.terminate()
            log = self._logs.pop(pid, None)
            if log:
                log.close()
