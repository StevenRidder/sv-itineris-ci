"""Planning measurements between explicit points. No passage routing."""
from math import atan2, cos, degrees, radians, sin, sqrt

from server.domain.models import Geometry


def measure_geometry(geometry: Geometry):
    legs = []
    for start, end in zip(geometry.coordinates, geometry.coordinates[1:]):
        lon1, lat1, lon2, lat2 = map(radians, (*start, *end))
        delta_lon, delta_lat = lon2-lon1, lat2-lat1
        a = sin(delta_lat/2)**2+cos(lat1)*cos(lat2)*sin(delta_lon/2)**2
        a = max(0, min(1, a))
        distance = 3440.065*2*atan2(sqrt(a), sqrt(1-a))
        bearing = (degrees(atan2(sin(delta_lon)*cos(lat2), cos(lat1)*sin(lat2)-sin(lat1)*cos(lat2)*cos(delta_lon)))+360) % 360 if distance > 1e-8 else None
        legs.append({"distance_nm": round(distance, 3), "initial_bearing_deg": round(bearing, 1) if bearing is not None else None})
    return {"distance_nm": round(sum(x["distance_nm"] for x in legs), 3), "legs": legs,
            "basis": "Spherical great-circle segments; not a navigable passage or ETA"}
