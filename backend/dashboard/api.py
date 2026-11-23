"""HTTP API + static frontend. All profile data lives under /api/profiles/{id}/..."""
from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import envfile, goals as goals_mod, insights
from .bundle import activity_track, build_bundle
from .coach import CoachUnavailable
from .config import Paths
from .garmin_auth import LoginResult
from .profiles import Profile, ProfileStore

HTTP_BY_STATUS = {"bad_credentials": 400, "rate_limited": 429, "error": 502}


class AddProfile(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=500)
    remember_password: bool = False


class Mfa(BaseModel):
    login_id: str
    code: str = Field(min_length=1, max_length=20)


class Reconnect(BaseModel):
    password: str = Field(min_length=1, max_length=500)
    remember_password: bool = False


class ChatIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=4000)


class SessionIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)


def create_app(paths: Paths, *, store: ProfileStore, auth: Any, sync: Any, coach: Any,
               static_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="Garmin Dashboard", docs_url=None, redoc_url=None)

    def profile_or_404(pid: str) -> Profile:
        try:
            return store.get(pid)
        except KeyError:
            raise HTTPException(404, "Onbekend profiel") from None

    def profile_json(p: Profile) -> dict[str, Any]:
        return asdict(p) | {
            "has_saved_password": envfile.get_var(paths.env_file, store.password_var(p.id)) is not None,
            "last_data_date": build_bundle(paths.db(p.id), days=30)["last_data_date"],
            "sync": sync.status(p.id),
        }

    def login_response(res: LoginResult, pid: str, *, created: bool) -> JSONResponse:
        if res.status == "ok":
            sync.start(pid)
            body = {"status": "ok", "profile": profile_json(store.get(pid))}
            return JSONResponse(body, status_code=201 if created else 200)
        if res.status == "needs_mfa":
            return JSONResponse({"status": "needs_mfa", "login_id": res.login_id})
        return JSONResponse({"status": res.status, "message": res.message},
                            status_code=HTTP_BY_STATUS.get(res.status, 502))

    @app.get("/api/profiles")
    def list_profiles() -> list[dict[str, Any]]:
        return [profile_json(p) for p in store.list()]

    @app.post("/api/profiles")
    def add_profile(body: AddProfile) -> JSONResponse:
        p = store.add(body.name, body.email)
        res = auth.start(p.id, body.email, body.password, body.remember_password)
        if res.status not in ("ok", "needs_mfa"):
            store.remove(p.id)
        return login_response(res, p.id, created=True)

    @app.post("/api/profiles/mfa")
    def mfa(body: Mfa) -> JSONResponse:
        pid = auth.pending_profile(body.login_id)
        res = auth.finish_mfa(body.login_id, body.code)
        if pid is None:
            return login_response(res, "", created=False)
        return login_response(res, pid, created=True)

    @app.post("/api/profiles/{pid}/reconnect")
    def reconnect(pid: str, body: Reconnect) -> JSONResponse:
        p = profile_or_404(pid)
        res = auth.start(pid, p.email, body.password, body.remember_password)
        return login_response(res, pid, created=False)

    @app.delete("/api/profiles/{pid}", status_code=204)
    def delete_profile(pid: str) -> Response:
        profile_or_404(pid)
        sync.forget(pid)
        coach.forget(pid)
        store.remove(pid)
        return Response(status_code=204)

    @app.post("/api/profiles/{pid}/sync")
    def start_sync(pid: str) -> JSONResponse:
        profile_or_404(pid)
        if not sync.start(pid):
            return JSONResponse({"status": "already_running"}, status_code=409)
        return JSONResponse({"status": "started"}, status_code=202)

    @app.get("/api/profiles/{pid}/bundle")
    def bundle(pid: str) -> dict[str, Any]:
        profile_or_404(pid)
        return build_bundle(paths.db(pid))

    @app.get("/api/profiles/{pid}/activities/{aid}/track")
    def track(pid: str, aid: int) -> list[dict[str, Any]]:
        profile_or_404(pid)
        return activity_track(paths.db(pid), aid)

    @app.get("/api/profiles/{pid}/insights")
    def get_insights(pid: str) -> list[dict[str, Any]]:
        profile_or_404(pid)
        return insights.today(paths, pid)

    @app.get("/api/profiles/{pid}/goals")
    def get_goals(pid: str) -> goals_mod.Goals:
        profile_or_404(pid)
        return goals_mod.load(paths, pid)

    @app.put("/api/profiles/{pid}/goals")
    def put_goals(pid: str, body: goals_mod.Goals) -> goals_mod.Goals:
        profile_or_404(pid)
        return goals_mod.save(paths, pid, body)

    @app.post("/api/profiles/{pid}/chat")
    def chat(pid: str, body: ChatIn) -> JSONResponse:
        profile_or_404(pid)
        try:
            return JSONResponse({"reply": coach.chat(pid, body.session_id, body.message)})
        except CoachUnavailable as err:
            return JSONResponse({"error": str(err)}, status_code=503)
        except Exception as err:  # noqa: BLE001 - surface Claude API errors to the UI
            return JSONResponse({"error": f"De coach gaf een fout: {type(err).__name__}"}, status_code=502)

    @app.post("/api/profiles/{pid}/chat/reset", status_code=204)
    def chat_reset(pid: str, body: SessionIn) -> Response:
        profile_or_404(pid)
        coach.reset(pid, body.session_id)
        return Response(status_code=204)

    @app.get("/api/profiles/{pid}/prompt")
    def prompt(pid: str) -> dict[str, str]:
        profile_or_404(pid)
        return {"text": coach.copy_prompt(pid)}

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "DELETE"])
    def api_404(rest: str) -> JSONResponse:
        return JSONResponse({"error": "not found"}, status_code=404)

    if static_dir and (static_dir / "index.html").exists():
        index = static_dir / "index.html"
        if (static_dir / "assets").exists():
            app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

        @app.get("/{rest:path}")
        def spa(rest: str) -> FileResponse:
            candidate = (static_dir / rest).resolve()
            if rest and candidate.is_file() and static_dir.resolve() in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return app
