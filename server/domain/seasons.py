"""Read-only seasonal notes. These are not forecasts or routing constraints."""
from math import isfinite
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from server.domain.models import StrictModel

Month = Annotated[int, Field(strict=True, ge=1, le=12)]


class SeasonalHazard(StrictModel):
    label: str = Field(min_length=1, max_length=100)
    months: list[Month] = Field(min_length=1, max_length=12)
    peak: list[Month] = Field(default_factory=list, max_length=12)
    kind: Literal["storm", "monsoon", "wet"]
    detail: str = Field(max_length=1500)

    @model_validator(mode="after")
    def peak_in_season(self):
        if not set(self.peak) <= set(self.months):
            raise ValueError("Peak months must belong to the hazard season")
        return self


class SeasonalStop(StrictModel):
    id: str = Field(pattern=r"^[a-z0-9-]{1,60}$")
    name: str = Field(min_length=1, max_length=120)
    latitude: str = Field(max_length=40)
    coordinates: tuple[float, float]
    anchor: str = Field(max_length=150)
    coordinate_source: str = Field(max_length=300)
    preferred: list[Month] = Field(max_length=12)
    prime: list[Month] = Field(default_factory=list, max_length=12)
    window: str = Field(max_length=200)
    why: str = Field(max_length=1500)
    notes: list[Annotated[str, Field(max_length=2000)]] = Field(default_factory=list, max_length=10)
    hazards: list[SeasonalHazard] = Field(default_factory=list, max_length=10)

    @field_validator("coordinates")
    @classmethod
    def valid_point(cls, point):
        lon, lat = point
        if not isfinite(lon) or not isfinite(lat) or not -180 <= lon <= 180 or not -85 <= lat <= 85:
            raise ValueError("Representative point outside map bounds")
        return point

    @model_validator(mode="after")
    def prime_in_window(self):
        if not set(self.prime) <= set(self.preferred):
            raise ValueError("Best months must belong to the preferred window")
        return self


class SeasonalGuide(StrictModel):
    source: str = Field(max_length=500)
    regional_notes: list[Annotated[str, Field(max_length=2000)]] = Field(default_factory=list, max_length=20)
    stops: list[SeasonalStop] = Field(max_length=50)

    @model_validator(mode="after")
    def unique_stops(self):
        if len({s.id for s in self.stops}) != len(self.stops):
            raise ValueError("Seasonal stop identifiers must be unique")
        return self


def read_seasonal_guide(directory: Path):
    path = directory / "seasonal-guide.json"
    if not path.is_file():
        return SeasonalGuide(source="No seasonal notes loaded", stops=[])
    if path.is_symlink() or path.stat().st_size > 200_000:
        raise ValueError("Seasonal notes file is not an allowed local data file")
    return SeasonalGuide.model_validate_json(path.read_text(encoding="utf-8"))
