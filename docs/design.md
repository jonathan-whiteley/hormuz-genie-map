# Hormuz Genie Map: Design

**Date:** 2026-10-07
**Status:** Approved in conversation (data foundation); app design is a follow-up spec.

## Purpose

A plug-and-play Databricks demo and blog: "The Invisible Strait." AIS-visible
transits through the Strait of Hormuz collapsed from ~78/day (Feb 2026) to ~3/day
(Sep 2026) while Middle East oil exports reportedly returned to near pre-war
levels. Geospatial analytics at scale (H3, spatial SQL) plus Genie as the
conversational UI explain the gap: dark transits, spoofing, and bypass ports.

## Hard constraints (from the user)

- At most 3 data sources, all free. One free API key is acceptable. No paid data.
- Lightweight acquisition; anyone can replicate with `databricks bundle deploy`
  plus one secret.
- Target workspace for our build: CLI profile `DEFAULT`
  (<your-workspace>), catalog `jdub_demo`, schema `hormuz`.
- Writing style: no em or en dashes in any prose, docs, or UI copy.

## Sources

| Source | Key | Use |
|---|---|---|
| IMF PortWatch (ArcGIS REST, `services9.arcgis.com/weJ1QsnbMYJlCHdG`) | none | Daily chokepoint transits (`Daily_Chokepoints_Data`), daily port calls and trade (`Daily_Ports_Data`), locations (`PortWatch_chokepoints_database`, `PortWatch_ports_database`) |
| aisstream.io websocket (`wss://stream.aisstream.io/v0/stream`) | free | Live ping-level AIS for the region (PositionReport, StandardClassBPositionReport, ShipStaticData) |
| Natural Earth `ne_50m_land.geojson` (GitHub raw, 1.6 MB) | none | Land polygons for "AIS position on land" spoofing detection |

## Architecture

One Declarative Automation Bundle, two pipelines:

1. `hormuz_reference` pipeline (triggered daily by job `hormuz_reference_daily`): PortWatch + land polygons, plus gold
   tables that need no AIS (chokepoint gap vs. baseline, bypass port surge).
2. `hormuz_ais_sampler` (hourly job): listens to aisstream.io for 5 minutes across
   target regions (Gulf/Hormuz, Red Sea) and busy control lanes (North Sea/Channel,
   Suez/East Med, Malacca/Singapore), appends to `bronze_ais_samples`, then refreshes
   the `hormuz_ais` pipeline: silver positions, `gold_ais_visibility`,
   `gold_ais_visibility_index` (target density vs. control mean), `gold_ais_h3_daily`.
   Revised 2026-10-08: a live probe returned 877 messages in 20 s for the North Sea
   but about 3 in 105 s for the whole Gulf and Red Sea, so a continuous stream would
   sit idle; the near-silence itself is the measurable story (an AIS visibility index).

Region bbox (lat_min, lon_min, lat_max, lon_max) = (12, 32, 31, 62): Persian Gulf,
Gulf of Oman, northern Arabian Sea, Red Sea (Yanbu, Bab el-Mandeb).

Pre-war baseline window: 2026-01-01 to 2026-02-27 (war began 2026-02-28).

## Out of scope for the data-foundation plan

Gold tables that need AIS pings (dark-gap pairing, on-land positions, STS
transfers), the deck.gl + Genie app. Those get their own plan once AIS data is
flowing and coverage in the Gulf is measured.

## App

The map app is specified in `docs/superpowers/specs/2026-10-09-hormuz-map-app-design.md`
and built in `app/` (AppKit). It deploys with the same bundle as the app resource
`resources/hormuz_app.app.yml` and queries the gold tables as the viewer. See the README
App section for deploy commands and permissions.
