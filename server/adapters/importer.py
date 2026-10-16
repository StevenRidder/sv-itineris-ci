import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import unquote, urlsplit

from server.adapters.store import canonical, checksum
from server.domain.models import Scenario, Stage

STAGES = [("van", "vanuatu", "Vanuatu"), ("sol", "solomons", "Solomons"),
          ("transfer", "png_bypass", "Transfer allowance"), ("raja", "raja_ampat", "Raja Ampat"),
          ("staging", "staging", "North Maluku"), ("palau", "palau", "Palau"),
          ("ph", "philippines", "Philippines"), ("sea", "singapore_window", "Singapore window")]
PLACE_NAMES = {"Port Vila": "van", "Honiara": "sol", "Raja Ampat central": "raja", "Morotai": "staging",
               "Koror": "palau", "Coron": "ph", "Singapore": "sea"}
# NOAA NWS defining points, rounded destination centres. Not waypoints.
# https://www.weather.gov/media/directives/010_pdfs_archived/pd01006005j.pdf
FSM = [("pohnpei", "Pohnpei", 158.2, 6.9), ("chuuk", "Chuuk", 151.9, 7.5), ("yap", "Yap", 138.1, 9.5)]
IMAGE = re.compile(r"!\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))\)")
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


def parse_seed(seed, source_id):
    if seed.get("schema_version") != "0.5.0":
        raise ValueError("Unsupported scenario seed schema")
    result = []
    for item in seed.get("scenarios", []):
        if item["id"] == "E":
            keys = [("van", "vanuatu", "Vanuatu"), ("sol", "solomons", "Solomons"), ("fsm", "fsm", "FSM"),
                    ("raja", "raja_north", "North Raja"), ("misool", "raja_misool", "Misool"),
                    ("palau", "palau", "Palau"), ("ph", "philippines", "Philippines"), ("sea", "singapore_johor", "Singapore/Johor")]
            stages = [Stage(id=key, name=name, window=str(item.get(field, "Unresolved"))) for key, field, name in keys]
            precision = "month"
        else:
            stages, previous = [], None
            for key, field, name in STAGES:
                if field not in item:
                    continue
                start, end = map(date.fromisoformat, item[field])
                if end <= start or (previous and start < previous):
                    raise ValueError("Invalid sample calendar order")
                stages.append(Stage(id=key, name=name, start=start, end=end, gap_before=(start-previous).days if previous else 0,
                                    protected_duration=key == "palau", preferred_max_nights=120 if key == "van" else None))
                previous = end
            if not stages:
                raise ValueError("Empty sample calendar")
            precision = "day"
        result.append(Scenario(id="source-"+item["id"], name=item.get("name", "Sample "+item["id"]),
                               route_family=item.get("route_family", "H" if item["id"] == "E" else "R"),
                               precision=precision, source_id=source_id, stages=stages,
                               notes=["Imported example; no route or date is committed.", "Passage allowances and permissions remain unverified."]))
    result.append(Scenario(id="source-F", name="FSM only — timing unresolved", route_family="F", precision="unknown", source_id=source_id,
                          stages=[Stage(id=x, name=n, window="Dates and allowances unresolved") for x, n in [("van", "Vanuatu"), ("sol", "Solomons"), ("fsm", "FSM"), ("palau", "Palau"), ("ph", "Philippines")]],
                          notes=["Independent open alternative; no exact dates inferred."]))
    return result


def import_folder(store, folder):
    root = Path(folder).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError("Import root must be a directory")
    entries, images, parsed, places = [], [], [], []
    for file in sorted(root.rglob("*")):
        if not file.is_file() or file.is_symlink():
            continue
        rel = file.relative_to(root)
        if any(p == "ALL" or p.startswith(".") or "archive" in p.lower() for p in rel.parts):
            continue
        if "technical scope" in file.name.lower() or "technical-scope" in file.name.lower() or "export" in file.name.lower():
            continue
        is_seed = file.name in {"COS Voyage Scenarios.json", "scenarios.json"}
        if file.suffix.lower() != ".md" and not is_seed:
            continue
        if file.stat().st_size > 2_000_000:
            raise ValueError("Source file exceeds import size limit")
        body = file.read_text(encoding="utf-8")
        sid = checksum(str(file).encode())[:24]
        title = next((line[2:].strip() for line in body.splitlines() if line.startswith("# ")), file.stem)
        entries.append((sid, str(file), title, "scenario-seed" if is_seed else "guide", checksum(body.encode()), body))
        if is_seed:
            if parsed:
                raise ValueError("Select one scenario seed per import")
            seed = json.loads(body)
            parsed = parse_seed(seed, sid)
            for p in seed.get("places_map_view_only", []):
                if p["name"] in PLACE_NAMES:
                    places.append({"id": PLACE_NAMES[p["name"]], "name": p["country"], "coordinates": [float(p["lon"]), float(p["lat"])]})
            places.extend({"id": i, "name": name, "coordinates": [lon, lat]} for i, name, lon, lat in FSM)
        for match in IMAGE.finditer(body):
            uri = match.group(1) or match.group(2)
            if urlsplit(uri).scheme:
                continue
            target = (file.parent / unquote(urlsplit(uri).path)).resolve()
            if not target.is_relative_to(root) or target.is_symlink() or not target.is_file() or target.suffix.lower() not in MIME:
                continue
            data = target.read_bytes()
            if len(data) > 10_000_000:
                continue
            asset_id = checksum(data)
            images.append((asset_id, target.suffix.lower(), MIME[target.suffix.lower()], str(target), data))
    for asset_id, suffix, _, _, data in images:
        dest = store.directory / "assets" / (asset_id+suffix)
        if not dest.exists():
            dest.write_bytes(data)
    changed = 0
    with store.connection() as db:
        db.execute("BEGIN IMMEDIATE")
        for sid, path, title, kind, sha, body in entries:
            previous = db.execute("SELECT * FROM sources WHERE id=?", (sid,)).fetchone()
            if previous and previous["sha"] == sha:
                continue
            revision = previous["revision"] + 1 if previous else 1
            payload = {"id": sid, "path": path, "title": title, "kind": kind, "revision": revision, "sha": sha, "body": body}
            db.execute("INSERT OR REPLACE INTO sources VALUES(?,?,?,?,?,?,?)", (sid, path, title, kind, revision, sha, body))
            db.execute("INSERT INTO source_versions VALUES(?,?,?)", (sid, revision, canonical(payload)))
            db.execute("DELETE FROM source_search WHERE id=?", (sid,))
            db.execute("INSERT INTO source_search VALUES(?,?,?)", (sid, title, body))
            changed += 1
        for asset_id, suffix, mime, path, _ in images:
            db.execute("INSERT OR REPLACE INTO assets VALUES(?,?,?,?)", (asset_id, asset_id+suffix, mime, path))
        for scenario in parsed:
            old = store.scenario(scenario.id, db)
            if old:
                compare = scenario.model_dump(mode="json")
                compare["revision"] = old["revision"]
                if compare == old:
                    continue
                scenario.revision = old["revision"] + 1
            store.write_scenario(db, scenario)
        for place in places:
            db.execute("INSERT OR REPLACE INTO places VALUES(?,?)", (place["id"], canonical(place)))
        if changed:
            db.execute("UPDATE meta SET value=value+1 WHERE key='library_revision'")
        revision = store.library_revision(db)
    return {"files_seen": len(entries), "changed": changed, "library_revision": revision, "scenarios": len(parsed), "assets": len(images)}
