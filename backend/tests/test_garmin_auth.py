from garminconnect import GarminConnectAuthenticationError, GarminConnectTooManyRequestsError

from dashboard import envfile
from dashboard.garmin_auth import AuthService
from dashboard.profiles import ProfileStore


class FakeInner:
    def dump(self, path):
        from pathlib import Path

        Path(path).mkdir(parents=True, exist_ok=True)
        (Path(path) / "oauth2_token.json").write_text("{}")


def fake_factory(*, mfa=False, error=None):
    calls = {}

    class FakeGarmin:
        def __init__(self, email=None, password=None, return_on_mfa=False, **kw):
            calls["email"] = email
            self.client = FakeInner()

        def login(self, tokenstore=None):
            if error:
                raise error
            return ("needs_mfa", {"state": 1}) if mfa else (None, None)

        def resume_login(self, state, code):
            calls["mfa"] = (state, code)

    return FakeGarmin, calls


def _svc(paths, **kw):
    factory, calls = fake_factory(**kw)
    store = ProfileStore(paths)
    pid = store.add("Papa", "p@x.nl").id
    return AuthService(paths, store, client_factory=factory), store, pid, calls


def test_login_ok_writes_tokens_not_password(paths):
    svc, store, pid, _ = _svc(paths)
    res = svc.start(pid, "p@x.nl", "geheim", remember=False)
    assert res.status == "ok"
    assert (paths.tokens(pid) / "oauth2_token.json").exists()
    assert envfile.get_var(paths.env_file, store.password_var(pid)) is None


def test_login_remember_writes_password(paths):
    svc, store, pid, _ = _svc(paths)
    assert svc.start(pid, "p@x.nl", "geheim", remember=True).status == "ok"
    assert envfile.get_var(paths.env_file, store.password_var(pid)) == "geheim"


def test_mfa_flow(paths):
    svc, store, pid, calls = _svc(paths, mfa=True)
    first = svc.start(pid, "p@x.nl", "geheim", remember=False)
    assert first.status == "needs_mfa" and first.login_id
    assert not paths.tokens(pid).exists()
    done = svc.finish_mfa(first.login_id, "123456")
    assert done.status == "ok"
    assert calls["mfa"] == ({"state": 1}, "123456")
    assert (paths.tokens(pid) / "oauth2_token.json").exists()
    assert svc.finish_mfa(first.login_id, "123456").status == "error"  # single use


def test_mfa_unknown_id(paths):
    svc, *_ = _svc(paths)
    assert svc.finish_mfa("nope", "1").status == "error"


def test_bad_credentials_mapped(paths):
    svc, *_ = _svc(paths, error=GarminConnectAuthenticationError("401"))
    res = svc.start("papa", "p@x.nl", "fout", remember=True)
    assert res.status == "bad_credentials"
    assert "fout" not in (res.message or "")


def test_rate_limit_mapped(paths):
    svc, *_ = _svc(paths, error=GarminConnectTooManyRequestsError("429"))
    assert svc.start("papa", "p@x.nl", "x", remember=False).status == "rate_limited"


def test_wrong_mfa_code_can_be_retried(paths):
    factory, calls = fake_factory(mfa=True)
    attempts = []

    class Picky(factory):
        def resume_login(self, state, code):
            attempts.append(code)
            if code != "123456":
                raise GarminConnectAuthenticationError("bad code")

    store = ProfileStore(paths)
    pid = store.add("Papa", "p@x.nl").id
    svc = AuthService(paths, store, client_factory=Picky)
    login_id = svc.start(pid, "p@x.nl", "geheim", remember=False).login_id
    wrong = svc.finish_mfa(login_id, "111111")
    assert wrong.status == "bad_code" and "Code" in wrong.message
    assert svc.pending_profile(login_id) == pid
    assert svc.finish_mfa(login_id, "123456").status == "ok"
    assert attempts == ["111111", "123456"]


def test_mfa_gives_up_after_three_wrong_codes(paths):
    factory, _ = fake_factory(mfa=True)

    class AlwaysWrong(factory):
        def resume_login(self, state, code):
            raise GarminConnectAuthenticationError("bad code")

    store = ProfileStore(paths)
    pid = store.add("Papa", "p@x.nl").id
    svc = AuthService(paths, store, client_factory=AlwaysWrong)
    login_id = svc.start(pid, "p@x.nl", "geheim", remember=False).login_id
    assert [svc.finish_mfa(login_id, "1").status for _ in range(3)] == ["bad_code", "bad_code", "error"]
    assert svc.pending_profile(login_id) is None
