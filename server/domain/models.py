from datetime import date
from math import isfinite
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Geometry(StrictModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[tuple[float, float]] = Field(min_length=2, max_length=1024)

    @field_validator("coordinates")
    @classmethod
    def coordinates_valid(cls, coordinates):
        if any(not isfinite(x) or not isfinite(y) or not -180 <= x <= 180 or not -85 <= y <= 85 for x, y in coordinates):
            raise ValueError("Coordinates must be finite longitude/latitude in map bounds")
        return coordinates


class Stage(StrictModel):
    id: str
    name: str
    start: date | None = None
    end: date | None = None
    window: str | None = None
    gap_before: int = 0
    protected_duration: bool = False
    arrival_locked: date | None = None
    preferred_max_nights: int | None = None


class Scenario(StrictModel):
    id: str
    name: str
    route_family: Literal["R", "F", "H"]
    precision: Literal["day", "month", "unknown"]
    revision: int = 1
    status: Literal["source-example", "draft"] = "source-example"
    parent_id: str | None = None
    parent_revision: int | None = None
    source_id: str | None = None
    stages: list[Stage]
    draft_geometry: Geometry | None = None
    notes: list[str] = Field(default_factory=list)


class ExtendStay(StrictModel):
    op: Literal["extend_stay"]
    stage_id: str = Field(min_length=1, max_length=80)
    nights: int = Field(ge=-180, le=180)


class SetRouteGeometry(StrictModel):
    op: Literal["set_route_geometry"]
    geometry: Geometry


class ShiftDeparture(StrictModel):
    op: Literal["shift_departure"]
    start: date


class SetArrival(StrictModel):
    op: Literal["set_arrival"]
    stage_id: str = Field(min_length=1, max_length=80)
    start: date


Operation = Annotated[ExtendStay | SetRouteGeometry | ShiftDeparture | SetArrival, Field(discriminator="op")]


class PreviewRequest(StrictModel):
    base_revision: int = Field(ge=1)
    operations: list[Operation] = Field(min_length=1, max_length=10)


class BrowserPreviewRequest(PreviewRequest):
    previous_proposal_id: UUID | None = None


class SaveRequest(StrictModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def nonempty_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Name is required")
        return value
