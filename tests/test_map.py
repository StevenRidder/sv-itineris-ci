import pytest
from fastapi.testclient import TestClient

from server.domain.geography import measure_geometry
from server.domain.models import Geometry
from server.main import create_app
from tests.test_planner import setup, proposal


def test_great_circle_distance_bearing_and_dateline():
    east = measure_geometry(Geometry(coordinates=[(0, 0), (1, 0)]))
    assert east["distance_nm"] == pytest.approx(60.04, abs=.01)
    assert east["legs"][0]["initial_bearing_deg"] == 90
    crossing = measure_geometry(Geometry(coordinates=[(179, 0), (-179, 0)]))
    assert crossing["distance_nm"] == pytest.approx(120.08, abs=.01)
    assert crossing["legs"][0]["initial_bearing_deg"] == 90
    zero = measure_geometry(Geometry(coordinates=[(134, 7), (134, 7)]))
    assert zero["distance_nm"] == 0 and zero["legs"][0]["initial_bearing_deg"] is None


def test_measure_endpoint_bounds_and_no_persistence(tmp_path):
    client = TestClient(create_app(tmp_path))
    response = client.post("/api/v1/map/measure", json={"type": "LineString", "coordinates": [[0, 0], [0, 1], [1, 1]]})
    assert response.status_code == 200
    assert len(response.json()["legs"]) == 2
    assert "not a navigable" in response.json()["basis"]
    assert client.post("/api/v1/map/measure", json={"coordinates": [[181, 0], [0, 0]]}).status_code == 422
    assert client.post("/api/v1/map/measure", json={"coordinates": [[0, 0]]}).status_code == 422
    with client.app.state.store.connection() as db:
        assert db.execute("SELECT count(*) FROM proposals").fetchone()[0] == 0


def test_manual_map_preview_preserves_date_preview_and_rejects_stale(setup):
    client, store, _ = setup
    first = proposal(client)
    request = {"base_revision": 1, "previous_proposal_id": first["id"], "operations": [{"op": "set_route_geometry", "geometry": {"coordinates": [[134, 7], [135, 8]]}}]}
    result = client.post("/api/v1/scenarios/source-B/preview", json=request)
    assert result.status_code == 200
    assert result.json()["scenario"]["stages"] == first["scenario"]["stages"]
    assert result.json()["scenario"]["draft_geometry"]["coordinates"] == [[134, 7], [135, 8]]
    assert result.json()["changes"][0] == first["changes"][0]
    with store.connection() as db:
        db.execute("UPDATE meta SET value=value+1 WHERE key='library_revision'")
    assert client.post("/api/v1/scenarios/source-B/preview", json=request).status_code == 409


def test_tile_origins_are_explicit_and_scripts_stay_local(tmp_path):
    client = TestClient(create_app(tmp_path))
    policy = client.get("/api/v1/health").headers["Content-Security-Policy"]
    assert "script-src 'self';" in policy
    assert "connect-src 'self' https://tiles.maps.eox.at https://tiles.openseamap.org;" in policy
    assert "https:" not in policy.split("connect-src ")[1].split(";")[0].replace("https://tiles.maps.eox.at", "").replace("https://tiles.openseamap.org", "")
