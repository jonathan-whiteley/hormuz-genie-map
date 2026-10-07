# Hormuz Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A replicable Databricks bundle that lands IMF PortWatch + Natural Earth reference data and gold "visible transits vs. baseline" tables on a daily schedule, a Genie space over them, and a ready-to-switch-on aisstream.io live AIS pipeline.

**Architecture:** One Declarative Automation Bundle with two Lakeflow Spark Declarative Pipelines (serverless). `hormuz_reference` (triggered daily by a job) pulls PortWatch via paginated ArcGIS REST and Natural Earth land polygons inside Python materialized views, then builds SQL gold MVs. `hormuz_ais_live` uses a custom PySpark streaming data source (`aisstream`) that opens the aisstream.io websocket for a fixed window per micro-batch and always emits a heartbeat row. All network/parsing logic lives in pure Python modules under `src/hormuz_sources/` with local pytest coverage; pipeline files are thin.

**Tech Stack:** Python 3.11, PySpark 4 Python Data Source API (`pyspark.sql.datasource`), Lakeflow SDP (`from pyspark import pipelines as dp`), Databricks SQL H3 + ST functions, `requests`, `websockets`, Databricks CLI bundles, pytest, uv.

**Spec:** `docs/design.md`

## Global Constraints

- Workspace profile: `DEFAULT` (https://<your-workspace>.cloud.databricks.com). Pass `--profile DEFAULT` on every CLI call.
- Catalog `jdub_demo`, schema `hormuz` (both are bundle variables; defaults exactly these).
- SQL warehouse id for verification and Genie: `<warehouse-id>`.
- Max 3 sources: PortWatch, aisstream.io, Natural Earth. Add no other data source.
- PortWatch base: `https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services`; `maxRecordCount` is 1000.
- Region bbox string `"12,32,31,62"` = lat_min, lon_min, lat_max, lon_max.
- Pre-war baseline: `2026-01-01` to `2026-02-27` inclusive.
- Region port ISO3 list: `SAU,ARE,QAT,KWT,BHR,IRQ,IRN,OMN,YEM,DJI,EGY`.
- Secret: scope `hormuz`, key `aisstream_api_key`. The key is NOT available yet: never start `hormuz_ais_live`.
- Modern SDP syntax only: `from pyspark import pipelines as dp`, `CREATE OR REFRESH`, no `LIVE.` prefix, no `import dlt`.
- No em dashes or en dashes in any prose, comments, table comments, README, or Genie text.
- Commit messages end with the line `Co-authored-by: Isaac <no-reply@databricks.com>`.
- Local tests: `cd ~/Desktop/Projects/hormuz-genie-map && uv run --no-project --with pytest --with websockets --with requests pytest -q`

## Review Focus

1. AIS "not available" coordinates (lat 91, lon 181) must be dropped before `h3_longlatash3`, which errors on invalid latitude. Pinned in Task 4 Step 6 (warehouse check over VALUES rows).
2. PortWatch returns Python `int` for Double fields and `None` for gaps; `createDataFrame` with DoubleType rejects `int`. Pinned in Task 1 `test_normalize_*`.
3. ArcGIS can return fewer rows than requested while `exceededTransferLimit` is true; pagination must advance by rows actually returned and stop on an empty page. Pinned in Task 1 `test_fetch_*`.
4. A bad or empty aisstream key must fail the pipeline loudly, not write endless empty heartbeats. Pinned in Task 2 `test_empty_key_raises` and `test_server_error_message_raises`.
5. A websocket drop mid-window must keep the rows received and record the error on the heartbeat, so collector downtime is distinguishable from vessels going dark. Pinned in Task 2 `test_connection_drop_keeps_rows_and_records_error`.

---

### Task 1: Scaffold + pure PortWatch/geo helpers

**Files:**
- Create: `pyproject.toml`, `.gitignore`, `src/hormuz_sources/__init__.py`, `src/hormuz_sources/geo.py`, `src/hormuz_sources/arcgis.py`, `src/hormuz_sources/portwatch.py`
- Test: `tests/test_geo.py`, `tests/test_arcgis.py`, `tests/test_portwatch.py`

**Interfaces:**
- Produces:
  - `geo.parse_bbox(text: str) -> tuple[float, float, float, float]` (lat_min, lon_min, lat_max, lon_max); raises `ValueError` on bad input.
  - `geo.bbox_to_wkt(bbox) -> str` closed POLYGON in lon/lat order.
  - `geo.land_rows(feature_collection: dict) -> list[tuple[int, str | None, str]]` = (land_id, featurecla, geometry GeoJSON string).
  - `arcgis.PORTWATCH_BASE: str`, `arcgis.ArcGisError`, `arcgis.layer_query_url(layer) -> str`
  - `arcgis.fetch_features(layer, where, out_fields, get_json=requests_get_json, page_size=1000, max_pages=2000) -> list[dict]` (attributes dicts)
  - `arcgis.normalize_records(records, str_fields=(), int_fields=(), float_fields=()) -> list[dict]`
  - `portwatch.LayerSpec` dataclass (`layer`, `str_fields`, `int_fields`, `float_fields`, property `out_fields`) and constants `CHOKEPOINTS_DAILY`, `PORTS_DAILY`, `CHOKEPOINTS_REF`, `PORTS_REF`
  - `portwatch.since_where(since: str) -> str`, `portwatch.iso3_where(iso3_csv: str, since: str | None = None) -> str`

- [ ] **Step 1: Scaffold files**

`pyproject.toml`:
```toml
[project]
name = "hormuz-genie-map"
version = "0.1.0"
requires-python = ">=3.10"

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

`.gitignore`:
```
__pycache__/
*.pyc
.pytest_cache/
.venv/
.databricks/
.DS_Store
```

`src/hormuz_sources/__init__.py`:
```python
"""Pure helpers for the Hormuz Genie Map data sources (no Spark imports here except sparkutil and aisstream_datasource)."""
```

- [ ] **Step 2: Write failing tests**

`tests/test_geo.py`:
```python
import json
import pytest
from hormuz_sources.geo import parse_bbox, bbox_to_wkt, land_rows


def test_parse_bbox_ok():
    assert parse_bbox("12,32,31,62") == (12.0, 32.0, 31.0, 62.0)
    assert parse_bbox(" 12 , 32 , 31 , 62 ") == (12.0, 32.0, 31.0, 62.0)


@pytest.mark.parametrize("bad", ["", "1,2,3", "a,b,c,d", "31,32,12,62", "12,62,31,32", "-91,0,0,10", "0,-181,10,10"])
def test_parse_bbox_rejects_bad(bad):
    with pytest.raises(ValueError):
        parse_bbox(bad)


def test_bbox_to_wkt_is_closed_lon_lat():
    assert bbox_to_wkt((12.0, 32.0, 31.0, 62.0)) == "POLYGON((32.0 12.0, 62.0 12.0, 62.0 31.0, 32.0 31.0, 32.0 12.0))"


def test_land_rows_serializes_geometry_and_skips_null():
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"featurecla": "Land"}, "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}},
        {"type": "Feature", "properties": {}, "geometry": None},
        {"type": "Feature", "properties": None, "geometry": {"type": "Polygon", "coordinates": [[[2, 2], [3, 2], [3, 3], [2, 2]]]}},
    ]}
    rows = land_rows(fc)
    assert [r[0] for r in rows] == [0, 2]
    assert rows[0][1] == "Land" and rows[1][1] is None
    assert json.loads(rows[0][2])["type"] == "Polygon"
```

`tests/test_arcgis.py`:
```python
import pytest
from hormuz_sources.arcgis import ArcGisError, fetch_features, layer_query_url, normalize_records


def pager(pages, exceeded=None):
    """Fake get_json returning successive pages; records every params dict."""
    calls = []
    def get_json(url, params):
        calls.append(dict(params))
        i = len(calls) - 1
        feats = pages[i] if i < len(pages) else []
        body = {"features": [{"attributes": a} for a in feats]}
        if exceeded and i < len(exceeded):
            body["exceededTransferLimit"] = exceeded[i]
        return body
    return get_json, calls


def test_layer_query_url():
    assert layer_query_url("Daily_Chokepoints_Data").endswith("/Daily_Chokepoints_Data/FeatureServer/0/query")


def test_fetch_paginates_until_short_page():
    get_json, calls = pager([[{"x": i} for i in range(3)], [{"x": i} for i in range(3, 6)], [{"x": 6}]])
    out = fetch_features("L", "1=1", ["x"], get_json=get_json, page_size=3)
    assert [r["x"] for r in out] == list(range(7))
    assert [c["resultOffset"] for c in calls] == [0, 3, 6]
    assert calls[0]["outFields"] == "x" and calls[0]["orderByFields"] == "ObjectId" and calls[0]["f"] == "json"


def test_fetch_advances_by_rows_returned_when_server_caps():
    # server caps at 2 rows although we ask for 3, signalling more via exceededTransferLimit
    get_json, calls = pager([[{"x": 0}, {"x": 1}], [{"x": 2}, {"x": 3}], [{"x": 4}]], exceeded=[True, True, False])
    out = fetch_features("L", "1=1", ["x"], get_json=get_json, page_size=3)
    assert [r["x"] for r in out] == [0, 1, 2, 3, 4]
    assert [c["resultOffset"] for c in calls] == [0, 2, 4]


def test_fetch_stops_on_empty_page_even_if_exceeded_flag():
    get_json, calls = pager([[{"x": 0}], []], exceeded=[True, True])
    assert fetch_features("L", "1=1", ["x"], get_json=get_json, page_size=3) == [{"x": 0}]
    assert len(calls) == 2


def test_fetch_raises_on_error_body():
    def get_json(url, params):
        return {"error": {"code": 400, "message": "Invalid query"}}
    with pytest.raises(ArcGisError, match="Invalid query"):
        fetch_features("L", "bad", ["x"], get_json=get_json)


def test_fetch_raises_when_max_pages_exceeded():
    get_json, _ = pager([[{"x": 1}]] * 10, exceeded=[True] * 10)
    with pytest.raises(ArcGisError, match="max_pages"):
        fetch_features("L", "1=1", ["x"], get_json=get_json, page_size=1, max_pages=3)


def test_normalize_coerces_ints_floats_and_nulls():
    rows = normalize_records(
        [{"date": "2026-10-04", "n_total": 4.0, "capacity": 0, "extra": "drop me"}, {"date": None}],
        str_fields=("date",), int_fields=("n_total",), float_fields=("capacity",),
    )
    assert rows[0] == {"date": "2026-10-04", "n_total": 4, "capacity": 0.0}
    assert isinstance(rows[0]["capacity"], float) and isinstance(rows[0]["n_total"], int)
    assert rows[1] == {"date": None, "n_total": None, "capacity": None}


def test_normalize_stringifies_non_string_str_fields():
    assert normalize_records([{"portid": 6}], str_fields=("portid",)) == [{"portid": "6"}]
```

`tests/test_portwatch.py`:
```python
import pytest
from hormuz_sources.portwatch import CHOKEPOINTS_DAILY, PORTS_DAILY, CHOKEPOINTS_REF, PORTS_REF, since_where, iso3_where


def test_specs_have_expected_layers_and_fields():
    assert CHOKEPOINTS_DAILY.layer == "Daily_Chokepoints_Data"
    assert "n_tanker" in CHOKEPOINTS_DAILY.int_fields and "capacity_tanker" in CHOKEPOINTS_DAILY.float_fields
    assert PORTS_DAILY.layer == "Daily_Ports_Data" and "ISO3" in PORTS_DAILY.str_fields
    assert "export_tanker" in PORTS_DAILY.float_fields and "portcalls_tanker" in PORTS_DAILY.int_fields
    assert CHOKEPOINTS_REF.layer == "PortWatch_chokepoints_database" and "lat" in CHOKEPOINTS_REF.float_fields
    assert PORTS_REF.layer == "PortWatch_ports_database"
    assert CHOKEPOINTS_DAILY.out_fields == list(CHOKEPOINTS_DAILY.str_fields + CHOKEPOINTS_DAILY.int_fields + CHOKEPOINTS_DAILY.float_fields)


def test_since_where():
    assert since_where("2019-01-01") == "date >= '2019-01-01'"


@pytest.mark.parametrize("bad", ["2019-1-1", "2019-01-01' OR 1=1 --", ""])
def test_since_where_rejects_bad(bad):
    with pytest.raises(ValueError):
        since_where(bad)


def test_iso3_where():
    assert iso3_where("SAU, are") == "ISO3 IN ('SAU','ARE')"
    assert iso3_where("SAU,ARE", since="2024-01-01") == "ISO3 IN ('SAU','ARE') AND date >= '2024-01-01'"


@pytest.mark.parametrize("bad", ["", "SA", "SAU,'); DROP", "SAUD"])
def test_iso3_where_rejects_bad(bad):
    with pytest.raises(ValueError):
        iso3_where(bad)
```

- [ ] **Step 3: Run tests, verify they fail**

Run the Global Constraints test command. Expected: collection errors / `ModuleNotFoundError: hormuz_sources.geo`.

- [ ] **Step 4: Implement**

`src/hormuz_sources/geo.py`:
```python
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
```

`src/hormuz_sources/arcgis.py`:
```python
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
```

`src/hormuz_sources/portwatch.py`:
```python
"""PortWatch layer specs and validated WHERE-clause builders (pure Python)."""
from __future__ import annotations

import re
from dataclasses import dataclass

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ISO3 = re.compile(r"^[A-Z]{3}$")


@dataclass(frozen=True)
class LayerSpec:
    layer: str
    str_fields: tuple[str, ...]
    int_fields: tuple[str, ...] = ()
    float_fields: tuple[str, ...] = ()

    @property
    def out_fields(self) -> list[str]:
        return list(self.str_fields + self.int_fields + self.float_fields)


_VESSEL = ("container", "dry_bulk", "general_cargo", "roro", "tanker", "cargo")

CHOKEPOINTS_DAILY = LayerSpec(
    layer="Daily_Chokepoints_Data",
    str_fields=("date", "portid", "portname"),
    int_fields=tuple(f"n_{v}" for v in _VESSEL) + ("n_total",),
    float_fields=tuple(f"capacity_{v}" for v in _VESSEL) + ("capacity",),
)

PORTS_DAILY = LayerSpec(
    layer="Daily_Ports_Data",
    str_fields=("date", "portid", "portname", "country", "ISO3"),
    int_fields=tuple(f"portcalls_{v}" for v in _VESSEL) + ("portcalls",),
    float_fields=tuple(f"import_{v}" for v in _VESSEL) + ("import",) + tuple(f"export_{v}" for v in _VESSEL) + ("export",),
)

_REF_STR = ("portid", "portname", "country", "ISO3", "fullname", "LOCODE")
_REF_FLOAT = ("lat", "lon", "vessel_count_total", "vessel_count_tanker", "vessel_count_container", "vessel_count_dry_bulk")

CHOKEPOINTS_REF = LayerSpec(layer="PortWatch_chokepoints_database", str_fields=_REF_STR, float_fields=_REF_FLOAT)
PORTS_REF = LayerSpec(layer="PortWatch_ports_database", str_fields=_REF_STR, float_fields=_REF_FLOAT)


def since_where(since: str) -> str:
    if not _DATE.match(since or ""):
        raise ValueError(f"since must be YYYY-MM-DD, got {since!r}")
    return f"date >= '{since}'"


def iso3_where(iso3_csv: str, since: str | None = None) -> str:
    codes = [c.strip().upper() for c in (iso3_csv or "").split(",") if c.strip()]
    if not codes or not all(_ISO3.match(c) for c in codes):
        raise ValueError(f"iso3 list must be comma-separated 3-letter codes, got {iso3_csv!r}")
    clause = "ISO3 IN (" + ",".join(f"'{c}'" for c in codes) + ")"
    return clause if since is None else f"{clause} AND {since_where(since)}"
```

- [ ] **Step 5: Run tests, verify they pass**

Run the test command. Expected: all tests in the three files PASS.

- [ ] **Step 6: Live smoke check against PortWatch (read-only, no workspace)**

```bash
cd ~/Desktop/Projects/hormuz-genie-map && uv run --no-project --with requests python -c "
import sys; sys.path.insert(0,'src')
from hormuz_sources.arcgis import fetch_features, normalize_records
from hormuz_sources.portwatch import CHOKEPOINTS_DAILY as S, since_where
rows = normalize_records(fetch_features(S.layer, \"portname='Strait of Hormuz' AND \" + since_where('2026-09-01'), S.out_fields), S.str_fields, S.int_fields, S.float_fields)
print(len(rows), rows[-1])"
```
Expected: about 30+ rows, last row shows a 2026-10 date with small `n_total`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: pure PortWatch, ArcGIS paging, and geo helpers

Co-authored-by: Isaac <no-reply@databricks.com>"
```

---

### Task 2: aisstream.io collector core (pure, async)

**Files:**
- Create: `src/hormuz_sources/aisstream_core.py`
- Test: `tests/test_aisstream_core.py`

**Interfaces:**
- Consumes: `geo.Bbox` type alias.
- Produces:
  - `WS_URL = "wss://stream.aisstream.io/v0/stream"`, `DEFAULT_MESSAGE_TYPES = ("PositionReport", "StandardClassBPositionReport", "ShipStaticData")`, `HEARTBEAT_TYPE = "_heartbeat"`
  - `ROW_SCHEMA_DDL = "received_at TIMESTAMP, message_type STRING, mmsi BIGINT, payload STRING, window_start TIMESTAMP, window_end TIMESTAMP, n_messages INT, error STRING"`
  - `AisStreamError(RuntimeError)`
  - `build_subscription(api_key: str, bbox: Bbox, message_types=DEFAULT_MESSAGE_TYPES) -> str`
  - `parse_message(raw: str | bytes) -> tuple[str, int | None, str] | None` = (message_type, mmsi, json_text)
  - `collect_window(api_key, bbox, seconds, max_messages, message_types=DEFAULT_MESSAGE_TYPES, connect=None, now=None) -> list[tuple]` rows in `ROW_SCHEMA_DDL` order; the LAST row is always the heartbeat.

- [ ] **Step 1: Write failing tests**

`tests/test_aisstream_core.py`:
```python
import asyncio
import json
from datetime import datetime, timezone

import pytest

from hormuz_sources.aisstream_core import (
    HEARTBEAT_TYPE, AisStreamError, WS_URL, build_subscription, collect_window, parse_message,
)

BBOX = (12.0, 32.0, 31.0, 62.0)


def pos(mmsi=123456789, mtype="PositionReport"):
    return json.dumps({"MessageType": mtype, "MetaData": {"MMSI": mmsi, "latitude": 26.5, "longitude": 56.3},
                       "Message": {mtype: {"Sog": 11.2}}})


class FakeWS:
    def __init__(self, messages, close_exc=None):
        self.messages = list(messages)
        self.sent = []
        self.close_exc = close_exc
        self.url = None

    async def send(self, m):
        self.sent.append(m)

    async def recv(self):
        if self.messages:
            return self.messages.pop(0)
        if self.close_exc:
            raise self.close_exc
        await asyncio.sleep(3600)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def connect_to(ws):
    def connect(url):
        ws.url = url
        return ws
    return connect


def test_build_subscription_shape():
    sub = json.loads(build_subscription("k", BBOX, ("PositionReport",)))
    assert sub == {"APIKey": "k", "BoundingBoxes": [[[12.0, 32.0], [31.0, 62.0]]], "FilterMessageTypes": ["PositionReport"]}


def test_empty_key_raises():
    with pytest.raises(AisStreamError, match="key"):
        build_subscription("", BBOX)


def test_parse_message_bytes_and_skip():
    assert parse_message(pos().encode())[:2] == ("PositionReport", 123456789)
    assert parse_message(json.dumps({"MetaData": {}})) is None


def test_server_error_message_raises():
    ws = FakeWS([json.dumps({"error": "Api Key Is Not Valid"})])
    with pytest.raises(AisStreamError, match="Not Valid"):
        collect_window("bad", BBOX, seconds=1, max_messages=10, connect=connect_to(ws))


def test_collect_rows_then_heartbeat():
    ws = FakeWS([pos(1), pos(2, "StandardClassBPositionReport"), json.dumps({"x": 1})])
    rows = collect_window("k", BBOX, seconds=0.3, max_messages=100, connect=connect_to(ws))
    assert ws.url == WS_URL and json.loads(ws.sent[0])["APIKey"] == "k"
    data, hb = rows[:-1], rows[-1]
    assert [(r[1], r[2]) for r in data] == [("PositionReport", 1), ("StandardClassBPositionReport", 2)]
    assert all(r[4] == hb[4] and r[5] == hb[5] for r in data)  # same window bounds on every row
    assert hb[1] == HEARTBEAT_TYPE and hb[2] is None and hb[3] is None and hb[6] == 2 and hb[7] is None
    assert hb[4] <= hb[5] and hb[4].tzinfo is not None


def test_max_messages_caps_window():
    ws = FakeWS([pos(i) for i in range(10)])
    rows = collect_window("k", BBOX, seconds=5, max_messages=3, connect=connect_to(ws))
    assert len(rows) == 4 and rows[-1][6] == 3


def test_silent_stream_returns_only_heartbeat():
    rows = collect_window("k", BBOX, seconds=0.2, max_messages=10, connect=connect_to(FakeWS([])))
    assert len(rows) == 1 and rows[0][6] == 0 and rows[0][7] is None


def test_connection_drop_keeps_rows_and_records_error():
    ws = FakeWS([pos(7)], close_exc=ConnectionResetError("peer closed"))
    rows = collect_window("k", BBOX, seconds=5, max_messages=10, connect=connect_to(ws))
    assert rows[0][2] == 7
    assert rows[-1][6] == 1 and "ConnectionResetError" in rows[-1][7]


def test_connect_failure_records_error():
    def boom(url):
        raise OSError("dns fail")
    rows = collect_window("k", BBOX, seconds=1, max_messages=10, connect=boom)
    assert len(rows) == 1 and "OSError" in rows[0][7]


def test_works_inside_running_event_loop():
    async def main():
        return collect_window("k", BBOX, seconds=0.2, max_messages=10, connect=connect_to(FakeWS([pos(9)])))
    rows = asyncio.run(main())
    assert rows[0][2] == 9


def test_uses_injected_clock():
    t = datetime(2026, 10, 7, tzinfo=timezone.utc)
    rows = collect_window("k", BBOX, seconds=0.1, max_messages=10, connect=connect_to(FakeWS([])), now=lambda: t)
    assert rows[0][0] == t and rows[0][4] == t and rows[0][5] == t
```

- [ ] **Step 2: Run tests, verify they fail** (ModuleNotFoundError).

- [ ] **Step 3: Implement** `src/hormuz_sources/aisstream_core.py`:
```python
"""aisstream.io websocket collector: one bounded listening window per call (pure Python, no Spark).

Every call returns the messages received plus a final heartbeat row describing the window, so
downstream logic can tell "we were not listening" apart from "a vessel stopped transmitting".
"""
from __future__ import annotations

import asyncio
import json
import threading
import time
from datetime import datetime, timezone
from typing import Callable, Optional

WS_URL = "wss://stream.aisstream.io/v0/stream"
DEFAULT_MESSAGE_TYPES = ("PositionReport", "StandardClassBPositionReport", "ShipStaticData")
HEARTBEAT_TYPE = "_heartbeat"
ROW_SCHEMA_DDL = (
    "received_at TIMESTAMP, message_type STRING, mmsi BIGINT, payload STRING, "
    "window_start TIMESTAMP, window_end TIMESTAMP, n_messages INT, error STRING"
)


class AisStreamError(RuntimeError):
    """Fatal collector error (bad key, server-side error). Fails the pipeline on purpose."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _default_connect(url: str):
    import websockets  # permessage-deflate compression is on by default (required by aisstream since Sep 2026)

    return websockets.connect(url, open_timeout=10, max_size=2 ** 22)


def build_subscription(api_key: str, bbox, message_types=DEFAULT_MESSAGE_TYPES) -> str:
    if not api_key:
        raise AisStreamError("aisstream API key is empty; set secret hormuz/aisstream_api_key")
    lat_min, lon_min, lat_max, lon_max = bbox
    return json.dumps({
        "APIKey": api_key,
        "BoundingBoxes": [[[lat_min, lon_min], [lat_max, lon_max]]],
        "FilterMessageTypes": list(message_types),
    })


def parse_message(raw) -> Optional[tuple[str, Optional[int], str]]:
    text = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw
    msg = json.loads(text)
    if "error" in msg:
        raise AisStreamError(f"aisstream error: {msg['error']}")
    mtype = msg.get("MessageType")
    if not mtype:
        return None
    mmsi = (msg.get("MetaData") or {}).get("MMSI")
    return mtype, (int(mmsi) if mmsi is not None else None), text


async def _collect(subscription: str, seconds: float, max_messages: int, connect, now) -> list[tuple]:
    window_start = now()
    received: list[tuple] = []
    error: Optional[str] = None
    try:
        async with connect(WS_URL) as ws:
            await ws.send(subscription)
            deadline = time.monotonic() + seconds
            while len(received) < max_messages:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                except asyncio.TimeoutError:
                    break
                parsed = parse_message(raw)
                if parsed:
                    received.append((now(),) + parsed)
    except AisStreamError:
        raise
    except Exception as exc:  # connection refused/dropped: keep what we have, record why the window ended
        error = f"{type(exc).__name__}: {exc}"
    window_end = now()
    rows = [(ts, mtype, mmsi, text, window_start, window_end, None, None) for ts, mtype, mmsi, text in received]
    rows.append((window_end, HEARTBEAT_TYPE, None, None, window_start, window_end, len(received), error))
    return rows


def _run(coro):
    """asyncio.run, but safe when called from a thread that already has a running loop (e.g. a notebook)."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    box: dict = {}

    def target():
        try:
            box["value"] = asyncio.run(coro)
        except BaseException as exc:  # re-raised in the caller's thread
            box["error"] = exc

    t = threading.Thread(target=target)
    t.start()
    t.join()
    if "error" in box:
        raise box["error"]
    return box["value"]


def collect_window(
    api_key: str,
    bbox,
    seconds: float,
    max_messages: int,
    message_types=DEFAULT_MESSAGE_TYPES,
    connect: Optional[Callable] = None,
    now: Optional[Callable[[], datetime]] = None,
) -> list[tuple]:
    subscription = build_subscription(api_key, bbox, message_types)
    return _run(_collect(subscription, seconds, max_messages, connect or _default_connect, now or _utcnow))
```

Note: in `test_connect_failure_records_error` the fake `connect` raises synchronously inside the `try`, which the generic `except` captures. Keep `connect(WS_URL)` inside the `try`.

- [ ] **Step 4: Run tests, verify they pass** (all of tests/ PASS).

- [ ] **Step 5: Commit** `feat: aisstream websocket collector core with heartbeat rows` (with the Co-authored-by trailer).

---

### Task 3: Reference pipeline, gold tables, bundle, daily job (deploy + run on DEFAULT)

**Files:**
- Create: `databricks.yml`, `resources/hormuz_reference.pipeline.yml`, `resources/hormuz_reference_daily.job.yml`
- Create: `src/hormuz_sources/sparkutil.py`
- Create: `src/pipelines/reference/bronze_portwatch_chokepoints_daily.py`, `src/pipelines/reference/bronze_portwatch_ports_daily.py`, `src/pipelines/reference/ref_portwatch_chokepoints.py`, `src/pipelines/reference/ref_portwatch_ports.py`, `src/pipelines/reference/ref_land_region.py`
- Create: `src/pipelines/reference/ref_conflict_events.sql`, `src/pipelines/reference/gold_chokepoint_daily.sql`, `src/pipelines/reference/gold_port_daily.sql`

**Interfaces:**
- Consumes: Task 1 `fetch_features`, `normalize_records`, specs, `since_where`, `iso3_where`, `parse_bbox`, `bbox_to_wkt`, `land_rows`.
- Produces (UC tables in `jdub_demo.hormuz`): `bronze_portwatch_chokepoints_daily`, `bronze_portwatch_ports_daily`, `ref_portwatch_chokepoints`, `ref_portwatch_ports`, `ref_land_region (land_id, featurecla, geom_wkt, area_deg2)`, `ref_conflict_events (event_date, event, source_url)`, `gold_chokepoint_daily`, `gold_port_daily`. Also `sparkutil.spec_dataframe(spark, spec, rows)`.

- [ ] **Step 1: Create the schema (idempotent)**

```bash
databricks schemas get jdub_demo.hormuz --profile DEFAULT || databricks schemas create hormuz jdub_demo --comment "Hormuz Genie Map demo" --profile DEFAULT
databricks secrets create-scope hormuz --profile DEFAULT || true
```

- [ ] **Step 2: Bundle files**

`databricks.yml`:
```yaml
bundle:
  name: hormuz_genie_map

variables:
  catalog:
    description: Unity Catalog catalog for all tables
    default: jdub_demo
  schema:
    description: Schema for all tables (create it first; see README)
    default: hormuz
  bbox:
    description: Region as lat_min,lon_min,lat_max,lon_max
    default: "12,32,31,62"
  secret_scope:
    description: Secret scope holding the aisstream.io key
    default: hormuz
  ais_continuous:
    description: Run the live AIS pipeline continuously (set true once the aisstream key is stored)
    default: false

include:
  - resources/*.yml

targets:
  demo:
    default: true
    workspace:
      root_path: /Workspace/Users/${workspace.current_user.userName}/.bundle/${bundle.name}/${bundle.target}
```

`resources/hormuz_reference.pipeline.yml`:
```yaml
resources:
  pipelines:
    hormuz_reference:
      name: hormuz_reference
      catalog: ${var.catalog}
      schema: ${var.schema}
      serverless: true
      channel: CURRENT
      root_path: ../src
      libraries:
        - glob:
            include: ../src/pipelines/reference/**
      configuration:
        hormuz.bbox: ${var.bbox}
        hormuz.baseline_start: "2026-01-01"
        hormuz.baseline_end: "2026-02-27"
        hormuz.chokepoints_since: "2019-01-01"
        hormuz.ports_since: "2024-01-01"
        hormuz.port_iso3: "SAU,ARE,QAT,KWT,BHR,IRQ,IRN,OMN,YEM,DJI,EGY"
        hormuz.land_geojson_url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson"
      environment:
        dependencies:
          - requests
```

`resources/hormuz_reference_daily.job.yml`:
```yaml
resources:
  jobs:
    hormuz_reference_daily:
      name: hormuz_reference_daily
      schedule:
        quartz_cron_expression: "0 0 7 * * ?"
        timezone_id: UTC
      tasks:
        - task_key: refresh_reference
          pipeline_task:
            pipeline_id: ${resources.pipelines.hormuz_reference.id}
```

- [ ] **Step 3: Spark helper** `src/hormuz_sources/sparkutil.py`:
```python
"""Spark-side helper: build a typed DataFrame from normalized PortWatch rows."""
from __future__ import annotations

from pyspark.sql import DataFrame, functions as F
from pyspark.sql.types import DoubleType, LongType, StringType, StructField, StructType

from hormuz_sources.portwatch import LayerSpec


def spec_schema(spec: LayerSpec) -> StructType:
    return StructType(
        [StructField(f, StringType()) for f in spec.str_fields]
        + [StructField(f, LongType()) for f in spec.int_fields]
        + [StructField(f, DoubleType()) for f in spec.float_fields]
    )


def spec_dataframe(spark, spec: LayerSpec, rows: list[dict]) -> DataFrame:
    df = spark.createDataFrame(rows, spec_schema(spec))
    if "date" in spec.str_fields:
        df = df.withColumn("date", F.to_date("date"))
    return df.withColumn("ingested_at", F.current_timestamp())
```

- [ ] **Step 4: Python MVs**

`src/pipelines/reference/bronze_portwatch_chokepoints_daily.py`:
```python
from pyspark import pipelines as dp

from hormuz_sources.arcgis import fetch_features, normalize_records
from hormuz_sources.portwatch import CHOKEPOINTS_DAILY as SPEC, since_where
from hormuz_sources.sparkutil import spec_dataframe


@dp.materialized_view(
    name="bronze_portwatch_chokepoints_daily",
    comment="IMF PortWatch daily AIS-derived transit counts and capacity for 28 global chokepoints. Source: portwatch.imf.org (Daily_Chokepoints_Data).",
)
def bronze_portwatch_chokepoints_daily():
    since = spark.conf.get("hormuz.chokepoints_since", "2019-01-01")
    feats = fetch_features(SPEC.layer, since_where(since), SPEC.out_fields)
    rows = normalize_records(feats, SPEC.str_fields, SPEC.int_fields, SPEC.float_fields)
    return spec_dataframe(spark, SPEC, rows)
```

`src/pipelines/reference/bronze_portwatch_ports_daily.py`:
```python
from pyspark import pipelines as dp

from hormuz_sources.arcgis import fetch_features, normalize_records
from hormuz_sources.portwatch import PORTS_DAILY as SPEC, iso3_where
from hormuz_sources.sparkutil import spec_dataframe


@dp.materialized_view(
    name="bronze_portwatch_ports_daily",
    comment="IMF PortWatch daily port calls and estimated import/export volumes (metric tons) for Gulf and Red Sea region ports. Source: portwatch.imf.org (Daily_Ports_Data).",
)
def bronze_portwatch_ports_daily():
    where = iso3_where(spark.conf.get("hormuz.port_iso3"), since=spark.conf.get("hormuz.ports_since", "2024-01-01"))
    feats = fetch_features(SPEC.layer, where, SPEC.out_fields)
    rows = normalize_records(feats, SPEC.str_fields, SPEC.int_fields, SPEC.float_fields)
    return spec_dataframe(spark, SPEC, rows)
```

`src/pipelines/reference/ref_portwatch_chokepoints.py`:
```python
from pyspark import pipelines as dp
from pyspark.sql import functions as F

from hormuz_sources.arcgis import fetch_features, normalize_records
from hormuz_sources.portwatch import CHOKEPOINTS_REF as SPEC
from hormuz_sources.sparkutil import spec_dataframe


@dp.materialized_view(
    name="ref_portwatch_chokepoints",
    comment="PortWatch chokepoint locations (lat/lon, H3 res 7) and historical vessel counts. Source: portwatch.imf.org.",
)
def ref_portwatch_chokepoints():
    feats = fetch_features(SPEC.layer, "1=1", SPEC.out_fields)
    rows = normalize_records(feats, SPEC.str_fields, SPEC.int_fields, SPEC.float_fields)
    return spec_dataframe(spark, SPEC, rows).withColumn("h3_res7", F.expr("h3_longlatash3(lon, lat, 7)"))
```

`src/pipelines/reference/ref_portwatch_ports.py`:
```python
from pyspark import pipelines as dp
from pyspark.sql import functions as F

from hormuz_sources.arcgis import fetch_features, normalize_records
from hormuz_sources.portwatch import PORTS_REF as SPEC, iso3_where
from hormuz_sources.sparkutil import spec_dataframe


@dp.materialized_view(
    name="ref_portwatch_ports",
    comment="PortWatch port locations (lat/lon, H3 res 7) for Gulf and Red Sea region countries. Source: portwatch.imf.org.",
)
def ref_portwatch_ports():
    feats = fetch_features(SPEC.layer, iso3_where(spark.conf.get("hormuz.port_iso3")), SPEC.out_fields)
    rows = normalize_records(feats, SPEC.str_fields, SPEC.int_fields, SPEC.float_fields)
    return spec_dataframe(spark, SPEC, rows).withColumn("h3_res7", F.expr("h3_longlatash3(lon, lat, 7)"))
```

`src/pipelines/reference/ref_land_region.py`:
```python
import requests
from pyspark import pipelines as dp

from hormuz_sources.geo import bbox_to_wkt, land_rows, parse_bbox


@dp.materialized_view(
    name="ref_land_region",
    comment="Natural Earth 1:50m land polygons clipped to the demo region, as WKT (SRID 4326). Used to flag AIS positions reported on land.",
)
def ref_land_region():
    fc = requests.get(spark.conf.get("hormuz.land_geojson_url"), timeout=120).json()
    bbox_wkt = bbox_to_wkt(parse_bbox(spark.conf.get("hormuz.bbox", "12,32,31,62")))
    df = spark.createDataFrame(land_rows(fc), "land_id INT, featurecla STRING, geojson STRING")
    return (
        df.selectExpr(
            "land_id",
            "featurecla",
            f"st_intersection(st_geomfromgeojson(geojson), st_geomfromtext('{bbox_wkt}', 4326)) AS g",
        )
        .where("NOT st_isempty(g)")
        .selectExpr("land_id", "featurecla", "st_astext(g) AS geom_wkt", "st_area(g) AS area_deg2")
    )
```

- [ ] **Step 5: SQL MVs**

`src/pipelines/reference/ref_conflict_events.sql`:
```sql
CREATE OR REFRESH MATERIALIZED VIEW ref_conflict_events
COMMENT 'Key 2026 Iran war and Strait of Hormuz milestones for annotating charts. Dates come from public reporting (see source_url); verify before publishing.'
AS SELECT CAST(event_date AS DATE) AS event_date, event, source_url
FROM VALUES
  ('2026-02-28', 'US and Israeli strikes on Iran begin; war starts', 'https://en.wikipedia.org/wiki/2026_Iran_war'),
  ('2026-03-04', 'Iran declares the Strait of Hormuz closed', 'https://en.wikipedia.org/wiki/2026_Strait_of_Hormuz_crisis'),
  ('2026-03-08', 'Brent crude passes 100 USD per barrel', 'https://en.wikipedia.org/wiki/2026_Strait_of_Hormuz_crisis'),
  ('2026-04-08', 'Two-week ceasefire begins', 'https://en.wikipedia.org/wiki/2026_Iran_war'),
  ('2026-04-17', 'Brief partial reopening of the strait', 'https://en.wikipedia.org/wiki/2026_Strait_of_Hormuz_crisis'),
  ('2026-06-17', 'US and Iran sign memorandum to end the war', 'https://en.wikipedia.org/wiki/2026_Iran_war'),
  ('2026-06-20', 'Iran recloses the strait citing violations', 'https://en.wikipedia.org/wiki/2026_Strait_of_Hormuz_crisis'),
  ('2026-07-08', 'Ceasefire collapses after attacks on commercial vessels', 'https://en.wikipedia.org/wiki/2026_Iran_war'),
  ('2026-09-22', 'Saudi Arabia restarts East-West pipeline for crude exports to Yanbu', 'https://www.thenationalnews.com/')
AS t(event_date, event, source_url);
```

`src/pipelines/reference/gold_chokepoint_daily.sql`:
```sql
CREATE OR REFRESH MATERIALIZED VIEW gold_chokepoint_daily
COMMENT 'Daily AIS-visible transits per chokepoint with 7-day averages and percent of the pre-war baseline (mean of 2026-01-01 to 2026-02-27). Source: IMF PortWatch. Counts only vessels broadcasting AIS; dark transits are not included.'
AS
WITH baseline AS (
  SELECT portid,
         AVG(n_total) AS baseline_total,
         AVG(n_tanker) AS baseline_tanker,
         AVG(capacity_tanker) AS baseline_capacity_tanker
  FROM bronze_portwatch_chokepoints_daily
  WHERE date BETWEEN DATE'${hormuz.baseline_start}' AND DATE'${hormuz.baseline_end}'
  GROUP BY portid
)
SELECT
  d.date,
  d.portid,
  d.portname AS chokepoint,
  c.lat, c.lon, c.h3_res7,
  d.n_total, d.n_tanker, d.n_container, d.n_dry_bulk, d.n_general_cargo, d.n_roro,
  d.capacity_tanker,
  AVG(d.n_total)  OVER (PARTITION BY d.portid ORDER BY d.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS n_total_7d_avg,
  AVG(d.n_tanker) OVER (PARTITION BY d.portid ORDER BY d.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS n_tanker_7d_avg,
  b.baseline_total,
  b.baseline_tanker,
  ROUND(100 * d.n_total  / NULLIF(b.baseline_total, 0), 1)  AS pct_of_baseline_total,
  ROUND(100 * d.n_tanker / NULLIF(b.baseline_tanker, 0), 1) AS pct_of_baseline_tanker
FROM bronze_portwatch_chokepoints_daily d
LEFT JOIN baseline b ON b.portid = d.portid
LEFT JOIN ref_portwatch_chokepoints c ON c.portid = d.portid;
```

`src/pipelines/reference/gold_port_daily.sql`:
```sql
CREATE OR REFRESH MATERIALIZED VIEW gold_port_daily
COMMENT 'Daily port calls and estimated tanker export/import volumes (metric tons) for Gulf and Red Sea region ports, with 7-day averages and percent of the pre-war baseline (mean of 2026-01-01 to 2026-02-27). Bypass ports outside the strait include Fujairah and Khor Fakkan (UAE) and Yanbu (Saudi Red Sea coast). Source: IMF PortWatch.'
AS
WITH baseline AS (
  SELECT portid,
         AVG(portcalls) AS baseline_portcalls,
         AVG(portcalls_tanker) AS baseline_portcalls_tanker,
         AVG(export_tanker) AS baseline_export_tanker
  FROM bronze_portwatch_ports_daily
  WHERE date BETWEEN DATE'${hormuz.baseline_start}' AND DATE'${hormuz.baseline_end}'
  GROUP BY portid
)
SELECT
  d.date,
  d.portid,
  d.portname AS port,
  d.country,
  d.ISO3 AS iso3,
  p.lat, p.lon, p.h3_res7,
  d.portcalls, d.portcalls_tanker, d.portcalls_container,
  d.export_tanker, d.import_tanker,
  d.`export` AS export_total,
  d.`import` AS import_total,
  AVG(d.portcalls_tanker) OVER (PARTITION BY d.portid ORDER BY d.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS portcalls_tanker_7d_avg,
  AVG(d.export_tanker)    OVER (PARTITION BY d.portid ORDER BY d.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS export_tanker_7d_avg,
  b.baseline_portcalls, b.baseline_portcalls_tanker, b.baseline_export_tanker,
  ROUND(100 * d.portcalls_tanker / NULLIF(b.baseline_portcalls_tanker, 0), 1) AS pct_of_baseline_portcalls_tanker,
  ROUND(100 * d.export_tanker    / NULLIF(b.baseline_export_tanker, 0), 1)    AS pct_of_baseline_export_tanker
FROM bronze_portwatch_ports_daily d
LEFT JOIN baseline b ON b.portid = d.portid
LEFT JOIN ref_portwatch_ports p ON p.portid = d.portid;
```

- [ ] **Step 6: Validate, deploy, run**

```bash
cd ~/Desktop/Projects/hormuz-genie-map
databricks bundle validate --profile DEFAULT
databricks bundle deploy --profile DEFAULT
databricks bundle run hormuz_reference --profile DEFAULT
```
Expected: run COMPLETED. If it fails, read `error.exceptions[0].message` from `databricks pipelines list-pipeline-events <id> --profile DEFAULT` (see the databricks-pipelines skill). Known fallbacks, apply only if the matching error appears:
- `ModuleNotFoundError: hormuz_sources`: root_path is not on `sys.path`; add at the top of each Python pipeline file: `import os, sys; sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))` (for files under `src/pipelines/reference/` that resolves to `src/`). If `__file__` is undefined, use `spark.conf.get("bundle.sourcePath")` by adding `bundle.sourcePath: ${workspace.file_path}/src` to the pipeline configuration.
- Network errors reaching `services9.arcgis.com` or `raw.githubusercontent.com`: serverless egress is blocked in this workspace; STOP and report (do not add a different data source).
- `st_*` function not found: switch `channel: CURRENT` to `channel: PREVIEW`, redeploy, rerun.

- [ ] **Step 7: Verify data** (warehouse `<warehouse-id>`)

```bash
databricks experimental aitools tools query --profile DEFAULT "
SELECT 'chokepoints_daily' t, COUNT(*) n, MAX(date) mx FROM jdub_demo.hormuz.bronze_portwatch_chokepoints_daily
UNION ALL SELECT 'ports_daily', COUNT(*), MAX(date) FROM jdub_demo.hormuz.bronze_portwatch_ports_daily
UNION ALL SELECT 'ref_chokepoints', COUNT(*), NULL FROM jdub_demo.hormuz.ref_portwatch_chokepoints
UNION ALL SELECT 'ref_ports', COUNT(*), NULL FROM jdub_demo.hormuz.ref_portwatch_ports
UNION ALL SELECT 'land', COUNT(*), NULL FROM jdub_demo.hormuz.ref_land_region
UNION ALL SELECT 'events', COUNT(*), MAX(event_date) FROM jdub_demo.hormuz.ref_conflict_events"
```
Expected: chokepoints_daily about 80,000+ rows with max date in 2026-10; ports_daily about 70,000+; ref_chokepoints 28; ref_ports about 91; land > 0; events 9.

```bash
databricks experimental aitools tools query --profile DEFAULT "
SELECT date_trunc('month', date) m, ROUND(AVG(n_total),1) total, ROUND(AVG(n_tanker),1) tanker, ROUND(AVG(pct_of_baseline_total),1) pct
FROM jdub_demo.hormuz.gold_chokepoint_daily WHERE chokepoint = 'Strait of Hormuz' AND date >= '2026-01-01' GROUP BY 1 ORDER BY 1"
```
Expected (matches the PortWatch API probe): Jan about 58.5, Feb about 78.3, Mar about 3.2, Sep about 3.6 total per day.

- [ ] **Step 8: Commit** `feat: reference pipeline with PortWatch, land polygons, and gold baseline tables` (with trailer).

---

### Task 4: Live AIS pipeline (code + deploy, NOT started)

**Files:**
- Create: `src/hormuz_sources/aisstream_datasource.py`, `resources/hormuz_ais_live.pipeline.yml`
- Create: `src/pipelines/ais/bronze_ais_raw.py`, `src/pipelines/ais/silver_ais_positions.sql`, `src/pipelines/ais/silver_ais_static.sql`, `src/pipelines/ais/silver_collector_heartbeat.sql`
- Test: `tests/test_aisstream_datasource.py`

**Interfaces:**
- Consumes: Task 2 `collect_window`, `ROW_SCHEMA_DDL`, `DEFAULT_MESSAGE_TYPES`; Task 1 `parse_bbox`.
- Produces: data source format name `"aisstream"` with options `api_key`, `bbox`, `window_seconds`, `max_messages`, `message_types`; tables `bronze_ais_raw`, `silver_ais_positions`, `silver_ais_static`, `silver_collector_heartbeat`.

- [ ] **Step 1: Write failing test** `tests/test_aisstream_datasource.py`:
```python
import pytest

pytest.importorskip("pyspark.sql.datasource")

from hormuz_sources import aisstream_datasource as ds


def test_name_and_schema():
    assert ds.AisStreamDataSource.name() == "aisstream"
    assert ds.AisStreamDataSource(options={}).schema().startswith("received_at TIMESTAMP")


def test_reader_reads_one_window_and_advances_offset(monkeypatch):
    calls = []

    def fake_collect(api_key, bbox, seconds, max_messages, message_types):
        calls.append((api_key, bbox, seconds, max_messages, message_types))
        return [("row",)]

    monkeypatch.setattr(ds, "collect_window", fake_collect)
    reader = ds.AisStreamReader({"api_key": "k", "bbox": "12,32,31,62", "window_seconds": "5", "max_messages": "7", "message_types": "PositionReport, ShipStaticData"})
    assert reader.initialOffset() == {"batch": 0}
    rows, end = reader.read({"batch": 3})
    assert list(rows) == [("row",)] and end == {"batch": 4}
    assert calls == [("k", (12.0, 32.0, 31.0, 62.0), 5.0, 7, ("PositionReport", "ShipStaticData"))]
    assert list(reader.readBetweenOffsets({"batch": 0}, {"batch": 1})) == []


def test_reader_defaults():
    r = ds.AisStreamReader({"api_key": "k"})
    assert r.bbox == (12.0, 32.0, 31.0, 62.0) and r.seconds == 30.0 and r.max_messages == 50000
    assert r.message_types == ("PositionReport", "StandardClassBPositionReport", "ShipStaticData")
```

- [ ] **Step 2: Run with PySpark 4 to see it fail**

```bash
cd ~/Desktop/Projects/hormuz-genie-map && uv run --no-project --with pytest --with websockets --with requests --with "pyspark>=4.0,<4.1" pytest -q tests/test_aisstream_datasource.py
```
Expected: FAIL (ModuleNotFoundError `aisstream_datasource`). Under the default test command (no PySpark 4) this file is skipped.

- [ ] **Step 3: Implement** `src/hormuz_sources/aisstream_datasource.py`:
```python
"""PySpark streaming data source `aisstream`: each micro-batch listens to aisstream.io for one window.

aisstream does not replay missed events, so offsets are just a batch counter and
readBetweenOffsets returns nothing (data from a failed batch is not recoverable).
"""
from __future__ import annotations

from pyspark.sql.datasource import DataSource, SimpleDataSourceStreamReader

from hormuz_sources.aisstream_core import DEFAULT_MESSAGE_TYPES, ROW_SCHEMA_DDL, collect_window
from hormuz_sources.geo import parse_bbox


class AisStreamDataSource(DataSource):
    @classmethod
    def name(cls):
        return "aisstream"

    def schema(self):
        return ROW_SCHEMA_DDL

    def simpleStreamReader(self, schema):
        return AisStreamReader(self.options)


class AisStreamReader(SimpleDataSourceStreamReader):
    def __init__(self, options):
        self.api_key = options.get("api_key", "")
        self.bbox = parse_bbox(options.get("bbox", "12,32,31,62"))
        self.seconds = float(options.get("window_seconds", "30"))
        self.max_messages = int(options.get("max_messages", "50000"))
        types = options.get("message_types")
        self.message_types = tuple(t.strip() for t in types.split(",") if t.strip()) if types else DEFAULT_MESSAGE_TYPES

    def initialOffset(self):
        return {"batch": 0}

    def read(self, start):
        rows = collect_window(self.api_key, self.bbox, self.seconds, self.max_messages, self.message_types)
        return iter(rows), {"batch": int(start["batch"]) + 1}

    def readBetweenOffsets(self, start, end):
        return iter([])
```

- [ ] **Step 4: Run tests, verify pass** (both the PySpark 4 command above and the default command).

- [ ] **Step 5: Pipeline files and resource**

`src/pipelines/ais/bronze_ais_raw.py`:
```python
from pyspark import pipelines as dp

from hormuz_sources.aisstream_datasource import AisStreamDataSource

spark.dataSource.register(AisStreamDataSource)


@dp.table(
    name="bronze_ais_raw",
    comment="Raw aisstream.io messages for the demo region, one row per message plus one _heartbeat row per listening window.",
    cluster_by=["message_type"],
)
def bronze_ais_raw():
    api_key = dbutils.secrets.get(spark.conf.get("hormuz.secret_scope"), spark.conf.get("hormuz.secret_key"))
    return (
        spark.readStream.format("aisstream")
        .option("api_key", api_key)
        .option("bbox", spark.conf.get("hormuz.bbox"))
        .option("window_seconds", spark.conf.get("hormuz.ais_window_seconds", "30"))
        .load()
    )
```

`src/pipelines/ais/silver_ais_positions.sql`:
```sql
CREATE OR REFRESH STREAMING TABLE silver_ais_positions (
  CONSTRAINT has_mmsi EXPECT (mmsi IS NOT NULL) ON VIOLATION DROP ROW
)
CLUSTER BY (h3_res7, received_at)
COMMENT 'AIS position reports (class A and B) with H3 res 7 and 9 cells. AIS "not available" coordinates (lat 91, lon 181) are removed before indexing.'
AS SELECT
  received_at,
  mmsi,
  message_type,
  v:MetaData.ShipName::string AS ship_name,
  lat,
  lon,
  v:MetaData.time_utc::string AS time_utc_raw,
  coalesce(v:Message.PositionReport.Sog, v:Message.StandardClassBPositionReport.Sog)::double AS sog_knots,
  coalesce(v:Message.PositionReport.Cog, v:Message.StandardClassBPositionReport.Cog)::double AS cog_deg,
  coalesce(v:Message.PositionReport.TrueHeading, v:Message.StandardClassBPositionReport.TrueHeading)::int AS true_heading,
  v:Message.PositionReport.NavigationalStatus::int AS nav_status,
  h3_longlatash3(lon, lat, 7) AS h3_res7,
  h3_longlatash3(lon, lat, 9) AS h3_res9
FROM (
  SELECT received_at, mmsi, message_type, v,
         v:MetaData.latitude::double AS lat,
         v:MetaData.longitude::double AS lon
  FROM (SELECT *, parse_json(payload) AS v FROM STREAM(bronze_ais_raw)
        WHERE message_type IN ('PositionReport', 'StandardClassBPositionReport'))
)
WHERE lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180;
```

`src/pipelines/ais/silver_ais_static.sql`:
```sql
CREATE OR REFRESH STREAMING TABLE silver_ais_static
COMMENT 'AIS static and voyage data (ship type, size, draught, destination). Draught changes at port suggest loading or unloading.'
AS SELECT
  received_at,
  mmsi,
  v:MetaData.ShipName::string AS ship_name,
  v:Message.ShipStaticData.ImoNumber::bigint AS imo,
  v:Message.ShipStaticData.CallSign::string AS call_sign,
  v:Message.ShipStaticData.Type::int AS ship_type,
  (v:Message.ShipStaticData.Dimension.A::int + v:Message.ShipStaticData.Dimension.B::int) AS length_m,
  (v:Message.ShipStaticData.Dimension.C::int + v:Message.ShipStaticData.Dimension.D::int) AS beam_m,
  v:Message.ShipStaticData.MaximumStaticDraught::double AS draught_m,
  v:Message.ShipStaticData.Destination::string AS destination
FROM (SELECT *, parse_json(payload) AS v FROM STREAM(bronze_ais_raw) WHERE message_type = 'ShipStaticData');
```

`src/pipelines/ais/silver_collector_heartbeat.sql`:
```sql
CREATE OR REFRESH STREAMING TABLE silver_collector_heartbeat
COMMENT 'One row per collector listening window. Use it to exclude periods when the collector was down before treating AIS gaps as vessels going dark.'
AS SELECT
  window_start,
  window_end,
  timestampdiff(SECOND, window_start, window_end) AS window_seconds,
  n_messages,
  error
FROM STREAM(bronze_ais_raw)
WHERE message_type = '_heartbeat';
```

`resources/hormuz_ais_live.pipeline.yml`:
```yaml
resources:
  pipelines:
    hormuz_ais_live:
      name: hormuz_ais_live
      catalog: ${var.catalog}
      schema: ${var.schema}
      serverless: true
      channel: CURRENT
      continuous: ${var.ais_continuous}
      root_path: ../src
      libraries:
        - glob:
            include: ../src/pipelines/ais/**
      configuration:
        hormuz.bbox: ${var.bbox}
        hormuz.secret_scope: ${var.secret_scope}
        hormuz.secret_key: aisstream_api_key
        hormuz.ais_window_seconds: "30"
      environment:
        dependencies:
          - "websockets>=13,<17"
```

- [ ] **Step 6: Warehouse check of the silver parsing logic (pins Review Focus 1)**

```bash
databricks experimental aitools tools query --profile DEFAULT "
WITH bronze AS (SELECT * FROM VALUES
  ('PositionReport', 1, '{\"MessageType\":\"PositionReport\",\"MetaData\":{\"MMSI\":1,\"ShipName\":\"A\",\"latitude\":26.5,\"longitude\":56.3},\"Message\":{\"PositionReport\":{\"Sog\":11.5,\"Cog\":120.0,\"TrueHeading\":118,\"NavigationalStatus\":0}}}'),
  ('PositionReport', 2, '{\"MessageType\":\"PositionReport\",\"MetaData\":{\"MMSI\":2,\"latitude\":91.0,\"longitude\":181.0},\"Message\":{\"PositionReport\":{\"Sog\":0}}}')
  AS t(message_type, mmsi, payload))
SELECT mmsi, lat, lon, sog_knots, true_heading, h3_longlatash3(lon, lat, 7) AS h3_res7 FROM (
  SELECT mmsi, coalesce(v:Message.PositionReport.Sog, v:Message.StandardClassBPositionReport.Sog)::double AS sog_knots,
         coalesce(v:Message.PositionReport.TrueHeading, v:Message.StandardClassBPositionReport.TrueHeading)::int AS true_heading,
         v:MetaData.latitude::double AS lat, v:MetaData.longitude::double AS lon
  FROM (SELECT *, parse_json(payload) AS v FROM bronze))
WHERE lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180"
```
Expected: exactly one row, mmsi 1, sog 11.5, heading 118, non-null h3_res7. No error from the 91/181 row.

- [ ] **Step 7: Deploy without starting**

```bash
databricks bundle validate --profile DEFAULT && databricks bundle deploy --profile DEFAULT
databricks pipelines list-pipelines --filter "name LIKE '%hormuz_ais_live%'" --profile DEFAULT
```
Expected: pipeline exists, `continuous` false, no update running. Do NOT run `bundle run hormuz_ais_live`. If `continuous: ${var.ais_continuous}` fails validation as a non-boolean, replace it with a literal `continuous: false` and document in the README that users set it to `true` after storing the key.

- [ ] **Step 8: Commit** `feat: aisstream streaming data source and live AIS pipeline (not started)` (with trailer).

---

### Task 5: Genie space over the reference gold tables

**Files:**
- Create: `genie/space_config.py`, `genie/build_space.py`
- Test: `tests/test_genie_config.py`

**Interfaces:**
- Consumes: Task 3 tables in `jdub_demo.hormuz`.
- Produces: Genie space titled `Hormuz Chokepoint Monitor`; its id written to `genie/.space_id` (git-ignored) and printed.

Use the `databricks:databricks-genie-agents` skill for the exact create/update API and serialized-space format current in CLI v1.18 / databricks-sdk; read it before writing `build_space.py`.

- [ ] **Step 1: Write failing test** `tests/test_genie_config.py`:
```python
from genie.space_config import TABLES, INSTRUCTIONS, SAMPLE_QUESTIONS, EXAMPLE_SQL, table_identifiers


def test_tables_are_fully_qualified_and_in_schema():
    ids = table_identifiers("jdub_demo", "hormuz")
    assert ids == [f"jdub_demo.hormuz.{t}" for t in TABLES]
    assert "gold_chokepoint_daily" in TABLES and "gold_port_daily" in TABLES and "ref_conflict_events" in TABLES


def test_text_has_no_em_or_en_dashes():
    blob = INSTRUCTIONS + "".join(SAMPLE_QUESTIONS) + "".join(q + s for q, s in EXAMPLE_SQL)
    assert "—" not in blob and "–" not in blob


def test_example_sql_reference_only_known_tables():
    for _, sql in EXAMPLE_SQL:
        assert "jdub_demo.hormuz." not in sql  # templated with {catalog}.{schema}
        assert "{catalog}.{schema}." in sql
```
Add `tests/conftest.py` with `import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))` and `genie/__init__.py` (empty) so `genie.space_config` imports.

- [ ] **Step 2: Implement** `genie/space_config.py`:
```python
"""Genie space content for the Hormuz Chokepoint Monitor (catalog/schema templated)."""

TABLES = [
    "gold_chokepoint_daily",
    "gold_port_daily",
    "ref_conflict_events",
    "ref_portwatch_chokepoints",
    "ref_portwatch_ports",
]

INSTRUCTIONS = """You answer questions about shipping through the Strait of Hormuz and nearby chokepoints and ports during the 2026 Iran war.
- All counts come from IMF PortWatch and include only vessels broadcasting AIS. Many tankers transit with AIS off ("dark"), so low counts mean low visible traffic, not necessarily zero traffic. Say so when reporting Hormuz counts after 2026-02-28.
- The pre-war baseline is the mean of 2026-01-01 to 2026-02-27. Use pct_of_baseline_* columns for "compared to before the war".
- Chokepoint names: use the chokepoint column exactly, e.g. 'Strait of Hormuz', 'Bab el-Mandeb Strait', 'Suez Canal', 'Cape of Good Hope'.
- Bypass ports outside the strait: Fujairah and Khor Fakkan (UAE, Gulf of Oman) and Yanbu (Saudi Arabia, Red Sea). Ports inside the Gulf include Ras Tanura, Jebel Ali, Ras Laffan.
- Prefer 7-day averages (n_total_7d_avg, n_tanker_7d_avg, portcalls_tanker_7d_avg, export_tanker_7d_avg) for trends; daily values are noisy.
- export_tanker and import_tanker are estimated metric tons, not barrels.
- For map answers return lat, lon, and h3_res7 columns alongside the metric.
- Use ref_conflict_events to annotate or segment by war phase (event_date).
- Data lags real time by a few days; mention the latest date in the result."""

SAMPLE_QUESTIONS = [
    "How do daily tanker transits through the Strait of Hormuz compare to the pre-war baseline by month in 2026?",
    "Which region ports have tanker port calls above their pre-war baseline in the last 30 days?",
    "Compare 7-day average transits at Hormuz, Bab el-Mandeb, Suez Canal and Cape of Good Hope since January 2026.",
    "Show tanker exports at Fujairah and Yanbu by week since the war started.",
    "What were visible Hormuz transits in the week after each conflict event?",
]

EXAMPLE_SQL = [
    (
        "Monthly Hormuz transits vs. pre-war baseline",
        """SELECT date_trunc('month', date) AS month,
       ROUND(AVG(n_total), 1) AS avg_daily_transits,
       ROUND(AVG(n_tanker), 1) AS avg_daily_tanker_transits,
       ROUND(AVG(pct_of_baseline_total), 1) AS pct_of_prewar_baseline
FROM {catalog}.{schema}.gold_chokepoint_daily
WHERE chokepoint = 'Strait of Hormuz' AND date >= '2026-01-01'
GROUP BY 1 ORDER BY 1""",
    ),
    (
        "Bypass port tanker activity, weekly",
        """SELECT date_trunc('week', date) AS week, port,
       SUM(portcalls_tanker) AS tanker_port_calls,
       ROUND(SUM(export_tanker)) AS tanker_export_tonnes,
       ANY_VALUE(lat) AS lat, ANY_VALUE(lon) AS lon, ANY_VALUE(h3_res7) AS h3_res7
FROM {catalog}.{schema}.gold_port_daily
WHERE port IN ('Fujairah', 'Khor Fakkan', 'Yanbu') AND date >= '2026-02-28'
GROUP BY 1, 2 ORDER BY 1, 2""",
    ),
    (
        "Chokepoint comparison, 7-day average",
        """SELECT date, chokepoint, n_total_7d_avg, pct_of_baseline_total
FROM {catalog}.{schema}.gold_chokepoint_daily
WHERE chokepoint IN ('Strait of Hormuz', 'Bab el-Mandeb Strait', 'Suez Canal', 'Cape of Good Hope')
  AND date >= '2026-01-01'
ORDER BY date, chokepoint""",
    ),
]


def table_identifiers(catalog: str, schema: str) -> list[str]:
    return [f"{catalog}.{schema}.{t}" for t in TABLES]
```

- [ ] **Step 3: Implement `genie/build_space.py`** (create-or-update; CLI args `--profile DEFAULT --catalog jdub_demo --schema hormuz --warehouse-id <warehouse-id>`), following the genie-agents skill. It must: format `EXAMPLE_SQL` with catalog/schema; create the space if `genie/.space_id` is missing, else update it; write the id to `genie/.space_id`; print the space URL. Add `genie/.space_id` to `.gitignore`.

- [ ] **Step 4: Run tests** (default command): PASS.

- [ ] **Step 5: Build and verify live**

```bash
cd ~/Desktop/Projects/hormuz-genie-map && uv run --no-project --with databricks-sdk python -m genie.build_space --profile DEFAULT --catalog jdub_demo --schema hormuz --warehouse-id <warehouse-id>
```
Then ask the first three SAMPLE_QUESTIONS through the Genie Conversation API (per the genie-agents skill). Expected: each returns COMPLETED with SQL against the gold tables and non-empty rows; question 1 shows the Feb to Mar collapse. Record the three questions, the SQL, and row counts in the task report.

- [ ] **Step 6: Commit** `feat: Genie space over Hormuz reference gold tables` (with trailer).

---

### Task 6: README for plug-and-play replication

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README** covering, in this order, with no em or en dashes:
  1. One-paragraph pitch ("The Invisible Strait") and the visible-transits table (Jan 58.5, Feb 78.3, Mar 3.2, Sep 3.6 per day; source IMF PortWatch).
  2. Sources table (exactly 3; only aisstream needs a free key).
  3. Prerequisites: Databricks CLI >= 0.292 authenticated, serverless enabled with outbound internet, a SQL warehouse.
  4. Quickstart:
     ```bash
     databricks schemas create hormuz <catalog> --profile <p>
     databricks bundle deploy --var catalog=<catalog> --profile <p>
     databricks bundle run hormuz_reference --profile <p>
     uv run --no-project --with databricks-sdk python -m genie.build_space --profile <p> --catalog <catalog> --schema hormuz --warehouse-id <id>
     ```
  5. Turning on live AIS: sign up at aisstream.io, `databricks secrets create-scope hormuz`, `databricks secrets put-secret hormuz aisstream_api_key`, then `databricks bundle deploy --var ais_continuous=true` and `databricks bundle run hormuz_ais_live`. Cost note: a continuous serverless pipeline runs 24/7; stop it with `databricks pipelines stop <id>`.
  6. Table catalog (each table, one line).
  7. Caveats: PortWatch counts only AIS-visible vessels; aisstream relies on shore receivers and does not replay; OpenSky-style terms do not apply but check aisstream and PortWatch terms; conflict event dates are from public reporting and should be verified.
  8. Tests: the default test command and the PySpark 4 command.

- [ ] **Step 2: Commit** `docs: README for replication` (with trailer).
