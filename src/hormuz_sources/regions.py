"""Sampling regions for the AIS visibility index: Gulf targets plus busy control lanes (pure Python)."""
from __future__ import annotations

import math
from dataclasses import dataclass

EARTH_RADIUS_KM = 6371.0088


@dataclass(frozen=True)
class Region:
    name: str
    role: str  # "target" or "control"
    bbox: tuple[float, float, float, float]  # lat_min, lon_min, lat_max, lon_max
    label: str


REGIONS = (
    Region("gulf_hormuz", "target", (22.0, 47.0, 30.5, 60.0), "Persian Gulf, Strait of Hormuz, Gulf of Oman"),
    Region("red_sea", "target", (12.0, 32.0, 29.5, 44.0), "Red Sea and Bab el-Mandeb"),
    Region("north_sea_channel", "control", (49.0, -6.0, 56.0, 9.0), "North Sea and English Channel"),
    Region("suez_east_med", "control", (29.5, 28.0, 36.5, 36.5), "Suez approaches and Eastern Mediterranean"),
    Region("malacca_singapore", "control", (0.5, 95.0, 7.0, 105.0), "Strait of Malacca and Singapore"),
)


def region_for(lat, lon) -> str | None:
    """First region containing the point; latitude is half-open [lat_min, lat_max), longitude closed."""
    if lat is None or lon is None:
        return None
    for r in REGIONS:
        lat_min, lon_min, lat_max, lon_max = r.bbox
        if lat_min <= lat < lat_max and lon_min <= lon <= lon_max:
            return r.name
    return None


def area_km2(bbox) -> float:
    """Spherical area of a lat/lon box."""
    lat_min, lon_min, lat_max, lon_max = bbox
    return (EARTH_RADIUS_KM ** 2) * math.radians(lon_max - lon_min) * (
        math.sin(math.radians(lat_max)) - math.sin(math.radians(lat_min)))
