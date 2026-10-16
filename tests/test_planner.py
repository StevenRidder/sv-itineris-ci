import json
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.adapters.importer import import_folder
from server.adapters.store import Store
from server.domain.models import ExtendStay, Scenario
from server.domain.planning import PlanningError, preview_change
from server.main import create_app

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def setup(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    for file in FIXTURES.iterdir():
        (source / file.name).write_bytes(file.read_bytes())
    app = create_app(tmp_path / "data")
    store = app.state.store
    import_folder(store, source)
    return TestClient(app), store, source


def proposal(client, operations=None):
    base = client.get("/api/v1/scenarios/source-B").json()
    response = client.post("/api/v1/scenarios/source-B/preview", json={"base_revision": base["revision"], "operations": operations or [{"op": "extend_stay", "stage_id": "van", "nights": 21}]})
    assert response.status_code == 200, response.text
    return response.json()


def test_calendar_preserves_all_durations_and_gaps(setup):
    client, _, _ = setup
    base = client.get("/api/v1/scenarios/source-B").json()
    result = proposal(client)["scenario"]
    for original, updated in zip(base["stages"], result["stages"]):
        if original["id"] != "van":
            assert date.fromisoformat(updated["start"]) == date.fromisoformat(original["start"]) + timedelta(days=21)
            assert (date.fromisoformat(updated["end"]) - date.fromisoformat(updated["start"])).days == (date.fromisoformat(original["end"]) - date.fromisoformat(original["start"])).days
        assert updated["gap_before"] == original["gap_before"]
    assert client.get("/api/v1/scenarios/source-B").json() == base


def test_leap_year_and_arrival_lock():
    base = Scenario(id="example", name="Synthetic", route_family="R", precision="day", stages=[
        {"id": "a", "name": "A", "start": "2032-02-27", "end": "2032-03-01"},
        {"id": "b", "name": "B", "start": "2032-03-02", "end": "2032-03-05", "gap_before": 1, "protected_duration": True}])
    result, _, _ = preview_change(base, [ExtendStay(op="extend_stay", stage_id="a", nights=1)])
    assert result.stages[0].end == date(2032, 3, 2)
    assert (result.stages[1].end-result.stages[1].start).days == 3
    base.stages[1].arrival_locked = date(2032, 3, 2)
    with pytest.raises(PlanningError, match="locked"):
        preview_change(base, [ExtendStay(op="extend_stay", stage_id="a", nights=1)])


def test_month_precision_and_protected_duration(setup):
    client, _, _ = setup
    request = {"base_revision": 1, "operations": [{"op": "extend_stay", "stage_id": "van", "nights": 21}]}
    assert client.post("/api/v1/scenarios/source-E/preview", json=request).status_code == 422
    request["operations"][0]["stage_id"] = "palau"
    assert client.post("/api/v1/scenarios/source-B/preview", json=request).status_code == 422
    scenario = client.get("/api/v1/scenarios/source-E").json()
    assert all(s["start"] is None for s in scenario["stages"])


def test_branch_save_retry_and_conflicting_key(setup):
    client, store, _ = setup
    p = proposal(client)
    url = f"/api/v1/proposals/{p['id']}/save-as"
    headers = {"Idempotency-Key": "unique-save-key"}
    first = client.post(url, json={"name": "My alternative"}, headers=headers)
    assert first.status_code == 201
    second = client.post(url, json={"name": "My alternative"}, headers=headers)
    assert second.json()["id"] == first.json()["id"]
    assert client.post(url, json={"name": "Different"}, headers=headers).status_code == 409
    assert len([s for s in store.scenarios() if s["status"] == "draft"]) == 1
    assert first.json()["parent_id"] == "source-B"


def test_changed_sources_invalidate_unsaved_preview(setup):
    client, store, source = setup
    p = proposal(client)
    guide = source / "guide.md"
    guide.write_text(guide.read_text()+"\nA changed source paragraph.\n")
    import_folder(store, source)
    response = client.post(f"/api/v1/proposals/{p['id']}/save-as", json={"name": "Stale"}, headers={"Idempotency-Key": "stale-save-key"})
    assert response.status_code == 409


def test_reimport_idempotency_and_scenario_history(setup):
    client, store, source = setup
    assert import_folder(store, source)["changed"] == 0
    before = store.scenario("source-B")
    seed = json.loads((source / "scenarios.json").read_text())
    seed["scenarios"][0]["name"] = "Revised synthetic example"
    (source / "scenarios.json").write_text(json.dumps(seed))
    import_folder(store, source)
    assert store.scenario("source-B")["revision"] == 2
    with store.connection() as db:
        history = json.loads(db.execute("SELECT payload FROM scenario_versions WHERE id=? AND revision=1", ("source-B",)).fetchone()[0])
    assert history == before
    assert client.post("/api/v1/scenarios/source-B/preview", json={"base_revision": 1, "operations": [{"op": "extend_stay", "stage_id": "van", "nights": 1}]}).status_code == 409


def test_geometry_is_draft_and_strictly_validated(setup):
    client, _, _ = setup
    p = proposal(client, [{"op": "set_route_geometry", "geometry": {"type": "LineString", "coordinates": [[150, 0], [151, 1]]}}])
    assert p["scenario"]["draft_geometry"]["coordinates"] == [[150, 0], [151, 1]]
    bad = {"base_revision": 1, "operations": [{"op": "set_route_geometry", "geometry": {"type": "LineString", "coordinates": [[181, 0], [151, 1]]}}]}
    assert client.post("/api/v1/scenarios/source-B/preview", json=bad).status_code == 422
    bad["operations"] = [{"op": "route.activate"}]
    assert client.post("/api/v1/scenarios/source-B/preview", json=bad).status_code == 422


def test_local_request_boundary(setup):
    client, _, _ = setup
    assert client.get("/api/v1/voyage", headers={"Origin": "https://untrusted.example"}).status_code == 403
    assert client.get("/api/v1/voyage", headers={"Host": "untrusted.example"}).status_code == 400
    assert client.post("/api/v1/scenarios/source-B/preview", content="x", headers={"Content-Type": "text/plain"}).status_code == 415


def test_search_and_source_links(setup):
    client, _, _ = setup
    docs = client.get("/api/v1/library", params={"q": "birding"}).json()
    assert len(docs) == 1
    doc = client.get("/api/v1/library/"+docs[0]["id"]).json()
    assert "#document/" in doc["body"]
    assert "original reference; not imported" in doc["body"]
    assert client.get("/api/v1/assets/not-an-asset").status_code == 404


def test_no_automatic_seed(tmp_path):
    client = TestClient(create_app(tmp_path))
    data = client.get("/api/v1/voyage").json()
    assert data["scenarios"] == [] and data["selected_route"] is None
    assert client.get("/api/v1/health").json()["assistant"] == "not-connected"
