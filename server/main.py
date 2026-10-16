import json
import os
import re
import uuid
from pathlib import Path
from urllib.parse import unquote, urlsplit

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from server.adapters.store import Store, canonical, checksum, now
from server.domain.models import PreviewRequest, SaveRequest, Scenario
from server.codex_adapter import CodexProcess
from server.chat import install_chat
from server.services import make_preview


def create_app(data_dir=None, assistant_factory=CodexProcess):
    store = Store(data_dir or os.environ.get("SVITINERIS_DATA_DIR", ".data"))
    app = FastAPI(title="SV Itineris", version="0.1.0")
    app.state.store = store
    install_chat(app, store, assistant_factory)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"])

    @app.middleware("http")
    async def local_boundary(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin and origin not in {"http://127.0.0.1:9072", "http://localhost:9072", "http://127.0.0.1:9073", "http://localhost:9073", "http://127.0.0.1:9082"}:
            return JSONResponse({"detail": "Origin not permitted for this local pilot"}, status_code=403)
        if request.method in {"POST", "PUT", "PATCH"} and request.headers.get("content-type", "").split(";")[0] != "application/json":
            return JSONResponse({"detail": "JSON content type required"}, status_code=415)
        if int(request.headers.get("content-length", "0") or "0") > 2_000_000:
            return JSONResponse({"detail": "Request too large"}, status_code=413)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
        return response

    def get_scenario(scenario_id):
        data = store.scenario(scenario_id)
        if data is None:
            raise HTTPException(404, "Scenario not found")
        return Scenario.model_validate(data)

    @app.get("/api/v1/health")
    def health():
        return {"ok": True, "mode": "local-pilot", "assistant": "codex-subscription", "version": "0.2.0"}

    @app.get("/api/v1/voyage")
    def voyage():
        with store.connection() as db:
            return {"name": "SV Itineris", "selected_route": None, "dates_committed": False,
                    "scenarios": store.scenarios(), "places": [json.loads(x[0]) for x in db.execute("SELECT payload FROM places")],
                    "library_revision": store.library_revision(db)}

    @app.get("/api/v1/scenarios/{scenario_id}")
    def scenario(scenario_id: str):
        return get_scenario(scenario_id)

    @app.post("/api/v1/scenarios/{scenario_id}/preview")
    def preview(scenario_id: str, body: PreviewRequest):
        return make_preview(store, scenario_id, body)

    @app.post("/api/v1/proposals/{proposal_id}/save-as", status_code=201)
    def save(proposal_id: str, body: SaveRequest, idempotency_key: str = Header(min_length=8, max_length=128)):
        request_hash = checksum(canonical({"proposal": proposal_id, "name": body.name}).encode())
        with store.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT * FROM saves WHERE key=?", (idempotency_key,)).fetchone()
            if previous:
                if previous["request_hash"] != request_hash:
                    raise HTTPException(409, "Save key already used for a different request")
                return store.scenario(previous["scenario_id"], db)
            row = db.execute("SELECT * FROM proposals WHERE id=?", (proposal_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Preview not found")
            base = store.scenario(row["base_id"], db)
            if not base or base["revision"] != row["base_revision"] or store.library_revision(db) != row["library_revision"]:
                raise HTTPException(409, "Scenario or sources changed. Create a fresh preview before saving.")
            payload = Scenario.model_validate(json.loads(row["payload"])["scenario"])
            payload.id = "draft-"+str(uuid.uuid4())
            payload.name = body.name
            payload.revision = 1
            payload.parent_id = base["id"]
            payload.parent_revision = base["revision"]
            payload.status = "draft"
            store.write_scenario(db, payload)
            db.execute("INSERT INTO saves VALUES(?,?,?)", (idempotency_key, request_hash, payload.id))
        return payload

    @app.get("/api/v1/library")
    def library(q: str = ""):
        if len(q) > 200:
            raise HTTPException(422, "Search query too long")
        with store.connection() as db:
            if q.strip():
                terms = re.findall(r"\w+", q, re.UNICODE)[:12]
                if not terms:
                    return []
                query = " OR ".join('"'+t+'"' for t in terms)
                rows = db.execute("SELECT s.id,s.title,s.kind,s.revision FROM source_search f JOIN sources s ON s.id=f.id WHERE source_search MATCH ? ORDER BY rank LIMIT 60", (query,))
            else:
                rows = db.execute("SELECT id,title,kind,revision FROM sources ORDER BY title LIMIT 100")
            return [dict(r) for r in rows]

    @app.get("/api/v1/library/{source_id}")
    def source(source_id: str):
        with store.connection() as db:
            row = db.execute("SELECT * FROM sources WHERE id=?", (source_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Source not found")
            result = dict(row)
            source_paths = {r["path"]: r["id"] for r in db.execute("SELECT id,path FROM sources")}
            assets = {r["original_path"]: r["id"] for r in db.execute("SELECT id,original_path FROM assets")}
        def rewrite(match):
            prefix, label, raw = match.group(1), match.group(2), match.group(3) or match.group(4)
            split = urlsplit(raw)
            safe_label = label.replace("[", "").replace("]", "")
            if split.scheme:
                if split.scheme not in {"https", "http"}:
                    return safe_label+" (external reference unavailable)"
                return f"[{safe_label} — photo source]({raw})" if prefix else match.group(0)
            target = str((Path(result["path"]).parent / unquote(split.path)).resolve())
            if prefix and target in assets:
                return f"![{safe_label}](/api/v1/assets/{assets[target]})"
            if not prefix and target in source_paths:
                return f"[{safe_label}](#document/{source_paths[target]})"
            return safe_label+" (original reference; not imported)"
        result["body"] = re.sub(r"(!?)\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))\)", rewrite, result["body"])
        return result

    @app.get("/api/v1/assets/{asset_id}")
    def asset(asset_id: str):
        with store.connection() as db:
            row = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Asset not found")
        path = store.directory / "assets" / row["filename"]
        if not path.is_file():
            raise HTTPException(404, "Asset unavailable")
        return FileResponse(path, media_type=row["mime"])

    dist = Path(__file__).resolve().parents[1] / "dist"
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="web")
    return app


app = create_app()
