from datetime import timedelta

from server.domain.models import ExtendStay, Scenario, SetRouteGeometry, ShiftDeparture, SetArrival


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
        if not isinstance(operation, (ExtendStay, ShiftDeparture, SetArrival)):
            raise PlanningError("Unsupported planning operation")
        if base.precision != "day":
            raise PlanningError("This scenario uses month windows or unknown dates. Set exact inputs before recalculating.")
        target = scenario.stages[0] if isinstance(operation, ShiftDeparture) else next((s for s in scenario.stages if s.id == operation.stage_id), None)
        if target is None or target.start is None or target.end is None:
            raise PlanningError("Stage with exact dates not found")
        if target.protected_duration and isinstance(operation, ExtendStay):
            raise PlanningError("This stay duration is protected. An explicit unlock is required.")
        durations = {s.id: (s.end - s.start).days for s in scenario.stages if s.end and s.start}
        if isinstance(operation, ExtendStay):
            durations[target.id] += operation.nights
        else:
            index = scenario.stages.index(target)
            if index:
                previous = scenario.stages[index-1]
                gap = (operation.start-previous.end).days
                if gap < 0:
                    raise PlanningError("Arrival overlaps the preceding stay. Change that stay first.")
                target.gap_before = gap
            else:
                target.start = operation.start
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
        if isinstance(operation, ExtendStay):
            changes.append(f"{target.name}: {operation.nights:+d} nights; later durations and gaps preserved.")
        else:
            changes.append(f"{target.name} arrival: {operation.start.isoformat()}; stay durations preserved.")
    scenario.status = "draft"
    return scenario, changes, warnings
