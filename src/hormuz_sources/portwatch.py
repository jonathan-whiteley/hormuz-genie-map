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
