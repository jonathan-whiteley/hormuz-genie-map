# Hormuz Map App: Design

**Date:** 2026-10-09
**Status:** Approved in conversation (sections 1 to 3); written spec pending user review.
**Builds on:** `docs/design.md` (data foundation, already deployed).

## 1. Purpose and audience

A Databricks App for a personal blog post and a plug-and-play customer demo. It answers one
customer question: **"How does the Strait of Hormuz disruption affect our supply lanes, and
where did traffic go?"** It shows Databricks geospatial work (H3, spatial SQL) with Genie as
the conversational interface over a map.

Success:
- A five-scene story that stands on its own in blog screenshots.
- A 20-second GIF moment: ask Genie a supply-chain question and the answer lands on the map.
- A reader can deploy it with the existing bundle plus two variables.

## 2. Decisions (confirmed with the user)

| # | Decision | Choice |
|---|---|---|
| 1 | Lead interaction | Story mode (5 scenes) plus free Explore mode; Genie available in every scene |
| 2 | Visual identity | Databricks-branded (Lava 600 #FF3621, Navy 900 #0B2026, Light #F9F7F4, DM Sans, real logo from brand-assets) |
| 3 | Backend | Databricks AppKit (TypeScript): `analytics()` named SQL files + `genie()` plugin |
| 4 | Map stack | React + Vite + MapLibre GL (free Carto basemaps, no token) + deck.gl overlay; no kepler.gl |
| 5 | Data loading | Load 2026 data once at startup; the time scrubber filters in the browser |
| 6 | Framing | Customer impact, centered on Hormuz and alternative routes; not editorial |
| 7 | Customer data | One lightweight synthetic table of six sample lanes; region ports only; no new ingestion |

## 3. Data additions (reference pipeline, no new sources)

### 3.1 `gold_port_daily` change
Add `portcalls_dry_bulk` (from the bronze table) so the fertilizer lane has a vessel-type series.

### 3.2 `ref_demo_lanes` (SQL materialized view from VALUES)
Synthetic lanes for a fictional company, "Northwind Supply Co.". Every value is an editable
assumption, and the table comment says so.

Columns: `lane_id STRING`, `lane STRING`, `commodity STRING`, `vessel_type STRING`
(`tanker` | `container` | `dry_bulk`), `primary_port STRING`, `chokepoint STRING`
(always `Strait of Hormuz`), `alternative_ports ARRAY<STRING>` (empty when none),
`alternative_route STRING` (plain-language note), `alt_exit STRING` (`arabian_sea` |
`red_sea` | `none`), `annual_volume DOUBLE`, `volume_unit STRING` (`tonnes` | `TEU`),
`destination STRING` (label only).

| lane_id | lane | vessel_type | primary_port | alternative_ports | alt_exit | annual_volume | unit |
|---|---|---|---|---|---|---|---|
| L1 | Crude feedstock | tanker | Juaymah | [Yanbu (King Fahd Port)] (East-West pipeline) | red_sea | 2000000 | tonnes |
| L2 | Jet fuel and diesel | tanker | Jabal Az Zannah-Ruways | [Fujairah] (Habshan-Fujairah pipeline) | arabian_sea | 800000 | tonnes |
| L3 | LNG | tanker | Ras Laffan | [] (no bypass) | none | 1500000 | tonnes |
| L4 | Consumer goods and packaging | container | Jebel Ali | [Khor Fakkan, Port of Sohar, Salalah] | arabian_sea | 40000 | TEU |
| L5 | Containers to the Saudi east coast | container | Dammam | [Jeddah] (Red Sea land bridge) | red_sea | 15000 | TEU |
| L6 | Fertilizer (urea) | dry_bulk | Jubail | [] (no bypass) | none | 500000 | tonnes |

All port names are verified against `gold_port_daily` (2026-10-09).

### 3.3 `gold_lane_status` (SQL materialized view)
One row per lane per date in 2026, using 7-day averages for the lane's vessel type:
- `hormuz_pct`: Hormuz transits for the vessel type vs. pre-war baseline (container lanes use `n_container`, tanker `n_tanker`, dry bulk `n_dry_bulk`).
- `primary_pct`: primary port calls for the vessel type vs. that port's baseline.
- `alternative_pct`: summed alternative-port calls vs. summed alternative baselines (NULL when no alternatives).
- `status`:
  - `Normal` when `primary_pct >= 80`;
  - `Degraded` when `50 <= primary_pct < 80`;
  - `Shifted to alternative` when `primary_pct < 50` and `alternative_pct >= 100`;
  - `Disrupted` otherwise (`primary_pct < 50`, and no alternative or the alternative is below baseline).
  Thresholds are SQL constants at the top of the file.
- `volume_at_risk = annual_volume * GREATEST(0, 1 - primary_pct / 100)`, in the lane's unit (assumption, labeled).
- Coordinates for drawing: primary port lat/lon, Hormuz lat/lon (from `ref_portwatch_chokepoints`), alternative port lat/lon (array), and exit point: `arabian_sea` = (22.0, 61.0) (an assumed gateway), `red_sea` = Bab el-Mandeb chokepoint lat/lon.

Every count is AIS-visible only; the comment says so.

### 3.5 Decision layer: `gold_lane_recommendation` (optional, ai_decide)
`ai_decide` (Beta; enabled in DEFAULT on 2026-10-09) adds a calibrated recommendation per lane on
**weekly snapshot dates**: every Monday from 2026-02-02 plus the latest data date. That is about 37 dates × 6 lanes,
or about 220 calls per run. It follows the Jev cookbook (github.com/paramjeetn/jev-cookbook):
- SQL does all the numbers and dates;
- `ai_decide` only classifies a plain-language description;
- code composes the result.

**State** (prose, built in SQL from bands, never raw numbers or JSON):
- the lane and vessel type;
- the primary port band: "far below / well below / below / near / above / well above pre-war levels", plus a 14-day trend "falling / steady / rising";
- each alternative port's band, with "on a very small baseline" when the baseline is under 1 call per day;
- the Hormuz band for the vessel type;
- the latest conflict event on or before the date;
- the Gulf AIS visibility band ("very low / low / moderate / not measured").

**Questions** (constant JSON, one call per row):
- `situation`, a choice: acute_closure, sustained_closure, partial_recovery, normal, none_fit.
- `action`, a choice: hold, shift, buffer, escalate, none_fit.
- `shift_target`, a speculative choice: Yanbu (King Fahd Port), Fujairah, Khor Fakkan, Port of Sohar, Salalah, Jeddah, not_applicable.
- `signal_quality`, a score: clear and consistent; mixed with caveats; thin or contradictory.

**Composition in SQL** (the cookbook's patterns 2, 3, 4, 6, 8). The tier is decided by the first rule that applies:
1. *Novel situation* when `action` = none_fit or the top action probability is below 0.40.
2. *Analyst* when `signal_quality.score >= 1.5`.
3. *Recommended* when `action.confidence >= 0.90`.
4. *Review* when the confidence is 0.60 or more.
5. Otherwise *Analyst*.

These are untuned demo thresholds (the cookbook's starting point) and are labeled so in the app and README.

**Output columns:** date, lane_id, state_text, action, action_probabilities, action_confidence, shift_target, situation, signal_quality_score, tier, and the raw ai_decide VARIANT.

**State tracking:** every snapshot is classified independently, so the app can plot the tier and P(action) weekly.

**Optional and lightweight:** it runs in a separate small pipeline `hormuz_decisions` on its own **weekly**
job `hormuz_decisions_weekly` (Mondays 08:00 UTC, using `schedule_pause_status`), so a workspace without
ai_decide only fails that job. The app treats a
missing table as "feature off" and hides recommendation UI (no error banner for this query).
Cost: about 220 calls per weekly run, billed at Databricks SQL rates.

### 3.4 Genie space update
Add `ref_demo_lanes`, `gold_lane_status`, `gold_ais_visibility_index`, `ref_ais_regions` to the
existing Hormuz Chokepoint Monitor space (`genie/space_config.py`). Add instructions:
- lanes are synthetic examples;
- volume at risk is an assumption;
- answers about places return `lat`/`lon` or `h3_res7`/`h3_res5`;
- answers about lanes return `lane_id`.

Add example SQL for the four suggested lane questions (section 5.4).

## 4. App architecture

Location: `app/` in the same repo. Bundle resource `resources/hormuz_app.app.yml`, app name
`hormuz-map` (fixed; never derived from a variable, so redeploys cannot force-replace it).

**Server (AppKit):** `server({ staticPath })`, `analytics({})` over `app/config/queries/*.sql`, and
`genie({ spaces: { default: <genie_space_id> } })`. No LLM serving endpoint.
- **Auth:** `user_api_scopes: [sql, dashboards.genie]` (on behalf of the viewer). If AppKit's Genie plugin calls as the app service principal instead, the deploy step grants the SP `CAN_RUN` on the space and `SELECT` on the schema, and the README says so.
- **New bundle variables:** `warehouse_id` (required) and `genie_space_id` (required).

**Named queries** (`app/config/queries/`). Each takes catalog and schema as `IDENTIFIER` parameters and is limited to `date >= '2026-01-01'`:
- `chokepoints_daily`: Hormuz, Bab el-Mandeb, Suez, Cape of Good Hope only, with lat/lon, counts by vessel type, 7-day averages, pct of baseline.
- `ports_daily`: region ports, with lat/lon, port calls by vessel type, 7-day averages, pct of baseline.
- `lane_status`: all of `gold_lane_status`.
- `conflict_events`: `ref_conflict_events`.
- `ais_visibility`: the `gold_ais_visibility_index` series plus `ref_ais_regions` boxes.
- `ais_h3_daily`: `gold_ais_h3_daily`.
- `freshness`: max PortWatch date and latest AIS `sample_hour`.

**Client (React + Vite + TypeScript):** MapLibre GL with Carto Positron (light) basemap and a deck.gl
`MapboxOverlay`. Layers:
- chokepoints: `ScatterplotLayer`, size = 7-day transits, color = pct of baseline on a Lava to Navy ramp;
- ports: `ScatterplotLayer`, same encoding, by the selected vessel type;
- lanes: `PathLayer`, primary path and alternative paths, colored by status;
- AIS visibility: `H3HexagonLayer` (res 5) and `PolygonLayer` region boxes labeled with `visibility_vs_control`;
- Genie answer layers (section 6).

State: the selected date, the scene, layer toggles, the vessel-type filter, and the Genie layers.
All 2026 data loads once at startup; the scrubber filters in memory.

## 5. Layout and story

### 5.1 Layout (desktop first, 1440 px design width)
- **Top bar:** Databricks logo, title "The Invisible Strait: Hormuz supply lane monitor", tabs Story | Explore | Architecture, the five-step scene stepper (Story tab only), and a freshness badge.
- **Left rail:**
  - layer toggles and the vessel-type filter;
  - KPI cards for the selected date: Hormuz transits (7-day avg, and pct of baseline), lanes disrupted (count of 6), volume at risk (tonnes and TEU shown separately), Gulf AIS visibility index.
- **Center:** the map, with the scene card overlaid (title, 2 to 3 templated sentences, Back / Next).
- **Bottom:** the time scrubber from 2026-01-01 to the latest date, with clickable event ticks from `ref_conflict_events`.
- **Right rail:** the Genie panel, showing scene-specific suggested questions and answer cards.

### 5.2 Scenes

| # | Title | Date | Camera | Layers |
|---|---|---|---|---|
| 1 | Your exposure | 2026-02-15 | Gulf + Gulf of Oman | lanes, chokepoints, ports |
| 2 | The strait closes | 2026-03-08 | Hormuz close-up | lanes, Hormuz, primary ports |
| 3 | Where traffic went | latest date | Gulf of Oman + Arabian Sea + Red Sea | alternative ports, lanes |
| 4 | Lanes with no way around | latest date | Gulf | L3 and L6 highlighted, primary ports |
| 5 | What you cannot see | latest AIS sample | all 5 sampling regions | AIS hexes, region boxes, Yanbu marker |

**Recommendation UI** (only when `gold_lane_recommendation` loads):
- Scene 3 and 4 cards, and the lane tooltips, show a chip with the tier, the action, and a small bar of action probabilities. The chip notes "untuned demo thresholds".
- Selecting a lane in the left rail shows a sparkline of P(top action) since January, with tier color bands, linked to the scrubber.
- Named query `lane_recommendation` (optional).

**Copy rule:** scene text is a template, and every number comes from the loaded data at runtime.
- Example: "Hormuz carried {n} visible container transits a day, {pct}% of the pre-war baseline."
- If a claim's condition is false on the data, the template takes its alternate wording. For example, scene 3 says "no alternative port is above baseline yet" when that is true.
- Event lines link to their `source_url`.
- Wherever AIS counts appear, the text says they measure visibility, not traffic.

### 5.3 Architecture tab
A third top-bar tab: **Story | Explore | Architecture**. It is ported from the GEOlogic app's
`ArchitecturePage.tsx` (React Flow `@xyflow/react` canvas, `html-to-image` export, `lucide-react`
icons): draggable nodes, Zoom In / Zoom Out / Fit / PNG / SVG controls, and a layer legend
along the bottom. It is reskinned with the Databricks tokens.

Header: "ARCHITECTURE / System Architecture / From public shipping signals to a map you can
question, all governed by Unity Catalog. Drag nodes, scroll to zoom, export to PNG or SVG."

It is focused on sources and Databricks products, with six numbered columns read left to
right as the talk track. Each node has a title and a one-line subtitle.

| # | Column | Nodes (title: subtitle) |
|---|---|---|
| 1 | Sources | IMF PortWatch: daily chokepoint and port activity (REST) · aisstream.io: live AIS positions (websocket, free key) · Natural Earth: land polygons · Demo lanes: synthetic supply lanes (editable) |
| 2 | Ingest | Lakeflow Jobs: hourly 5-minute AIS sampler, daily refresh · Lakeflow SDP (Python): PortWatch and Natural Earth pulls |
| 3 | Process | Lakeflow SDP: bronze, silver, gold materialized views · Spatial SQL: H3 res 5 and 7, ST functions |
| 4 | Govern | Unity Catalog: Delta tables, lineage, on-behalf-of-user access |
| 5 | Intelligence | AI/BI Genie: Hormuz Chokepoint Monitor space · Databricks SQL: serverless warehouse · AI Functions: ai_decide lane recommendations |
| 6 | Serve | Databricks App: AppKit + React + deck.gl map |

Edges, labeled where useful:
- Sources to Ingest: "REST, daily" (PortWatch, Natural Earth) and "websocket, 5 min each hour" (aisstream).
- Demo lanes go directly to Process.
- Ingest to Process.
- Process to Unity Catalog.
- Unity Catalog to Genie and to Databricks SQL.
- Genie and Databricks SQL to the App, labeled "answers" and "map queries".

Clicking a node opens a small detail popover with the real resource names, for example
`hormuz_reference`, `hormuz_ais_sampler`, `gold_lane_status`, and the Genie space title. It also
shows one talk-track sentence. The legend colors each Databricks product (Lakeflow Jobs,
Lakeflow SDP, Spatial SQL, Unity Catalog, Genie, Databricks SQL, Databricks App) plus Sources
in neutral gray, using a palette derived from the Databricks tokens. Only the real logo appears
in the top bar.

### 5.4 Suggested Genie questions (rotated by scene)
1. Which of our lanes are disrupted today, and how much volume is at risk?
2. Which alternative ports are running above their pre-war baseline?
3. When did our container lane shift away from Jebel Ali?
4. Which lanes have no alternative route?
5. How do visible tanker transits through Hormuz compare with the pre-war baseline by month?
6. How much of the Gulf can we see on AIS compared with normal shipping lanes?

## 6. Genie answers on the map

The client inspects the result columns, in this order:
1. A column named `h3`, `*_h3`, or `h3_res*` (BIGINT or hex string): an `H3HexagonLayer`, colored by the first numeric column.
2. `lat` + `lon` (or `latitude` + `longitude`): a `ScatterplotLayer`, sized by the first numeric column.
3. `lane_id`: highlights the matching lanes.
4. Otherwise: table only.

Each answer card shows Genie's text, the SQL (collapsed), a table, and an On map / Off toggle.
The layer is named after the question.
- At most 5 Genie layers at once, with "Clear all".
- At most 5,000 rendered rows, with "showing N of M".
- Clicking a port or chokepoint pre-fills "How has {name} changed since the war began?".

## 7. Error handling

- **Startup query fails** (missing table or no SELECT): a banner naming the query and table and the grant needed. The rest of the app still renders whatever loaded.
- **Genie error or timeout:** one silent retry, then an inline message on the card. Text-only answers render as text.
- **No value for a date or port:** the KPI shows "no data", never 0.
- **No AIS samples:** scene 5 shows "No AIS samples yet" and how to enable `hormuz_ais_sampler`.
- **Freshness badge:** shows the latest PortWatch date and AIS sample time. It turns amber when PortWatch is more than 7 days old or the last AIS sample is more than 3 hours old.

## 8. Testing

- **Unit (vitest):**
  - Genie result → layer type detection (each rule and the fallback);
  - KPI and status helpers;
  - scene copy templating (no `NaN`, `undefined`, or em/en dashes; alternate wording when a condition is false);
  - date filtering.
- **SQL (warehouse checks in the plan):**
  - `gold_lane_status` has 6 lanes for every 2026 date;
  - on 2026-02-15 every lane is `Normal` or `Degraded`;
  - on the latest date L3 and L6 are `Disrupted`;
  - L4's status matches its `primary_pct` and `alternative_pct`.
- **End to end:**
  - run locally against DEFAULT;
  - Chrome DevTools screenshots of all 5 scenes, of one Genie answer rendered as a map layer, and of the Architecture tab (Fit view, PNG export downloads);
  - no console errors.
- **Deploy:**
  - follow the saved Apps gotchas (fixed app name, `apps update` resources before deploy if needed, Genie space ACL);
  - confirm the live app URL loads and one Genie question renders.

## 9. Constraints

- Sources stay at three (PortWatch, aisstream.io, Natural Earth); the lanes are synthetic.
- No em or en dashes in UI copy, comments, or docs.
- The real Databricks logo comes from the brand-assets skill; never a placeholder.
- Bundle deploys for the author always pass `--var catalog=jdub_demo --var schedule_pause_status=UNPAUSED` plus the new app variables.

## 10. Out of scope

- Real customer data upload.
- Ports outside the Gulf and Red Sea region.
- Cape of Good Hope rerouting analysis and a second baseline.
- Dark-vessel detection.
- Mobile layout.
- An LLM next-best-action panel.
