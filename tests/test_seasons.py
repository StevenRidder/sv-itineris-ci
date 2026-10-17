import json
from pathlib import Path

from fastapi.testclient import TestClient

from server.main import create_app

FIXTURE = Path(__file__).parent / "fixtures/seasonal-guide.json"


def test_seasons_missing_is_empty_and_supplied_notes_preserve_overlap(tmp_path):
    client = TestClient(create_app(tmp_path))
    assert client.get("/api/v1/seasons").json()["stops"] == []
    (tmp_path / "seasonal-guide.json").write_bytes(FIXTURE.read_bytes())
    guide = client.get("/api/v1/seasons").json()
    south, north = guide["stops"]
    assert 11 in south["preferred"] and 11 in south["hazards"][0]["months"]
    assert set(north["preferred"]) == {12, 1, 2, 3, 4}
    assert south["notes"] and guide["regional_notes"]
    with client.app.state.store.connection() as db:
        assert db.execute("SELECT count(*) FROM proposals").fetchone()[0] == 0


def test_invalid_seasonal_file_fails_without_leaking_details(tmp_path):
    client = TestClient(create_app(tmp_path))
    path = tmp_path / "seasonal-guide.json"
    guide = json.loads(FIXTURE.read_text())
    for mutate in [
        lambda g: g["stops"][0].update(prime=[4]),
        lambda g: g["stops"][0].update(preferred=[0, 13]),
        lambda g: g["stops"][0].update(coordinates=[181, 0]),
        lambda g: g["stops"][0]["hazards"][0].update(peak=[8]),
        lambda g: g["stops"].append(g["stops"][0]),
    ]:
        modified = json.loads(json.dumps(guide))
        mutate(modified)
        path.write_text(json.dumps(modified))
        response = client.get("/api/v1/seasons")
        assert response.status_code == 503
        assert "coordinates" not in response.text and str(tmp_path) not in response.text
    path.write_text("x" * 200_001)
    assert client.get("/api/v1/seasons").status_code == 503
