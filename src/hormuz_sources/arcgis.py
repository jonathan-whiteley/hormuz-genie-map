"""Minimal paginated client for the IMF PortWatch ArcGIS FeatureServer layers (pure Python)."""
from __future__ import annotations

import time
from typing import Callable, Iterable

PORTWATCH_BASE = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services"

GetJson = Callable[[str, dict], dict]


class ArcGisError(RuntimeError):
    """Raised when the ArcGIS service returns an error or cannot be reached."""


def layer_query_url(layer: str) -> str:
    return f"{PORTWATCH_BASE}/{layer}/FeatureServer/0/query"


def requests_get_json(url: str, params: dict, retries: int = 3, timeout: int = 60) -> dict:
    import requests

    last: Exception | None = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # network, HTTP, or JSON decode errors are all retryable here
            last = exc
            time.sleep(2 ** attempt)
    raise ArcGisError(f"GET {url} failed after {retries} attempts: {last}")


def fetch_features(
    layer: str,
    where: str,
    out_fields: Iterable[str],
    get_json: GetJson = requests_get_json,
    page_size: int = 1000,
    max_pages: int = 2000,
) -> list[dict]:
    """Return every feature's attributes for `where`, paging by the rows actually returned."""
    url = layer_query_url(layer)
    fields = ",".join(out_fields)
    out: list[dict] = []
    offset = 0
    for _ in range(max_pages):
        body = get_json(url, {
            "where": where,
            "outFields": fields,
            "orderByFields": "ObjectId",
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "returnGeometry": "false",
            "f": "json",
        })
        if "error" in body:
            raise ArcGisError(f"{layer}: {body['error']}")
        feats = [f["attributes"] for f in body.get("features", [])]
        out.extend(feats)
        offset += len(feats)
        if not feats or (len(feats) < page_size and not body.get("exceededTransferLimit")):
            return out
    raise ArcGisError(f"{layer}: exceeded max_pages={max_pages}")


def normalize_records(records, str_fields=(), int_fields=(), float_fields=()) -> list[dict]:
    """Project records onto the declared fields with Spark-friendly Python types (missing -> None)."""
    def as_str(v):
        return None if v is None else str(v)

    def as_int(v):
        return None if v is None else int(v)

    def as_float(v):
        return None if v is None else float(v)

    out = []
    for rec in records:
        row = {}
        for f in str_fields:
            row[f] = as_str(rec.get(f))
        for f in int_fields:
            row[f] = as_int(rec.get(f))
        for f in float_fields:
            row[f] = as_float(rec.get(f))
        out.append(row)
    return out
