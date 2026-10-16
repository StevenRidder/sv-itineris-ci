import asyncio
import json
from datetime import date
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from server.adapters.importer import import_folder
from server.assistant_tools import PlannerTools, tool_specs
from server.codex_adapter import CodexError, CodexProcess
from server.domain.models import PreviewRequest
from server.main import create_app
from server.services import make_preview
from tests.fake_codex import FakeCodex


@pytest.fixture
def workspace(tmp_path):
    app = create_app(tmp_path, assistant_factory=FakeCodex)
    import_folder(app.state.store, Path(__file__).parent/"fixtures")
    return TestClient(app), app.state.store


def send(client, text="test dates", **extras):
    response = client.post("/api/v1/chat", json={"message": text, "scenario_id": "source-B", "base_revision": 1, **extras})
    assert response.status_code == 200, response.text
    return [json.loads(line) for line in response.text.splitlines()]


def test_chat_stream_real_services_history_and_preview_chaining(workspace):
    client, store = workspace
    before = store.scenario("source-B")
    first = send(client)
    proposal = next(x["proposal"] for x in first if x["type"] == "proposal")
    chat_id = first[0]["chat_id"]
    second = send(client, chat_id=chat_id, proposal_id=proposal["id"])
    combined = next(x["proposal"] for x in second if x["type"] == "proposal")
    original_end = date.fromisoformat(before["stages"][0]["end"])
    assert (date.fromisoformat(combined["scenario"]["stages"][0]["end"])-original_end).days == 42
    assert store.scenario("source-B") == before
    assert len(store.scenarios()) == 3  # B, E, F synthetic fixtures; no draft was saved
    history = client.get("/api/v1/chats/"+chat_id).json()
    assert [m["role"] for m in history] == ["user", "assistant", "user", "assistant"]
    assert "thread_id" not in str(first)


def test_guide_citations_are_read_receipts_and_have_no_local_paths(workspace):
    client, _ = workspace
    events = send(client, "test guide")
    source = next(e["citation"] for e in events if e["type"] == "source")
    assert source["revision"] == 1 and source["start_line"] == 1 and source["end_line"] > 1
    assert source in events[-1]["citations"]
    assert not any("path" in str(e) for e in events)
    assert client.get("/api/v1/library/"+source["id"]).status_code == 200


def test_route_selection_geometry_and_unknown_timing(workspace):
    client, store = workspace
    events = send(client, "test route")
    assert next(x["scenario"] for x in events if x["type"] == "selection")["route_family"] == "F"
    result = next(x["proposal"] for x in events if x["type"] == "proposal")["scenario"]
    assert result["precision"] == "unknown" and result["draft_geometry"]["coordinates"]
    tools = PlannerTools(store, "source-F", 1)
    with pytest.raises(HTTPException) as error:
        tools.call("preview_plan", {"base_revision": 1, "operations": [{"op": "shift_departure", "start": "2032-01-01"}]})
    assert error.value.status_code == 422


def test_strict_tool_boundary_and_stale_preview(workspace):
    _, store = workspace
    tools = PlannerTools(store, "source-B", 1)
    for name in ["save", "shell", "read_file", "route.activate"]:
        with pytest.raises(ValueError):
            tools.call(name, {})
    with pytest.raises(ValidationError):
        tools.call("read_guide", {"source_id": "x", "path": "secrets"})
    with pytest.raises(ValueError):
        tools.call("preview_route", {"place_ids": ["palau", "imaginary"]})
    tools.call("preview_plan", {"base_revision": 1, "operations": [{"op": "extend_stay", "stage_id": "van", "nights": 1}]})
    with store.connection() as db:
        db.execute("UPDATE meta SET value=value+1 WHERE key='library_revision'")
    with pytest.raises(HTTPException) as error:
        tools.call("preview_plan", {"base_revision": 1, "operations": [{"op": "extend_stay", "stage_id": "van", "nights": 1}]})
    assert error.value.status_code == 409


def test_date_tools_calculate_departure_arrival_and_preserve_durations(workspace):
    _, store = workspace
    base = store.scenario("source-B")
    departure = "2032-02-28"
    p = make_preview(store, "source-B", PreviewRequest.model_validate({"base_revision": 1, "operations": [{"op": "shift_departure", "start": departure}]}))
    assert p["scenario"]["stages"][0]["start"] == departure
    for a, b in zip(base["stages"], p["scenario"]["stages"]):
        assert (date.fromisoformat(a["end"])-date.fromisoformat(a["start"])) == (date.fromisoformat(b["end"])-date.fromisoformat(b["start"]))
    with pytest.raises(HTTPException) as error:
        make_preview(store, "source-B", PreviewRequest.model_validate({"base_revision": 1, "operations": [{"op": "set_arrival", "stage_id": "palau", "start": "2000-01-01"}]}))
    assert error.value.status_code == 422


def test_failure_is_not_reported_as_completed_and_retry_possible(workspace):
    client, _ = workspace
    events = send(client, "test failure")
    assert events[-1] == {"type": "error", "message": "Synthetic quota failure"}
    assert not any(x["type"] == "done" for x in events)
    assert send(client, chat_id=events[0]["chat_id"])[-1]["type"] == "done"
    assert client.post("/api/v1/chat", json={"message": "x", "scenario_id": "source-B", "base_revision": 99}).status_code == 409


def test_rpc_buffering_auth_guard_and_denial():
    class RPC(CodexProcess):
        def __init__(self, frames):
            super().__init__(".")
            self.frames, self.sent = iter(frames), []
        async def send(self, payload):
            self.sent.append(payload)
        async def read(self, queued=True):
            if queued and self.pending:
                return self.pending.popleft()
            return next(self.frames)
    async def check():
        rpc = RPC([{"method": "item/tool/call", "id": "tool", "params": {}}, {"method": "unrecognized/approval", "id": "deny"}, {"id": 1, "result": {"account": {"type": "apiKey"}}}])
        with pytest.raises(CodexError, match="API-key"):
            await rpc.account()
        assert (await rpc.read())["id"] == "tool"
        assert rpc.sent[-1]["error"]["code"] == -32601
    asyncio.run(check())
    assert set(x["name"] for x in tool_specs()) == {"get_plans", "search_guides", "read_guide", "show_scenario", "preview_plan", "preview_route"}
