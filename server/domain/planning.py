from datetime import timedelta

from server.domain.models import ExtendStay, Scenario, SetRouteGeometry


class PlanningError(ValueError):
    pass


def preview_change(base: Scenario, operations):
    scenario = base.model_copy(deep=True)
    changes = []
    warnings = ["Passages and permissions remain unverified. Geometry is a destination overview."]
    for operation in operations:
        if isinstance(operation, SetRouteGeometry):
            scenario.draft_geometry = operation.geometry
            changes.append("Draft geometry updated; no navigation command sent.")
            continue
        if not isinstance(operation, ExtendStay):
            raise PlanningError("Unsupported planning operation")
        if base.precision != "day":
            raise PlanningError("This scenario uses month windows or unknown dates. Set exact inputs before recalculating.")
        target = next((s for s in scenario.stages if s.id == operation.stage_id), None)
        if target is None or target.start is None or target.end is None:
            raise PlanningError("Stage with exact dates not found")
        if target.protected_duration:
            raise PlanningError("This stay duration is protected. An explicit unlock is required.")
        durations = {s.id: (s.end - s.start).days for s in scenario.stages if s.end and s.start}
        durations[target.id] += operation.nights
        if durations[target.id] < 1:
            raise PlanningError("A stay must have at least one night")
        previous_end = None
        for stage in scenario.stages:
            if stage.start is None or stage.end is None:
                raise PlanningError("A required date is unknown")
            start = previous_end + timedelta(days=stage.gap_before) if previous_end else stage.start
            if stage.arrival_locked and start != stage.arrival_locked:
                raise PlanningError(f"{stage.name} arrival is locked; this change conflicts with it")
            stage.start = start
            stage.end = start + timedelta(days=durations[stage.id])
            previous_end = stage.end
            if stage.preferred_max_nights and durations[stage.id] > stage.preferred_max_nights:
                warnings.append(f"{stage.name} exceeds its planning preference. This is not a legal-limit determination.")
        changes.append(f"{target.name}: {operation.nights:+d} nights; later durations and gaps preserved.")
    scenario.status = "draft"
    return scenario, changes, warnings
