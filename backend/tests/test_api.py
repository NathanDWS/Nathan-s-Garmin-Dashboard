import pytest
from fastapi.testclient import TestClient

from dashboard.api import create_app
from dashboard.coach import CoachUnavailable
from dashboard.garmin_auth import LoginResult
from dashboard.profiles import ProfileStore
from dashboard.sample import seed_demo

SECRET = "Sup3r-geheim#"


class FakeAuth:
    def __init__(self, result="ok"):
        self.result = result
        self.calls = []
        self.pending = {}

    def start(self, pid, email, password, remember):
        self.calls.append((pid, email, password, remember))
        if self.result == "needs_mfa":
            self.pending["L1"] = pid
            return LoginResult("needs_mfa", login_id="L1")
        return LoginResult(self.result, message="msg")

    def finish_mfa(self, login_id, code):
        return LoginResult("ok") if self.pending.pop(login_id, None) else LoginResult("error", message="x")

    def pending_profile(self, login_id):
        return self.pending.get(login_id)


class FakeSync:
    def __init__(self):
        self.started = []
        self.running = set()

    def start(self, pid, start=None):
        if pid in self.running:
            return False
        self.started.append(pid)
        self.running.add(pid)
        return True

    def status(self, pid):
        return {"state": "running" if pid in self.running else "idle"}

    def forget(self, pid):
        self.running.discard(pid)


class FakeCoach:
    def __init__(self, unavailable=False):
        self.unavailable = unavailable

    def chat(self, pid, session_id, message):
        if self.unavailable:
            raise CoachUnavailable("Geen Claude API-key ingesteld. Zet ANTHROPIC_API_KEY in .env.")
        return f"{pid}:{message}"

    def reset(self, pid, session_id):
        pass

    def forget(self, pid):
        pass

    def copy_prompt(self, pid):
        return "prompt " + pid


def make(paths, auth=None, coach=None, demo=False):
    store = ProfileStore(paths)
    if demo:
        seed_demo(paths, store)
    auth, sync = auth or FakeAuth(), FakeSync()
    app = create_app(paths, store=store, auth=auth, sync=sync, coach=coach or FakeCoach())
    return TestClient(app), store, auth, sync


def add_body(**kw):
    return {"name": "Papa", "email": "p@x.nl", "password": SECRET, "remember_password": False} | kw


def test_list_profiles(paths):
    client, *_ = make(paths, demo=True)
    body = client.get("/api/profiles").json()
    assert body[0]["id"] == "demo" and body[0]["name"] == "Voorbeeld"
    assert body[0]["last_data_date"] and body[0]["sync"]["state"] == "idle"
    assert body[0]["has_saved_password"] is False


def test_add_profile_ok_starts_sync(paths):
    client, store, auth, sync = make(paths)
    r = client.post("/api/profiles", json=add_body(remember_password=True))
    assert r.status_code == 201 and r.json()["profile"]["id"] == "papa"
    assert auth.calls == [("papa", "p@x.nl", SECRET, True)]
    assert sync.started == ["papa"]


def test_add_profile_needs_mfa_then_ok(paths):
    client, store, auth, sync = make(paths, auth=FakeAuth("needs_mfa"))
    r = client.post("/api/profiles", json=add_body())
    assert r.status_code == 200 and r.json() == {"status": "needs_mfa", "login_id": "L1"}
    assert sync.started == []
    r = client.post("/api/profiles/mfa", json={"login_id": "L1", "code": "123456"})
    assert r.status_code == 201 and r.json()["profile"]["id"] == "papa"
    assert sync.started == ["papa"]


@pytest.mark.parametrize("result,code", [("bad_credentials", 400), ("rate_limited", 429), ("error", 502)])
def test_add_profile_failure_removes_profile(paths, result, code):
    client, store, *_ = make(paths, auth=FakeAuth(result))
    r = client.post("/api/profiles", json=add_body())
    assert r.status_code == code and r.json()["status"] == result
    assert store.list() == []


def test_add_profile_requires_fields(paths):
    client, *_ = make(paths)
    assert client.post("/api/profiles", json=add_body(email="")).status_code == 422


def test_reconnect(paths):
    client, store, auth, sync = make(paths)
    store.add("Papa", "p@x.nl")
    r = client.post("/api/profiles/papa/reconnect", json={"password": SECRET, "remember_password": False})
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert sync.started == ["papa"]


def test_delete_profile(paths):
    client, store, *_ = make(paths)
    store.add("Papa", "p@x.nl")
    assert client.delete("/api/profiles/papa").status_code == 204
    assert store.list() == []


def test_sync_conflict(paths):
    client, store, *_ = make(paths)
    store.add("Papa", "p@x.nl")
    assert client.post("/api/profiles/papa/sync").status_code == 202
    r = client.post("/api/profiles/papa/sync")
    assert r.status_code == 409 and r.json()["status"] == "already_running"


def test_bundle_and_track(paths):
    client, *_ = make(paths, demo=True)
    b = client.get("/api/profiles/demo/bundle").json()
    assert b["sleep"]
    with_gps = [a for a in b["activities"] if a["type"] in ("running", "road_biking")][-1]
    pts = client.get(f"/api/profiles/demo/activities/{with_gps['id']}/track").json()
    assert pts and {"lat", "lon"} <= set(pts[0])


def test_insights(paths):
    client, *_ = make(paths, demo=True)
    assert isinstance(client.get("/api/profiles/demo/insights").json(), list)


def test_goals_default_and_put(paths):
    client, store, *_ = make(paths)
    store.add("Papa", "p@x.nl")
    g = client.get("/api/profiles/papa/goals").json()
    assert g == {"hardlopen_km": 20, "fietsen_km": 60, "zwemmen_km": 0, "kracht_sessies": 2,
                 "stappen_per_dag": 10000}
    r = client.put("/api/profiles/papa/goals", json=g | {"hardlopen_km": 30})
    assert r.json()["hardlopen_km"] == 30
    assert client.get("/api/profiles/papa/goals").json()["hardlopen_km"] == 30
    assert client.put("/api/profiles/papa/goals", json=g | {"hardlopen_km": -1}).status_code == 422


def test_chat_and_prompt(paths):
    client, store, *_ = make(paths)
    store.add("Papa", "p@x.nl")
    assert client.post("/api/profiles/papa/chat", json={"session_id": "s", "message": "hoi"}).json() == \
        {"reply": "papa:hoi"}
    assert client.post("/api/profiles/papa/chat/reset", json={"session_id": "s"}).status_code == 204
    assert client.get("/api/profiles/papa/prompt").json() == {"text": "prompt papa"}


def test_chat_unavailable_503(paths):
    client, store, *_ = make(paths, coach=FakeCoach(unavailable=True))
    store.add("Papa", "p@x.nl")
    r = client.post("/api/profiles/papa/chat", json={"session_id": "s", "message": "hoi"})
    assert r.status_code == 503 and "ANTHROPIC_API_KEY" in r.json()["error"]


@pytest.mark.parametrize("method,url", [
    ("get", "/api/profiles/nope/bundle"), ("get", "/api/profiles/nope/goals"),
    ("post", "/api/profiles/nope/sync"), ("delete", "/api/profiles/nope"),
    ("get", "/api/profiles/nope/insights"),
])
def test_unknown_profile_404(paths, method, url):
    client, *_ = make(paths)
    assert getattr(client, method)(url).status_code == 404


def test_password_not_in_any_response(paths):
    for result in ("ok", "needs_mfa", "bad_credentials", "error"):
        client, *_ = make(paths, auth=FakeAuth(result))
        r = client.post("/api/profiles", json=add_body(remember_password=True))
        assert SECRET not in r.text
        assert SECRET not in client.get("/api/profiles").text
        for p in ProfileStore(paths).list():
            ProfileStore(paths).remove(p.id)


def test_spa_fallback(paths, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>app</html>")
    store = ProfileStore(paths)
    app = create_app(paths, store=store, auth=FakeAuth(), sync=FakeSync(), coach=FakeCoach(), static_dir=dist)
    c = TestClient(app)
    assert "app" in c.get("/").text
    assert "app" in c.get("/trainingen").text
    assert c.get("/").headers["cache-control"] == "no-cache"
    assert c.get("/api/nope").status_code == 404


def test_spa_never_touches_unc_or_absolute_paths(paths, tmp_path, monkeypatch):
    import pathlib

    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>app</html>")
    app = create_app(paths, store=ProfileStore(paths), auth=FakeAuth(), sync=FakeSync(), coach=FakeCoach(),
                     static_dir=dist)
    touched = []
    real_resolve, real_is_file = pathlib.Path.resolve, pathlib.Path.is_file
    monkeypatch.setattr(pathlib.Path, "resolve", lambda self, *a, **k: touched.append(str(self)) or real_resolve(self, *a, **k))
    monkeypatch.setattr(pathlib.Path, "is_file", lambda self: touched.append(str(self)) or real_is_file(self))
    c = TestClient(app)
    for url in ("/%5C%5Cevil.example%5Cshare%5Cx", "/C:%5Cwindows%5Cwin.ini", "//evil.example/share/x"):
        r = c.get(url)
        assert r.status_code == 200 and "app" in r.text
    assert not [t for t in touched if "evil" in t or "windows" in t.lower()]


def test_delete_during_sync_reports_failure_and_keeps_profile(paths, monkeypatch):
    client, store, *_ = make(paths)
    store.add("Papa", "p@x.nl")
    paths.db("papa").parent.mkdir(parents=True)
    paths.db("papa").write_text("x")

    def locked(*a, **k):
        raise PermissionError("in use")

    monkeypatch.setattr("dashboard.profiles.shutil.rmtree", locked)
    monkeypatch.setattr("dashboard.profiles.time.sleep", lambda s: None)
    r = client.delete("/api/profiles/papa")
    assert r.status_code == 409
    assert [p.id for p in store.list()] == ["papa"]


class MfaFailAuth(FakeAuth):
    def __init__(self, outcome):
        super().__init__("needs_mfa")
        self.outcome = outcome

    def finish_mfa(self, login_id, code):
        if self.outcome == "bad_code":
            return LoginResult("bad_code", message="Code klopt niet.")
        self.pending.pop(login_id, None)
        return LoginResult("error", message="x")


def test_wrong_mfa_code_keeps_profile_for_retry(paths):
    client, store, *_ = make(paths, auth=MfaFailAuth("bad_code"))
    client.post("/api/profiles", json=add_body())
    r = client.post("/api/profiles/mfa", json={"login_id": "L1", "code": "1"})
    assert r.status_code == 400 and r.json()["status"] == "bad_code"
    assert [p.id for p in store.list()] == ["papa"]


def test_failed_mfa_in_add_mode_removes_profile(paths):
    client, store, *_ = make(paths, auth=MfaFailAuth("error"))
    client.post("/api/profiles", json=add_body())
    r = client.post("/api/profiles/mfa", json={"login_id": "L1", "code": "1"})
    assert r.status_code == 502
    assert store.list() == []
