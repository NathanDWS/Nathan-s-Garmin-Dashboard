"""Garmin Connect login for a profile: password once (plus MFA code if asked), tokens kept.

The password is only written to .env when the user ticks "Wachtwoord onthouden".
It is never logged and never returned.
"""
from __future__ import annotations

import logging
import secrets
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Literal

from garmin_grafana.token_owner import write_token_owner
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectTooManyRequestsError,
)

from . import envfile
from .config import Paths
from .profiles import ProfileStore

log = logging.getLogger(__name__)
MFA_TTL_S = 600
MFA_MAX_TRIES = 3

Status = Literal["ok", "needs_mfa", "bad_code", "bad_credentials", "rate_limited", "error"]


@dataclass
class LoginResult:
    status: Status
    login_id: str | None = None
    message: str | None = None


@dataclass
class _Pending:
    client: Any
    state: Any
    pid: str
    email: str
    password: str
    remember: bool
    expires: float
    tries: int = 0


class AuthService:
    def __init__(self, paths: Paths, store: ProfileStore, client_factory: Callable[..., Any] = Garmin) -> None:
        self._paths = paths
        self._store = store
        self._factory = client_factory
        self._pending: dict[str, _Pending] = {}
        self._lock = threading.Lock()

    def start(self, pid: str, email: str, password: str, remember: bool) -> LoginResult:
        try:
            client = self._factory(email=email, password=password, return_on_mfa=True)
            status, state = client.login()
        except Exception as err:  # noqa: BLE001 - mapped below
            return self._map_error(err)
        if status == "needs_mfa":
            login_id = secrets.token_urlsafe(16)
            with self._lock:
                self._purge()
                self._pending[login_id] = _Pending(client, state, pid, email, password, remember,
                                                   time.monotonic() + MFA_TTL_S)
            return LoginResult("needs_mfa", login_id=login_id)
        return self._success(client, pid, email, password, remember)

    def finish_mfa(self, login_id: str, code: str) -> LoginResult:
        with self._lock:
            self._purge()
            pending = self._pending.get(login_id)
            if pending is not None:
                pending.tries += 1
        if pending is None:
            return LoginResult("error", message="Deze inlogpoging is verlopen. Begin opnieuw.")
        try:
            pending.client.resume_login(pending.state, code.strip())
        except Exception as err:  # noqa: BLE001
            res = self._map_error(err)
            if res.status == "bad_credentials" and pending.tries < MFA_MAX_TRIES:
                return LoginResult("bad_code", message="Code klopt niet. Controleer de code en probeer het opnieuw.")
            with self._lock:
                self._pending.pop(login_id, None)
            if res.status == "bad_credentials":
                return LoginResult("error", message="Te vaak een verkeerde code. Begin opnieuw.")
            return res
        with self._lock:
            self._pending.pop(login_id, None)
        return self._success(pending.client, pending.pid, pending.email, pending.password, pending.remember)

    def pending_profile(self, login_id: str) -> str | None:
        with self._lock:
            p = self._pending.get(login_id)
            return p.pid if p else None

    def _success(self, client: Any, pid: str, email: str, password: str, remember: bool) -> LoginResult:
        token_dir = self._paths.tokens(pid)
        token_dir.mkdir(parents=True, exist_ok=True)
        client.client.dump(str(token_dir))
        write_token_owner(str(token_dir), email)
        var = self._store.password_var(pid)
        if remember:
            envfile.set_var(self._paths.env_file, var, password)
        else:
            envfile.remove_var(self._paths.env_file, var)
        return LoginResult("ok")

    def _purge(self) -> None:
        now = time.monotonic()
        for k in [k for k, p in self._pending.items() if p.expires < now]:
            del self._pending[k]

    @staticmethod
    def _map_error(err: Exception) -> LoginResult:
        if isinstance(err, GarminConnectTooManyRequestsError) or "429" in str(err):
            return LoginResult("rate_limited", message="Garmin blokkeert tijdelijk te veel inlogpogingen.")
        if isinstance(err, GarminConnectAuthenticationError):
            return LoginResult("bad_credentials", message="E-mail of wachtwoord klopt niet.")
        log.warning("Garmin login failed: %s", type(err).__name__)
        return LoginResult("error", message="Inloggen bij Garmin mislukt. Probeer het later opnieuw.")
