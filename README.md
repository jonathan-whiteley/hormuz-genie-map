# The Invisible Strait

AIS-visible ship transits through the Strait of Hormuz fell from about 78 a day in February 2026 to about 3 a day in September, while regional oil exports reportedly recovered. This repo is a plug-and-play Databricks demo that measures the gap: free public data, one Declarative Automation Bundle, and a Genie space to ask questions in plain English. It does not measure traffic. It measures what AIS can see, and how that changes over time and against busy control lanes.

Average daily transits through the Strait of Hormuz, 2026 (IMF PortWatch, AIS-visible vessels only):

| Jan | Feb | Mar | Sep |
|---|---|---|---|
| 58.5 | 78.3 | 3.2 | 3.6 |

## Sources

Exactly three, all free. Only aisstream.io needs a key.

| Source | Key | Use |
|---|---|---|
| IMF PortWatch (ArcGIS REST) | none | Daily chokepoint transits, daily port calls and trade |
| aisstream.io (websocket) | free | Live AIS samples, used to measure visibility |
| Natural Earth `ne_50m_land.geojson` | none | Land polygons |

## Prerequisites

- Databricks CLI 0.292 or later, authenticated (`databricks auth login --profile <p>`)
- Serverless compute enabled, with outbound internet access
- A SQL warehouse (for Genie)
- `uv` for the helper script and tests

## Quickstart

```bash
databricks schemas create hormuz <catalog> --profile <p>
databricks bundle deploy --var catalog=<catalog> --profile <p>
databricks bundle run hormuz_reference --profile <p>
uv run --no-project --with databricks-sdk python -m genie.build_space \
  --profile <p> --catalog <catalog> --schema hormuz --warehouse-id <id>
```

The first reference run is a full refresh and takes about 30 minutes, because PortWatch is fetched in yearly and per-country slices. After that, the `hormuz_reference_daily` job refreshes it at 07:00 UTC.

Bundle variables (`--var name=value`):

| Variable | Default | Meaning |
|---|---|---|
| `catalog` | `jdub_demo` | Unity Catalog catalog (set this to yours) |
| `schema` | `hormuz` | Schema (create it first) |
| `bbox` | `12,32,31,62` | lat_min,lon_min,lat_max,lon_max |
| `secret_scope` | `hormuz` | Secret scope holding the aisstream key |

## AIS visibility sampler

1. Sign up at [aisstream.io](https://aisstream.io) (GitHub login, free) and copy your API key.
2. Store it:
   ```bash
   databricks secrets create-scope hormuz --profile <p>
   databricks secrets put-secret hormuz aisstream_api_key --string-value "$(pbpaste)" --profile <p>
   ```
   `pbpaste` reads the macOS clipboard. In a terminal, `put-secret` without `--string-value` can also prompt for the value.
3. Run it: `databricks bundle run hormuz_ais_sampler --profile <p>`

The job listens for 5 minutes, appends raw rows, then refreshes the `hormuz_ais` pipeline. It is scheduled hourly at :05 UTC (job timeout 900 s).

**Why a visibility index.** A live probe on 2026-10-08 returned 877 aisstream messages in 20 seconds for the North Sea, but about 3 in 105 seconds across the Gulf and Red Sea together. A continuous stream would sit idle, so the near-silence itself became the measurement. Regions:

| Role | Regions |
|---|---|
| Targets | `gulf_hormuz`, `red_sea` |
| Controls | `north_sea_channel`, `suez_east_med`, `malacca_singapore` |

`gold_ais_visibility_index.visibility_vs_control` is the target lane's vessel density divided by the median control lane density, with per-control ratio columns alongside. In the first two hourly samples (2026-10-08) the Gulf heard 4 to 8 unique vessels, about 1 to 2 percent of the median control lane; the Red Sea heard 0; the North Sea heard 6,525 vessels in one 5-minute window. Two samples are a thin series; let it run for a few days before drawing conclusions.

**Cost.** Each run uses about 5 minutes of serverless compute plus a short pipeline refresh, every hour. Pause the schedule in the Jobs UI when you do not need it, or with `databricks jobs update` (set the schedule's `pause_status` to `PAUSED`).

## Tables

Schema `<catalog>.hormuz`.

**Reference pipeline (`hormuz_reference`)**

| Table | Description |
|---|---|
| `bronze_portwatch_chokepoints_daily` | Raw daily chokepoint transits from PortWatch |
| `bronze_portwatch_ports_daily` | Raw daily port calls and trade from PortWatch |
| `ref_portwatch_chokepoints` | Chokepoint locations and metadata |
| `ref_portwatch_ports` | Port locations and metadata (Yanbu appears as `Yanbu (Yanbu city)` and `Yanbu (King Fahd Port)`) |
| `ref_land_region` | Land polygons clipped to the bbox |
| `ref_conflict_events` | Curated conflict event dates for annotation |
| `gold_chokepoint_daily` | Chokepoint transits against the pre-war baseline |
| `gold_port_daily` | Port activity, including bypass-port changes |

**AIS pipeline (`hormuz_ais`)**

| Table | Description |
|---|---|
| `bronze_ais_samples` | Raw messages from the sampler job; the last row of each sample is a `_heartbeat` describing the window |
| `ref_ais_regions` | Target and control region definitions |
| `silver_ais_positions` | Parsed position reports per region |
| `gold_ais_visibility` | Per-sample, per-region counts, including `sample_ok` and `vessel_density` |
| `gold_ais_visibility_index` | `visibility_vs_control` and per-control ratios |
| `gold_ais_h3_daily` | Daily H3 cell aggregates; `unique_vessels` is per cell, so do not sum it across cells |

## Caveats

- PortWatch counts only AIS-visible vessels. A drop means fewer ships broadcasting and received, not necessarily fewer ships.
- aisstream relies on community shore receivers and does not replay history. Coverage differs by region, and a quiet window cannot be recovered later.
- Check the terms of aisstream.io and IMF PortWatch for your use, especially before republishing data.
- Conflict event dates come from public reporting. Verify them against primary sources before citing.

## Tests

```bash
uv run --no-project --with pytest --with websockets --with requests pytest -q
```
