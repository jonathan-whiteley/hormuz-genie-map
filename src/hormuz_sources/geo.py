"""Bounding-box and Natural Earth helpers (pure Python)."""
from __future__ import annotations

import json

Bbox = tuple[float, float, float, float]  # lat_min, lon_min, lat_max, lon_max


def parse_bbox(text: str) -> Bbox:
    """Parse 'lat_min,lon_min,lat_max,lon_max' into floats, validating ranges and order."""
    parts = [p.strip() for p in (text or "").split(",")]
    if len(parts) != 4:
        raise ValueError(f"bbox must have 4 comma-separated numbers, got {text!r}")
    try:
        lat_min, lon_min, lat_max, lon_max = (float(p) for p in parts)
    except ValueError as exc:
        raise ValueError(f"bbox values must be numbers, got {text!r}") from exc
    if not (-90 <= lat_min < lat_max <= 90):
        raise ValueError(f"bbox latitudes out of range or order: {text!r}")
    if not (-180 <= lon_min < lon_max <= 180):
        raise ValueError(f"bbox longitudes out of range or order: {text!r}")
    return lat_min, lon_min, lat_max, lon_max


def bbox_to_wkt(bbox: Bbox) -> str:
    """Closed WKT polygon in lon/lat axis order (SRID 4326 is applied by the caller)."""
    lat_min, lon_min, lat_max, lon_max = bbox
    ring = [(lon_min, lat_min), (lon_max, lat_min), (lon_max, lat_max), (lon_min, lat_max), (lon_min, lat_min)]
    return "POLYGON((" + ", ".join(f"{x} {y}" for x, y in ring) + "))"


def land_rows(feature_collection: dict) -> list[tuple[int, str | None, str]]:
    """Flatten a GeoJSON FeatureCollection into (land_id, featurecla, geometry_json) rows, skipping null geometries."""
    rows = []
    for idx, feat in enumerate(feature_collection.get("features") or []):
        geom = feat.get("geometry")
        if not geom:
            continue
        props = feat.get("properties") or {}
        rows.append((idx, props.get("featurecla"), json.dumps(geom)))
    return rows
