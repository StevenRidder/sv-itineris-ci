"""Shared application services for manual controls and Codex tools."""
import json
import uuid

from fastapi import HTTPException

from server.adapters.store import canonical, now
from server.domain.models import PreviewRequest, Scenario
from server.domain.planning import PlanningError, preview_change


def make_preview(store, scenario_id, body: PreviewRequest, previous_id=None):
    with store.connection() as db:
        db.execute("BEGIN IMMEDIATE")
        raw = store.scenario(scenario_id, db)
        if not raw:
            raise HTTPException(404, "Scenario not found")
        base = Scenario.model_validate(raw)
        if base.revision != body.base_revision:
            raise HTTPException(409, "Scenario changed. Refresh and preview again.")
        revision = store.library_revision(db)
        working, prior_changes = base, []
        if previous_id:
            row = db.execute("SELECT payload FROM proposals WHERE id=?", (previous_id,)).fetchone()
            previous = json.loads(row[0]) if row else None
            if not previous or previous["base_id"] != base.id or previous["base_revision"] != base.revision or previous["library_revision"] != revision:
                raise HTTPException(409, "Preview or sources changed. Start a fresh preview.")
            working = Scenario.model_validate(previous["scenario"])
            prior_changes = previous["changes"]
        try:
            calculated, changes, warnings = preview_change(working, body.operations)
        except PlanningError as error:
            raise HTTPException(422, str(error)) from error
        result = {"id": str(uuid.uuid4()), "base_id": base.id, "base_revision": base.revision,
                  "library_revision": revision, "scenario": calculated.model_dump(mode="json"),
                  "changes": prior_changes+changes, "warnings": warnings}
        db.execute("INSERT INTO proposals VALUES(?,?,?,?,?,?)", (result["id"], base.id, base.revision, revision, canonical(result), now()))
    return result
