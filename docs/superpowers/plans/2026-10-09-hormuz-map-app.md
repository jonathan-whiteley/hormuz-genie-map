# Hormuz Map App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy `hormuz-map`, a Databricks-branded AppKit app. It has a five-scene customer-impact story, an Explore mode, a Genie panel whose answers land on a deck.gl map, and an Architecture tab, all on the existing `jdub_demo.hormuz` tables plus a synthetic lanes table.

**Architecture:**
- **Data:** a small addition to the reference pipeline (`ref_demo_lanes`, `gold_lane_status`, plus vessel-type columns).
- **Genie:** the existing Genie space, extended.
- **App:** a new `app/` AppKit project:
  - Express server with `analytics()` over `.obo.sql` named queries (run as the viewer), `genie()` (runs as the viewer), and one config route;
  - React + Vite client with MapLibre GL + deck.gl.
- **Load and filter:** all 2026 data loads once at startup; a time scrubber filters in memory.
- **Deploy:** the app is scaffolded with `databricks apps init` (standard AppKit template) and deployed as an app resource in the existing bundle with `source_code_path: ../app`; the Apps container installs from a public lockfile and builds, which is the standard flow.

**Tech Stack:** Databricks AppKit at the version `databricks apps init` pins (`@databricks/appkit`, `@databricks/appkit-ui`), React 19, Vite, TypeScript, maplibre-gl 4, deck.gl 9 (`@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/geo-layers`, `@deck.gl/mapbox`), `@xyflow/react` 12, `html-to-image`, `lucide-react`, vitest; Lakeflow SDP SQL; Databricks CLI bundles.

**Spec:** `docs/superpowers/specs/2026-10-09-hormuz-map-app-design.md` (read it first; it is the authority).

## Status and handoff (Part 1 complete, 2026-10-13)

**Branch:** `feat/map-app` (local only; never pushed). `main` is public on GitHub (`jonathan-whiteley/hormuz-genie-map`). Push with the personal gh account, never the EMU one, and only after the final review.

**How to resume:** use `superpowers:subagent-driven-development` on this plan. The ledger is `.superpowers/sdd/2026-10-09-hormuz-map-app/progress.md` (git-ignored, local). Every completed task has a `Task N: complete` line there. Task reports and briefs sit next to it (`task-N-report.md`), and the Task 3, 4 and 5 reports record the confirmed AppKit API shapes and the Dataset contract. Resume at **Task 6**.

### Done (reviewed)
| Task | Commits | Outcome |
|---|---|---|
| 1 Lane data | 751fb74 | `ref_demo_lanes` (6 synthetic lanes), `gold_lane_status`, vessel-type columns on the gold tables |
| 2 Genie space | 2d32f52, c09b2bf | Lanes and AIS tables plus the 6 spec questions; low-baseline guidance (Q2 uses 7-day averages and a `low_baseline` flag) |
| 3 Scaffold | 72a36a0 | Standard `databricks apps init --features analytics,genie`; AppKit **0.76.1** (init-pinned, never override); `apps validate` passes |
| 10 ai_decide | 3cb2477, 4cec376 | `gold_lane_recommendation`: weekly snapshots (Mondays from 2026-02-02 plus the latest date, 216 rows), pipeline `hormuz_decisions`, job `hormuz_decisions_weekly`; low-baseline wording fix |
| 4 Data layer | 7441151, 34a619f | 9 `.obo.sql` queries; `loadAll` + `DataContext` (`useAnalyticsQuery` per query, assembled once); `kpi.ts`; freshness badge; error banner |
| 5 Explore map | b21bd3a, 957f833 | MapLibre 6.13 + deck.gl 9.4 layers, scrubber, compact left rail (2x2 KPIs, lane RecChip + Sparkline above the fold), map legend ("routes are schematic"), Genie toggle disabled until Task 7 |

### Rulings that bind the remaining tasks
- **AppKit 0.76.1 APIs:** there is no non-hook query API, so data loads through `useAnalyticsQuery` in `DataContext`. Use `npx @databricks/appkit docs` for APIs, and never add custom endpoints that run SELECTs.
- **Ports:** `ports_daily` is split into 3 fixed-range chunks (5 MB AppKit result cap). `PortDay` carries 7-day averages, baselines, and computed pct (null when the baseline is 0). Index ports once; never scan the 22.8k rows per render.
- **Low-baseline rule:** a baseline under 1 call per day means the percent is unreliable. Show the 7-day calls and the baseline with "small baseline, percent unreliable", color the port gray, and never headline it. Scene 3 copy uses lane-level `alternative_pct` and skips low-baseline ports when naming ports.
- **Decision layer:** tiers are Novel / Analyst / Recommended / Review, with untuned demo thresholds (0.90 / 0.60, signal_quality 1.5, none_fit or top probability below 0.40). Most rows are Analyst or Review; one is Recommended. If recommendations fail to load, the UI hides itself (no banner). The `ai_query` escalation idea was declined by the user.
- **Dates:** PortWatch data ends 2026-10-02; AIS samples run to the present. Explore's default date and scrubber end are the overall latest day, with a "PortWatch latest" chip. Story scenes pin their own dates (scene table in Task 6). KPI notes disclose the actual data date used.
- **Volume at risk** counts any primary-port shortfall, including Normal lanes; the card names the contributing lanes.
- **Public repo:** no real warehouse id, Genie space id, job or pipeline ids, or workspace URL in tracked files. Real values live in the git-ignored `app/.env` and on the CLI. Search tracked files before every commit.
- **CLI:** every bundle command passes `--var="catalog=jdub_demo" --var="schedule_pause_status=UNPAUSED"`. Task 9 adds `--var="warehouse_id=<warehouse-id>" --var="genie_space_id=<genie-space-id>"`. Use the quoted `--var="k=v"` form (zsh does not word-split a variable). Run `bundle plan` before every deploy and STOP on any delete or recreate. Never full-refresh `hormuz_reference`.
- **npm:** only the internal proxy in `~/.npmrc` works from the session sandbox. Use `NODE_OPTIONS=--max-old-space-size=8192`, and never request unsandboxed network. The committed `app/package-lock.json` must contain only `registry.npmjs.org` URLs; check before committing.
- **Git hook false positive:** a command containing "commit" plus a `-n` flag elsewhere (for example `grep -n`) is blocked as a hook bypass. Split the command.
- **Screenshots:** the Chrome DevTools MCP profile is often busy; headless Chrome over CDP works.

### Carry into Task 9
- Add `sql` to `user_api_scopes`; the generated scaffold has only `dashboards.genie`.
- Set `HORMUZ_CATALOG`, `HORMUZ_SCHEMA`, `GENIE_SPACE_TITLE` (and the Genie space id) through the app resource `config.env`.
- Deploy from source (`source_code_path: ../app`); the Apps container installs from the public lockfile. There is no `app/deploy` folder or build script.

### Remaining
1. **Task 6:** Story mode, the 5 data-driven scenes, with the Step 3b RecChips.
2. **Task 7:** Genie panel, with answers rendered on the map.
3. **Task 8:** Architecture tab (port from `~/Desktop/Projects/geologic/app/frontend/src/pages/ArchitecturePage.tsx`), with the Step 4b ai_decide node.
4. **Task 9:** Deploy via the bundle, live verification, README.
5. **Final whole-branch review,** then merge to `main`, push, and confirm no real ids.

### Deferred minors (triage at the final review; details in the ledger)
- From Task 1 to Task 4: template leftovers (`server/example.test.ts`, README, webmanifest colors); an empty Genie space id fails silently; a hardcoded L4 in the Genie Q3 example; a misspelled alternative port drops silently from sums; "not measured" AIS visibility on PortWatch-era dates.
- From Task 5: a 2.5 MB bundle; Lava used for ports, lanes and AIS (over the 10% guideline at the latest date); tooltip not clamped; confirm the Carto basemap is allowed by Apps CSP and egress in Task 9.

---

## Global Constraints

- **Workspace and catalog:**
  - Profile `DEFAULT`, catalog `jdub_demo`, schema `hormuz`, warehouse `<warehouse-id>`.
  - Genie space `<genie-space-id>` (title "Hormuz Chokepoint Monitor").
- **Every bundle command passes** `--var="catalog=jdub_demo" --var="schedule_pause_status=UNPAUSED" --var="warehouse_id=<warehouse-id>" --var="genie_space_id=<genie-space-id>"` (the last two exist from Task 9). Use the `--var="k=v"` form; zsh does not word-split a variable holding several flags.
- **Before any `bundle deploy`:** run `bundle plan` and STOP if any pipeline, job, or app shows delete or recreate.
- **Never full-refresh** `hormuz_reference`. Use a selective refresh (`--refresh <tables>`) for changed tables only.
- **App name** is the literal `hormuz-map` (never a variable).
- **Visual identity:**
  - Lava 600 `#FF3621`, Navy 900 `#0B2026`, Light `#F9F7F4`, DM Sans.
  - The real Databricks logo comes from the `databricks-impeccable:brand-assets` skill; never a placeholder.
- **No em or en dashes** in UI copy, comments, SQL comments, or docs.
- **Commits** end with `Co-authored-by: Isaac <no-reply@databricks.com>`. Push only when the controller says so.
- **Local test commands:**
  - Python: `cd ~/Desktop/Projects/hormuz-genie-map && uv run --no-project --with pytest --with websockets --with requests pytest -q`
  - App: `cd ~/Desktop/Projects/hormuz-genie-map/app && npm test`
- **npm:** if `~/.npmrc` points at an internal proxy, the deploy lockfile must be rewritten to `https://registry.npmjs.org/` (Task 9).

## Review Focus

1. **Missing values:** a lane, port, or chokepoint with no value on the selected date must render "no data", never 0 or NaN. Pinned in Task 4 `kpi.test.ts` and Task 6 `copy.test.ts`.
2. **Unexpected Genie columns:** BIGINT H3 ids as decimal strings, hex strings, `latitude`/`longitude`, mixed case, or numbers returned as strings must all map correctly, or fall back to a table. Pinned in Task 7 `genieLayer.test.ts`.
3. **Scrubber past the data:** a date after the last data day (ports end 2 days before chokepoints) must use the latest value on or before the date. Pinned in Task 4 `kpi.test.ts`.
4. **Startup query failures:** a failure, such as no SELECT for the viewer, must show a named banner while the rest of the app renders. Pinned in Task 4 `loadAll.test.ts`.
5. **Redeploys must not destroy the app:** verified in Task 9 Step 3 via `bundle plan`.

---

### Task 1: Lane data in the reference pipeline

**Files:**
- Modify: `src/pipelines/reference/gold_chokepoint_daily.sql`, `src/pipelines/reference/gold_port_daily.sql`
- Create: `src/pipelines/reference/ref_demo_lanes.sql`, `src/pipelines/reference/gold_lane_status.sql`

**Interfaces:**
- **Consumes:** existing bronze and ref tables.
- **Produces:**
  - New columns on `gold_chokepoint_daily`: `n_container_7d_avg`, `n_dry_bulk_7d_avg`, `baseline_container`, `baseline_dry_bulk`.
  - New columns on `gold_port_daily`: `portcalls_dry_bulk`, `portcalls_container_7d_avg`, `portcalls_dry_bulk_7d_avg`, `baseline_portcalls_container`, `baseline_portcalls_dry_bulk`, `pct_of_baseline_portcalls_container`, `pct_of_baseline_portcalls_dry_bulk`.
  - Tables `ref_demo_lanes` and `gold_lane_status`, with the columns below.

- [ ] **Step 1: Extend `gold_chokepoint_daily.sql`.**
  - In the `baseline` CTE, add `AVG(n_container) AS baseline_container, AVG(n_dry_bulk) AS baseline_dry_bulk`.
  - In the SELECT, add:
    ```sql
    AVG(d.n_container) OVER (PARTITION BY d.portid ORDER BY d.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS n_container_7d_avg,
    AVG(d.n_dry_bulk)  OVER (PARTITION BY d.portid ORDER BY d.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS n_dry_bulk_7d_avg,
    b.baseline_container, b.baseline_dry_bulk,
    ```
  - Keep every existing column unchanged.

- [ ] **Step 2: Extend `gold_port_daily.sql`.**
  - In `baseline`, add `AVG(portcalls_container) AS baseline_portcalls_container, AVG(portcalls_dry_bulk) AS baseline_portcalls_dry_bulk`.
  - In the SELECT, add `d.portcalls_dry_bulk`, the 7-day averages for `portcalls_container` and `portcalls_dry_bulk` (same window), the two baselines, and
    ```sql
    ROUND(100 * d.portcalls_container / NULLIF(b.baseline_portcalls_container, 0), 1) AS pct_of_baseline_portcalls_container,
    ROUND(100 * d.portcalls_dry_bulk  / NULLIF(b.baseline_portcalls_dry_bulk, 0), 1)  AS pct_of_baseline_portcalls_dry_bulk
    ```
  - Keep every existing column.

- [ ] **Step 3: Create `ref_demo_lanes.sql`:**
```sql
CREATE OR REFRESH MATERIALIZED VIEW ref_demo_lanes
COMMENT 'Synthetic example supply lanes for a fictional company (Northwind Supply Co.). Every value is an editable demo assumption, not real customer data. Primary routes use ports inside the Strait of Hormuz; alternatives use ports or pipelines outside it.'
AS SELECT lane_id, lane, commodity, vessel_type, primary_port, 'Strait of Hormuz' AS chokepoint,
          alternative_ports, alternative_route, alt_exit, CAST(annual_volume AS DOUBLE) AS annual_volume,
          volume_unit, destination
FROM VALUES
  ('L1', 'Crude feedstock', 'Crude oil', 'tanker', 'Juaymah', ARRAY('Yanbu (King Fahd Port)'), 'East-West pipeline to the Red Sea', 'red_sea', 2000000, 'tonnes', 'Asia refineries'),
  ('L2', 'Jet fuel and diesel', 'Refined products', 'tanker', 'Jabal Az Zannah-Ruways', ARRAY('Fujairah'), 'Habshan-Fujairah pipeline to the Gulf of Oman', 'arabian_sea', 800000, 'tonnes', 'Europe and East Africa'),
  ('L3', 'LNG', 'Liquefied natural gas', 'tanker', 'Ras Laffan', CAST(ARRAY() AS ARRAY<STRING>), 'No bypass route', 'none', 1500000, 'tonnes', 'Europe and Asia utilities'),
  ('L4', 'Consumer goods and packaging', 'Containerized goods', 'container', 'Jebel Ali', ARRAY('Khor Fakkan', 'Port of Sohar', 'Salalah'), 'Transship via Gulf of Oman and Arabian Sea ports', 'arabian_sea', 40000, 'TEU', 'Gulf retail distribution'),
  ('L5', 'Containers to the Saudi east coast', 'Containerized goods', 'container', 'Dammam', ARRAY('Jeddah'), 'Red Sea port plus land bridge', 'red_sea', 15000, 'TEU', 'Saudi Eastern Province'),
  ('L6', 'Fertilizer (urea)', 'Urea', 'dry_bulk', 'Jubail', CAST(ARRAY() AS ARRAY<STRING>), 'No bypass route', 'none', 500000, 'tonnes', 'South Asia and Americas agriculture')
AS t(lane_id, lane, commodity, vessel_type, primary_port, alternative_ports, alternative_route, alt_exit, annual_volume, volume_unit, destination);
```

- [ ] **Step 4: Create `gold_lane_status.sql`:**
```sql
CREATE OR REFRESH MATERIALIZED VIEW gold_lane_status
COMMENT 'Daily status of each demo lane (ref_demo_lanes) from AIS-visible PortWatch counts, using 7-day averages for the lane vessel type vs. the pre-war baseline. Status: Normal (primary >= 80 pct), Degraded (50 to 80), Shifted to alternative (primary < 50 and alternatives >= 100), Disrupted (otherwise). volume_at_risk is an assumption: annual volume times the primary port shortfall. Counts show visibility, not total traffic.'
AS
WITH params AS (SELECT 80.0 AS normal_pct, 50.0 AS disrupted_pct, 100.0 AS alt_ok_pct),
port_type AS (
  SELECT date, port, lat, lon, 'tanker' AS vessel_type, portcalls_tanker_7d_avg AS calls_7d, baseline_portcalls_tanker AS baseline FROM gold_port_daily
  UNION ALL
  SELECT date, port, lat, lon, 'container', portcalls_container_7d_avg, baseline_portcalls_container FROM gold_port_daily
  UNION ALL
  SELECT date, port, lat, lon, 'dry_bulk', portcalls_dry_bulk_7d_avg, baseline_portcalls_dry_bulk FROM gold_port_daily
),
hormuz AS (
  SELECT date, lat, lon, 'tanker' AS vessel_type, n_tanker_7d_avg AS calls_7d, baseline_tanker AS baseline FROM gold_chokepoint_daily WHERE chokepoint = 'Strait of Hormuz'
  UNION ALL
  SELECT date, lat, lon, 'container', n_container_7d_avg, baseline_container FROM gold_chokepoint_daily WHERE chokepoint = 'Strait of Hormuz'
  UNION ALL
  SELECT date, lat, lon, 'dry_bulk', n_dry_bulk_7d_avg, baseline_dry_bulk FROM gold_chokepoint_daily WHERE chokepoint = 'Strait of Hormuz'
),
bab AS (SELECT lat, lon FROM ref_portwatch_chokepoints WHERE portname = 'Bab el-Mandeb Strait'),
alt AS (
  SELECT l.lane_id, p.date,
         SUM(p.calls_7d) AS alt_calls, SUM(p.baseline) AS alt_baseline,
         collect_list(named_struct('port', p.port, 'lat', p.lat, 'lon', p.lon,
                                   'pct', ROUND(100 * p.calls_7d / NULLIF(p.baseline, 0), 1))) AS alt_ports
  FROM ref_demo_lanes l
  LATERAL VIEW explode(l.alternative_ports) e AS alt_port
  JOIN port_type p ON p.port = e.alt_port AND p.vessel_type = l.vessel_type
  GROUP BY l.lane_id, p.date
),
base AS (
  SELECT l.lane_id, l.lane, l.commodity, l.vessel_type, l.primary_port, l.alternative_ports,
         l.alternative_route, l.alt_exit, l.annual_volume, l.volume_unit, l.destination,
         pp.date, pp.lat AS primary_lat, pp.lon AS primary_lon,
         h.lat AS hormuz_lat, h.lon AS hormuz_lon,
         ROUND(100 * h.calls_7d / NULLIF(h.baseline, 0), 1) AS hormuz_pct,
         ROUND(100 * pp.calls_7d / NULLIF(pp.baseline, 0), 1) AS primary_pct,
         ROUND(100 * a.alt_calls / NULLIF(a.alt_baseline, 0), 1) AS alternative_pct,
         a.alt_ports
  FROM ref_demo_lanes l
  JOIN port_type pp ON pp.port = l.primary_port AND pp.vessel_type = l.vessel_type
  LEFT JOIN hormuz h ON h.vessel_type = l.vessel_type AND h.date = pp.date
  LEFT JOIN alt a ON a.lane_id = l.lane_id AND a.date = pp.date
  WHERE pp.date >= DATE'2026-01-01'
)
SELECT b.*,
  CASE
    WHEN b.primary_pct IS NULL THEN 'No data'
    WHEN b.primary_pct >= p.normal_pct THEN 'Normal'
    WHEN b.primary_pct >= p.disrupted_pct THEN 'Degraded'
    WHEN b.alternative_pct >= p.alt_ok_pct THEN 'Shifted to alternative'
    ELSE 'Disrupted'
  END AS status,
  CASE WHEN b.primary_pct IS NULL THEN NULL
       ELSE ROUND(b.annual_volume * GREATEST(0.0, 1 - b.primary_pct / 100), 0) END AS volume_at_risk,
  CASE b.alt_exit WHEN 'arabian_sea' THEN 22.0 WHEN 'red_sea' THEN bab.lat END AS exit_lat,
  CASE b.alt_exit WHEN 'arabian_sea' THEN 61.0 WHEN 'red_sea' THEN bab.lon END AS exit_lon
FROM base b CROSS JOIN params p CROSS JOIN bab;
```

- [ ] **Step 5: Validate, plan, deploy, and run a selective refresh.**
```bash
cd ~/Desktop/Projects/hormuz-genie-map
databricks bundle validate --var="catalog=jdub_demo" --var="schedule_pause_status=UNPAUSED" --profile DEFAULT
databricks bundle plan --var="catalog=jdub_demo" --var="schedule_pause_status=UNPAUSED" --profile DEFAULT
databricks bundle deploy --var="catalog=jdub_demo" --var="schedule_pause_status=UNPAUSED" --profile DEFAULT
databricks bundle run hormuz_reference --refresh gold_chokepoint_daily,gold_port_daily,ref_demo_lanes,gold_lane_status --var="catalog=jdub_demo" --var="schedule_pause_status=UNPAUSED" --profile DEFAULT
```
Before running, confirm the `--refresh` flag name with `databricks bundle run --help`; the pipelines skill calls this a selective refresh.

- [ ] **Step 6: Verify (warehouse).**
```bash
databricks experimental aitools tools query --profile DEFAULT -o csv "SELECT date, COUNT(*) n FROM jdub_demo.hormuz.gold_lane_status GROUP BY date HAVING COUNT(*) <> 6 LIMIT 5"
databricks experimental aitools tools query --profile DEFAULT -o csv "SELECT lane_id, status, primary_pct, alternative_pct, hormuz_pct FROM jdub_demo.hormuz.gold_lane_status WHERE date = DATE'2026-02-15' ORDER BY lane_id"
databricks experimental aitools tools query --profile DEFAULT -o csv "SELECT lane_id, status, primary_pct, alternative_pct, hormuz_pct, volume_at_risk, volume_unit FROM jdub_demo.hormuz.gold_lane_status WHERE date = (SELECT MAX(date) FROM jdub_demo.hormuz.gold_lane_status) ORDER BY lane_id"
```
Expected:
- The first query returns 0 rows (6 lanes per date).
- On 2026-02-15 no lane is `Disrupted`.
- On the latest date L3 and L6 are `Disrupted`.
- Record all actual rows in the report. If an expectation fails, report it; do not change the thresholds.

- [ ] **Step 7: Commit** `feat: demo lanes and lane status gold view`.

---

### Task 2: Extend the Genie space

**Files:**
- Modify: `genie/space_config.py`, `tests/test_genie_config.py`

**Interfaces:**
- **Consumes:** the Task 1 tables, `gold_ais_visibility_index`, `ref_ais_regions`.
- **Produces:** the updated space (same id), with the 6 suggested questions from spec section 5.4.

- [ ] **Step 1: Tests.** In `tests/test_genie_config.py`, assert:
  - `TABLES` includes `ref_demo_lanes`, `gold_lane_status`, `gold_ais_visibility_index`, `ref_ais_regions`;
  - `SAMPLE_QUESTIONS` equals the 6 questions in spec section 5.4, verbatim and in order;
  - `EXAMPLE_SQL` has at least 6 entries, every SQL is templated with backticked `{catalog}`.`{schema}`;
  - no dashes (the existing test).

  Run the Python test command: FAIL.
- [ ] **Step 2: Update `space_config.py`.**
  - Add the four tables.
  - Replace `SAMPLE_QUESTIONS` with the 6 spec questions.
  - Append to `INSTRUCTIONS`:
    ```
    - ref_demo_lanes and gold_lane_status describe a fictional company's example lanes (synthetic). Say so when answering. volume_at_risk is an assumption.
    - For questions about our lanes, use gold_lane_status at the latest date unless a date is given, and return lane_id, lane, status, primary_pct, alternative_pct, volume_at_risk, volume_unit.
    - For questions about places, return lat and lon (ports, chokepoints) or h3_res5 (AIS cells) so the app can map the answer.
    - gold_ais_visibility_index: visibility_vs_control compares a Gulf target region with the median busy control lane (1.0 = equally visible). It measures AIS visibility, not traffic.
    ```
  - Add example SQL entries for questions 1 to 4 and 6:
    - Q1: latest-date lane status with volume at risk.
    - Q2: alternative ports above baseline. Unnest `alternative_ports` from `ref_demo_lanes` joined to `gold_port_daily` at the latest date with the matching vessel-type pct column; return `lat`, `lon`.
    - Q3: first date `primary_pct` for L4 dropped below 50, and the status since.
    - Q4: lanes where `size(alternative_ports) = 0`.
    - Q6: the latest `visibility_vs_control` per target region.

  Use backticked `{catalog}`.`{schema}` and no dashes.
- [ ] **Step 3:** run the tests and see them pass.
- [ ] **Step 4:** `uv run --no-project python -m genie.build_space --profile DEFAULT --catalog jdub_demo --schema hormuz --warehouse-id <warehouse-id>` (update path). Then ask questions 1 and 2 through the Genie Conversation API (use the `databricks:databricks-genie-agents` skill). Expect COMPLETED with rows; Q2 returns lat and lon. Record the SQL and row counts.
- [ ] **Step 5: Commit** `feat: Genie space covers demo lanes and AIS visibility`.

---

### Task 3: App scaffold via `databricks apps init` (standard AppKit flow)

> Revised 2026-10-13: the hand-built scaffold was replaced by the standard `databricks apps manifest` + `databricks apps init` flow from the `databricks:databricks-apps` skill. AppKit versions are whatever init sets; never override them.

**Files:** everything `databricks apps init` generates under `app/`, plus:
- Create: the server changes for the Genie space map and `/api/app-config`, `app/config/queries/freshness.obo.sql`, `app/client/src/theme/tokens.css`, `app/client/src/shell/TopBar.tsx`, `app/client/src/assets/` (logo + DM Sans), `app/scripts/lockfile-public.sh`
- Modify: `app/client/src/App.tsx`, `app/tests/smoke.spec.ts`, `app/.gitignore`

**Interfaces:**
- **Produces** the same interfaces as before (later tasks depend on them):
  - `GET /api/app-config` returns `{ catalog, schema, genieSpaceTitle }` from the env vars `HORMUZ_CATALOG`, `HORMUZ_SCHEMA`, `GENIE_SPACE_TITLE`;
  - named analytics queries via `useAnalyticsQuery` (`.obo.sql` runs as the viewer);
  - Genie SSE at `/api/genie/default/messages`;
  - `App.tsx` with tabs `story | explore | architecture`;
  - `tokens.css` variables `--lava-600 #FF3621`, `--navy-900 #0B2026`, `--light #F9F7F4`, `--font-sans 'DM Sans'`.

- [ ] **Step 1: Set aside the hand-built attempt.** Move the existing untracked `app/` to `/tmp/hormuz-app-handbuilt/` (keep it only to reuse the logo SVG, DM Sans files, and tokens). Do not commit anything from it.
- [ ] **Step 2: Load skills.** Load `databricks:databricks-core`, `databricks:databricks-apps`, `databricks:databricks-app-design`, `databricks-impeccable:impeccable-guide`. Follow the databricks-apps skill exactly, including its Scaffolding Rules Protocol. The merged rules are:
  - **analytics, must:** before init, the warehouse is running.
  - **analytics, should:** after init, have at least one .sql file before typegen.
  - **genie, must:** after init, configure the `spaces` map.
  - **template, must:** treat init output as starter code; keep secrets in app.yaml, databricks.yml or .env only.
  - **template, never:** guess resources; embed secrets in the client bundle.
- [ ] **Step 3: Scaffold** from the repo root, with the real ids passed only on the command line:
```bash
databricks apps init --name hormuz-map --features analytics,genie \
  --set analytics.sql-warehouse.id=<warehouse-id> \
  --set genie.genie-space.id=<genie-space-id> \
  --set "genie.genie-space.name=Hormuz Chokepoint Monitor" \
  --description "The Invisible Strait: Hormuz supply lane monitor" \
  --run none --profile DEFAULT
mv hormuz-map app
```
  Record in the report: the generated files, the AppKit versions pinned in `package.json`, and the full generated `app.yaml` and `app/databricks.yml` (Task 9 merges the app resource into the root bundle). Delete `app/databricks.yml` after recording it; the root bundle deploys the app.
- [ ] **Step 4: No real ids in tracked files.** The repo is public. Replace any real warehouse id, Genie space id, or workspace URL in generated tracked files with env or resource references (`valueFrom` in `app.yaml`). Real values live only in the git-ignored `app/.env`. Before committing, search the tracked files to confirm the ids do not appear.
- [ ] **Step 5: Install.** `cd app && NODE_OPTIONS=--max-old-space-size=8192 npm install` through the default internal proxy. Do not change the AppKit versions. If the proxy lacks a pinned version, stop and report BLOCKED with the error. Never request unsandboxed network.
- [ ] **Step 6: Server.** Use `npx @databricks/appkit docs` (start with no args, pick from the index) for exact APIs.
  - Configure the genie plugin `spaces` map as `{ default: process.env.GENIE_SPACE_ID }`.
  - Add `GET /api/app-config` the way the skill's Custom Endpoints guide prescribes.
- [ ] **Step 7: Queries.** Add `config/queries/freshness.obo.sql`: max `gold_chokepoint_daily.date`, max `gold_port_daily.date`, and latest `gold_ais_visibility.sample_hour`, via `IDENTIFIER(:catalog || '.' || :schema || '.<table>')` with `-- @param catalog STRING = jdub_demo` and `-- @param schema STRING = hormuz`. Run `npm run typegen` and confirm every query shows ✓.
- [ ] **Step 8: Client shell.**
  - Copy the logo and DM Sans from `/tmp/hormuz-app-handbuilt/` (they came from brand-assets).
  - `TopBar` has the logo, the title "The Invisible Strait: Hormuz supply lane monitor", and tabs Story | Explore | Architecture; the active tab is underlined in Lava 600.
  - `App.tsx` fetches `/api/app-config` once into `AppConfigContext`.
  - Follow `databricks-app-design` for states (loading, empty, error).
- [ ] **Step 9: Tests.**
  - Update `tests/smoke.spec.ts` selectors to the new title and tabs (Playwright `getByRole` / `getByText` only).
  - Make sure `npm test` (unit tests) runs; add vitest if the template lacks it.
  - Run `databricks apps validate --profile DEFAULT` and get it passing.
- [ ] **Step 10: Local run.**
  - Run the template's dev command.
  - curl `/api/app-config` and run the freshness query through the analytics route.
  - Take a Chrome DevTools screenshot to `docs/img/scaffold.png`.
- [ ] **Step 11: Public lockfile.** `scripts/lockfile-public.sh` rewrites `resolved` URLs in `app/package-lock.json` from the internal proxy to `https://registry.npmjs.org/`, so readers and the Apps container can install. Run it; the lockfile that gets committed has only public URLs.
- [ ] **Step 12: Commit** `feat: hormuz-map scaffold via databricks apps init`.

---

### Task 4: Named queries, load-once data store, KPI helpers

**Files:**
- Create: `app/config/queries/chokepoints_daily.obo.sql`, `ports_daily.obo.sql`, `lane_status.obo.sql`, `conflict_events.obo.sql`, `ais_visibility.obo.sql`, `ais_regions.obo.sql`, `ais_h3_daily.obo.sql`
- Create: `app/client/src/data/types.ts`, `app/client/src/data/loadAll.ts`, `app/client/src/data/DataContext.tsx`, `app/client/src/data/kpi.ts`, `app/client/src/shell/ErrorBanner.tsx`, `app/client/src/shell/FreshnessBadge.tsx`
- Test: `app/client/src/data/__tests__/kpi.test.ts`, `app/client/src/data/__tests__/loadAll.test.ts`

**Interfaces:**
- **Produces:**
  - Types in `types.ts`:
    - `VesselType = 'tanker' | 'container' | 'dry_bulk'`.
    - `ChokepointDay { date: string; chokepoint: string; lat: number; lon: number; n_total: number|null; n_tanker: number|null; n_container: number|null; n_dry_bulk: number|null; n_total_7d_avg: number|null; n_tanker_7d_avg: number|null; n_container_7d_avg: number|null; n_dry_bulk_7d_avg: number|null; pct_of_baseline_total: number|null; pct_of_baseline_tanker: number|null; pct_of_baseline_container: number|null; pct_of_baseline_dry_bulk: number|null }`.
    - `PortDay { date; port; country; lat; lon; portcalls; portcalls_tanker; portcalls_container; portcalls_dry_bulk; portcalls_tanker_7d_avg; portcalls_container_7d_avg; portcalls_dry_bulk_7d_avg; pct_of_baseline_portcalls_tanker; pct_of_baseline_portcalls_container; pct_of_baseline_portcalls_dry_bulk }` (numbers nullable).
    - `LaneDay { date; lane_id; lane; commodity; vessel_type: VesselType; primary_port; alternative_ports: string[]; alternative_route; alt_exit; annual_volume: number; volume_unit: 'tonnes'|'TEU'; primary_lat; primary_lon; hormuz_lat; hormuz_lon; exit_lat: number|null; exit_lon: number|null; alt_ports: {port: string; lat: number; lon: number; pct: number|null}[]; hormuz_pct; primary_pct; alternative_pct; status: 'Normal'|'Degraded'|'Shifted to alternative'|'Disrupted'|'No data'; volume_at_risk: number|null }`.
    - `ConflictEvent { event_date; event; source_url }`.
    - `VisibilityPoint { sample_id; sample_hour; region; label; unique_vessels; vessels_per_10k_km2; visibility_vs_control: number|null; vs_north_sea_channel; vs_suez_east_med; vs_malacca_singapore }`.
    - `Region { region; role; label; lat_min; lon_min; lat_max; lon_max; area_km2 }`.
    - `AisCell { region; day; h3_res5_str: string; unique_vessels: number; positions: number }`.
    - `Freshness { portwatch_chokepoints_max; portwatch_ports_max; ais_latest_sample }`.
    - `Dataset { chokepoints: ChokepointDay[]; ports: PortDay[]; lanes: LaneDay[]; events: ConflictEvent[]; visibility: VisibilityPoint[]; regions: Region[]; aisCells: AisCell[]; freshness: Freshness|null; errors: {query: string; message: string}[] }`.
  - `loadAll(runQuery: (name: string, params: Record<string, unknown>) => Promise<unknown[]>, cfg: {catalog: string; schema: string}) => Promise<Dataset>`. It runs all 8 queries in parallel. A failed query leaves its array empty and appends to `errors`. Numeric fields arriving as strings are converted to numbers; empty strings become null. `alternative_ports` and `alt_ports` arrive as JSON strings or arrays and are parsed.
  - `kpi.ts`:
    - `latestOnOrBefore<T extends {date: string}>(rows: T[], date: string): T | undefined`;
    - `fmtNum(v: number|null|undefined, digits?: number): string` (returns `'no data'` for null, undefined, or NaN);
    - `fmtPct(v): string` (`'no data'`, or e.g. `'12%'`);
    - `hormuzOn(chokepoints, date, vessel: VesselType | 'total') => {transits7d: number|null; pctBaseline: number|null}`;
    - `lanesOn(lanes, date) => LaneDay[]` (the latest row on or before the date, per lane);
    - `disruptedCount(lanes: LaneDay[]): number`;
    - `volumeAtRisk(lanes: LaneDay[]) => {tonnes: number; teu: number}`;
    - `gulfVisibility(points: VisibilityPoint[], date: string) => number|null` (the gulf_hormuz `visibility_vs_control` of the latest sample on or before the end of that date).

- [ ] **Step 1: Write the queries.** Each one uses `-- @param catalog STRING = jdub_demo` and `-- @param schema STRING = hormuz`, `IDENTIFIER(:catalog || '.' || :schema || '.<table>')`, and `WHERE date >= DATE'2026-01-01'` where the table has a date. Select exactly the type fields above.
  - `chokepoints_daily`: `gold_chokepoint_daily` filtered to `chokepoint IN ('Strait of Hormuz','Bab el-Mandeb Strait','Suez Canal','Cape of Good Hope')`. It computes `pct_of_baseline_container = ROUND(100 * n_container_7d_avg / NULLIF(baseline_container,0),1)` and the same for dry bulk.
  - `ports_daily`: all of `gold_port_daily`.
  - `lane_status`: all of `gold_lane_status`, with `to_json(alt_ports) AS alt_ports` and `to_json(alternative_ports) AS alternative_ports`.
  - `conflict_events`, `ais_regions`: all rows.
  - `ais_visibility`: `gold_ais_visibility_index`.
  - `ais_h3_daily`: `gold_ais_h3_daily` (columns region, day, h3_res5_str, unique_vessels, positions).
- [ ] **Step 2: Tests.** `kpi.test.ts` covers:
  - `latestOnOrBefore` picks the exact date, picks the previous date when the exact one is missing (scrubber past the data), and returns undefined before the first row;
  - `fmtNum` and `fmtPct` give `'no data'` for null, undefined and NaN;
  - `lanesOn` returns one row per lane;
  - `disruptedCount` counts only `'Disrupted'`;
  - `volumeAtRisk` sums by unit and ignores nulls;
  - `gulfVisibility` returns null with no samples.

  `loadAll.test.ts` uses a fake `runQuery` where one query rejects. It checks that the others load, `errors` has one named entry, numeric strings become numbers, and the JSON arrays are parsed.

  Run `npm test`: FAIL.
- [ ] **Step 3: Implement** `types.ts`, `kpi.ts` and `loadAll.ts` until the tests pass.
- [ ] **Step 4: Wire the context.**
  - `DataContext.tsx` calls `loadAll` once after `/api/app-config` resolves, using the AppKit analytics client (the same mechanism you recorded in Task 3, Step 8), and exposes `{dataset, loading}`.
  - `ErrorBanner` lists `dataset.errors` as "Could not load <query>: <message>. Check SELECT on <catalog>.<schema> for your user."
  - `FreshnessBadge` shows "PortWatch through <date> · AIS sampled <relative time>". It turns amber when PortWatch is more than 7 days old or the AIS sample is more than 3 hours old. Use the middle dot as a separator, never a dash.
- [ ] **Step 5: Local check.** Run the app; the browser console shows the row counts for all 8 queries (temporary log, removed before commit), and there are no errors.
- [ ] **Step 6: Commit** `feat: load-once dataset, KPI helpers, freshness and error banner`.

- [ ] **Step 5b: Decision layer addendum (consumes Task 10).**
  - Add `app/config/queries/lane_recommendation.obo.sql`:
    `SELECT date, lane_id, action, to_json(action_probabilities) AS action_probabilities, action_confidence, shift_target, situation, signal_quality_score, tier FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_lane_recommendation') WHERE date >= DATE'2026-01-01'`.
  - Add the type `LaneRec { date; lane_id; action: string; action_probabilities: Record<string, number>; action_confidence: number|null; shift_target: string|null; situation: string|null; signal_quality_score: number|null; tier: 'Recommended'|'Review'|'Analyst'|'Novel situation' }`.
  - Add `recs: LaneRec[]` and `recsAvailable: boolean` to `Dataset`.
  - `loadAll` treats a failure of `lane_recommendation` as `recsAvailable = false`, does NOT add it to `errors`, and parses `action_probabilities` JSON.
  - Add `kpi.recOn(recs, laneId, date): LaneRec | undefined` (latest on or before the date).
  - Tests:
    - optional-query failure leaves `errors` empty and `recsAvailable` false;
    - `recOn` picks the previous day when the exact day is missing.

---

### Task 5: Map, layers, scrubber, left rail (Explore mode)

**Files:**
- Create: `app/client/src/map/MapView.tsx`, `app/client/src/map/layers.ts`, `app/client/src/map/colors.ts`, `app/client/src/explore/LeftRail.tsx`, `app/client/src/explore/TimeScrubber.tsx`, `app/client/src/explore/ExplorePage.tsx`
- Test: `app/client/src/map/__tests__/colors.test.ts`, `app/client/src/map/__tests__/layers.test.ts`

**Interfaces:**
- **Consumes:** `Dataset` and the `kpi.ts` helpers.
- **Produces:**
  - `colors.pctColor(pct: number|null): [number, number, number, number]`: 100% or more is Navy 900, 0% is Lava 600, linear in between, gray `[150,150,150,160]` for null. Also `statusColor(status)`: Normal = Navy, Degraded = amber `#F5A623`, Shifted = teal `#1B8A8F`, Disrupted = Lava, No data = gray.
  - `layers.buildLayers(args: {dataset: Dataset; date: string; vessel: VesselType | 'total'; visible: LayerToggles; highlightLaneIds?: string[]; genieLayers?: GenieLayerSpec[]}) => Layer[]`.
    - `LayerToggles = {chokepoints: boolean; ports: boolean; lanes: boolean; aisCells: boolean; regions: boolean; genie: boolean}`.
    - Layer ids: `chokepoints`, `ports`, `lanes-primary`, `lanes-alt`, `ais-cells`, `regions`, `genie-<n>`.
    - Chokepoint and port radius: `6 + 2.5 * sqrt(value7d)` px, where value7d comes from the selected vessel type; color `pctColor(pct)`.
    - Lanes: `PathLayer` paths `[primary, hormuz, exit]` for lanes-primary, and each `[alt port, exit]` for lanes-alt (skip when exit is null). Color `statusColor`, width 3; highlighted lanes width 6.
    - AIS cells: `H3HexagonLayer` with `getHexagon: d => d.h3_res5_str`, elevation off, fill Lava with alpha scaled by `unique_vessels`, for the latest day on or before the date.
    - Regions: `PolygonLayer` boxes, Navy outline, plus `TextLayer` labels `"<label>: <fmtPct(100*visibility)>"`.
    - `GenieLayerSpec` is defined in Task 7; until then accept an empty array.
  - `MapView({layers, viewState, onViewStateChange, onPick})`:
    - MapLibre with the Carto Positron style `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`;
    - a deck.gl `MapboxOverlay` (interleaved false);
    - a tooltip on hover with the name, 7-day value and pct (`fmtNum`, `fmtPct`);
    - `onPick(feature)` fires on click with `{kind: 'port'|'chokepoint'|'lane', name}`.
  - `TimeScrubber({start: '2026-01-01', end, date, onChange, events})`: a range input by day with event ticks; clicking a tick sets the date and shows the event text with a link to `source_url`.
  - `LeftRail({dataset, date, vessel, onVessel, toggles, onToggles})`:
    - layer checkboxes and a vessel-type select (Total, Tanker, Container, Dry bulk);
    - four KPI cards: Hormuz transits 7-day average + pct; lanes disrupted N of 6; volume at risk (tonnes and TEU lines); Gulf AIS visibility.
  - `ExplorePage`: composes LeftRail + MapView + TimeScrubber + a right-rail slot (`children`) for Genie.

- [ ] **Step 1: Tests.**
  - `colors.test.ts`: endpoints, midpoint, null → gray, each status color.
  - `layers.test.ts`, on a small fixture dataset:
    - the expected layer ids appear and toggled-off layers are absent;
    - a lane with null exit produces no alt path;
    - the radius for null values uses 0 (radius 6, not NaN).

  Run `npm test`: FAIL.
- [ ] **Step 2: Implement** `colors.ts` and `layers.ts` until the tests pass.
- [ ] **Step 3: Build the components.** Style with the tokens (rails on Light `#F9F7F4`, Navy text, Lava accents, 8 px radius cards). The default date is the latest port data date. Initial view: longitude 54.5, latitude 24.5, zoom 4.6.
- [ ] **Step 4: Local check** (Chrome DevTools MCP).
  - Explore shows chokepoints, ports, lanes and AIS cells.
  - Dragging the scrubber from 2026-02-15 to the latest date visibly shrinks Hormuz and recolors lanes.
  - Hovering a port shows its tooltip.
  - Save screenshots `docs/img/explore-feb.png` and `docs/img/explore-latest.png`. No console errors.
- [ ] **Step 5: Commit** `feat: explore map with layers, scrubber, KPIs`.

- [ ] **Step 4b: Decision layer addendum.** Only when `dataset.recsAvailable`:
  - Create `app/client/src/decisions/RecChip.tsx`:
    - shows the tier (Recommended = Navy, Review = amber `#F5A623`, Analyst = gray, Novel situation = teal `#1B8A8F`), the action, `p` = the top probability to 2 decimals, and a 5-segment probability bar;
    - its title attribute reads "Calibrated by ai_decide; untuned demo thresholds".
  - Create `app/client/src/decisions/Sparkline.tsx` plus the pure `recSeries(recs, laneId): {date: string; p: number; tier: string}[]` in `app/client/src/decisions/series.ts` (p = the top action probability; sorted by date). The sparkline is SVG, 260x60, tier-colored dots, and a vertical line at the selected date.
  - In `LeftRail`, add a lane selector (L1 to L6) that shows `RecChip` and `Sparkline` for the selected lane.
  - Lane tooltips include the RecChip text.
  - Test `series.test.ts`: sorts by date, uses the max probability, and returns empty for an unknown lane. Recommendations are weekly, so the sparkline plots weekly points, and `recOn` uses the latest snapshot on or before the date.

---

### Task 6: Story mode (five data-driven scenes)

**Files:**
- Create: `app/client/src/story/scenes.ts`, `app/client/src/story/copy.ts`, `app/client/src/story/StoryPage.tsx`, `app/client/src/story/SceneCard.tsx`, `app/client/src/story/SceneStepper.tsx`
- Test: `app/client/src/story/__tests__/copy.test.ts`, `app/client/src/story/__tests__/scenes.test.ts`

**Interfaces:**
- **Consumes:** `Dataset`, `kpi.ts`, `buildLayers`, `MapView`, `LeftRail`, `TimeScrubber`.
- **Produces:**
  - `copy.fill(template: string, values: Record<string, string|number|null|undefined>): string`. It replaces `{key}`; numbers are formatted by the caller. A missing, null, undefined or NaN value becomes `'no data'`. It never outputs the strings `NaN` or `undefined`.
  - `copy.pick(cond: boolean, whenTrue: string, whenFalse: string): string`.
  - `scenes.SCENES: Scene[]`, where `Scene = { id: 1|2|3|4|5; title: string; date: 'latest' | 'latest-ais' | string; view: {longitude; latitude; zoom}; vessel: VesselType | 'total'; toggles: LayerToggles; highlightLaneIds?: string[]; body: (ds: Dataset, date: string) => string; questions: string[] }`.
  - Values for the five scenes:

| id | title | date | view (lon, lat, zoom) | vessel | toggles on | highlight | questions (indexes into spec 5.4 list, 1-based) |
|---|---|---|---|---|---|---|---|
| 1 | Your exposure | 2026-02-15 | 54.5, 25.5, 5.0 | total | chokepoints, ports, lanes | none | 1, 4 |
| 2 | The strait closes | 2026-03-08 | 56.4, 26.3, 6.6 | tanker | chokepoints, ports, lanes | none | 5, 1 |
| 3 | Where traffic went | latest | 50.0, 22.0, 4.2 | total | ports, lanes | L2, L4 | 2, 3 |
| 4 | Lanes with no way around | latest | 51.5, 26.5, 5.6 | total | ports, lanes | L3, L6 | 4, 1 |
| 5 | What you cannot see | latest-ais | 50.0, 30.0, 2.2 | total | aisCells, regions, ports | none | 6, 2 |

  - Bodies. Each uses `fill` with values computed from `kpi.ts` and `pick` for conditional wording; no dashes:
    1. "Northwind Supply Co. (a fictional example) runs six lanes through the Strait of Hormuz. Before the war, the strait carried {total7d} visible transits a day. {laneSummary}"
       - `laneSummary` = "All six lanes were running normally." if `disruptedCount == 0`, else "{n} lanes were already below normal."
    2. "On {date}, visible Hormuz tanker transits fell to {tanker7d} a day, {pct} of the pre-war baseline. {eventLine}"
       - `eventLine` = the latest `ref_conflict_events` event on or before the date, as "{event_date}: {event}."
    3. Where traffic went, built from the alternative ports of L2 and L4 at the latest date:
       - if any alternative pct is 100 or more: "{ports} are running above their pre-war baseline, picking up traffic that can no longer move through Jebel Ali and Ruways."
       - otherwise: "No alternative port is above its pre-war baseline yet; the best is {bestPort} at {bestPct}."
       - Then: "Visible counts measure AIS visibility, not total traffic."
    4. "{noBypassList} have no bypass route. Together they put {tonnesAtRisk} tonnes a year at risk under our assumptions."
       - `noBypassList` = the lanes whose `alternative_ports` is empty, joined with commas and "and".
    5. "In the latest five-minute AIS sample, the Gulf was {gulfPct} as visible as a typical busy shipping lane. Yanbu (King Fahd Port) shows {yanbu7d} visible tanker calls a day while Saudi Arabia reports the East-West pipeline running near capacity. Signals that disappear are a risk in themselves."
       - If there are no AIS samples, the first sentence becomes "No AIS samples yet; enable the hormuz_ais_sampler job to measure visibility."

- [ ] **Step 1: Tests.**
  - `copy.test.ts`: `fill` with all values present; with null → 'no data'; with NaN → 'no data'; the output never contains `NaN` or `undefined`; `pick` both branches; no em or en dash characters (U+2014, U+2013) in any scene body for a fixture dataset.
  - `scenes.test.ts`: there are 5 scenes with ids 1 to 5; every `questions` entry is in the spec 5.4 list; each body renders without 'undefined' for (a) the full fixture and (b) an empty dataset (where it renders 'no data' and the no-sample wording).

  Run: FAIL.
- [ ] **Step 2: Implement** `copy.ts` and `scenes.ts` until the tests pass.
- [ ] **Step 3: Build the components.**
  - `StoryPage` holds the scene index and applies the scene's date, view, vessel, toggles and highlight (the camera animates using MapLibre `flyTo` through the view state, 1.2 s).
  - `SceneCard` is overlaid at the top-left of the map: title, body, Back and Next, "Scene n of 5".
  - `SceneStepper` (in the TopBar on the Story tab) has 5 numbered dots.
  - The scrubber stays usable; moving it keeps the scene but recomputes the body.
  - The right-rail slot shows the scene's suggested questions (wired to Genie in Task 7; until then plain buttons).
- [ ] **Step 4: Local check.** Screenshot each scene to `docs/img/scene-<n>.png`; read every body for coherence; no console errors.
- [ ] **Step 5: Commit** `feat: story mode with five data-driven scenes`.

- [ ] **Step 3b: Decision layer addendum.** When `dataset.recsAvailable`, the scene 3 and 4 cards render a `RecChip` for each highlighted lane (L2 and L4 in scene 3, L3 and L6 in scene 4) below the body. When unavailable, nothing renders and no copy mentions recommendations.

---

### Task 7: Genie panel and Genie answers on the map

**Files:**
- Create: `app/client/src/genie/genieClient.ts`, `app/client/src/genie/genieLayer.ts`, `app/client/src/genie/GeniePanel.tsx`, `app/client/src/genie/AnswerCard.tsx`
- Modify: `app/client/src/map/layers.ts` (render `GenieLayerSpec`), `ExplorePage.tsx`, `StoryPage.tsx`
- Test: `app/client/src/genie/__tests__/genieLayer.test.ts`, `app/client/src/genie/__tests__/genieClient.test.ts`

**Interfaces:**
- **Produces:**
  - `genieClient.ask(question: string, conversationId?: string): Promise<GenieAnswer>`. It uses `connectSSE` from `@databricks/appkit-ui/js` against `/api/genie/default/messages` with payload `{content: question, conversationId}`, collecting events into:
    `GenieAnswer = {text?: string; sql?: string; columns: string[]; rows: Record<string, unknown>[]; totalRows: number; suggested?: string[]; conversationId?: string; error?: string}`.
    The reduction follows `/tmp/genie-map-research/geobrix/apps/genie_map/client/src/tools/databricks/genie-tool.ts` `summarizeGenieEvents` and the event union in AppKit `genie.d.ts`. `conversationId` comes from `message_start`.
    It retries once on error or connection failure before returning `error`.
  - `genieLayer.detect(answer: GenieAnswer): GenieLayerSpec | null`:
    `GenieLayerSpec = {kind: 'h3'; hexField: string; valueField?: string; rows} | {kind: 'points'; latField: string; lonField: string; valueField?: string; rows} | {kind: 'lanes'; laneIds: string[]}`.
    Rules, matched case-insensitively, first match wins:
    1. A column equal to `h3`, ending with `_h3`, or starting with `h3_res`. Values may be hex strings or decimal BIGINT strings; convert decimals to hex with `BigInt(v).toString(16)`.
    2. `lat`/`lon` or `latitude`/`longitude`.
    3. `lane_id`.
    4. Otherwise null.

    `valueField` = the first other column whose non-null values all parse as finite numbers. The result is capped at 5,000 rows; `totalRows` keeps the original count.
- `GeniePanel({suggested: string[], onLayersChange(specs: {id: string; title: string; spec: GenieLayerSpec; on: boolean}[])})`:
  - an input box and suggested-question chips;
  - answer cards, newest first, keeping the conversation id for follow-ups;
  - at most 5 map layers; adding a sixth turns off the oldest; a "Clear all" button.
- `AnswerCard`: question title, Genie text, a collapsible SQL block, a table (first 50 rows, "showing N of M" when capped), an "On map / Off" toggle (only when `detect` is non-null), and the error message when present.
- In `layers.ts`, map each enabled `GenieLayerSpec` to a deck layer:
  - h3 → `H3HexagonLayer` (fill Lava, alpha by valueField);
  - points → `ScatterplotLayer` (Navy, radius by valueField);
  - lanes → set the `highlightLaneIds` union.
  - Layer ids are `genie-<n>`.
- Map click (`onPick`) on a port or chokepoint pre-fills the input with "How has {name} changed since the war began?".

- [ ] **Step 1: Tests.**
  - `genieLayer.test.ts` covers:
    - an h3 hex string column; `h3_res5` as a decimal BIGINT string (converted to hex);
    - `Latitude`/`Longitude` mixed case; `lane_id`; no geo columns → null;
    - valueField selection with numbers as strings; skips non-numeric columns;
    - a 6,000-row result capped to 5,000 with totalRows 6,000.
  - `genieClient.test.ts` mocks `connectSSE` to emit `message_start`, `message_result` (with text and query attachments) and `query_result` (2 columns, 2 rows). It asserts the reduced `GenieAnswer`, the conversationId, one retry on the first failure, and an `error` after a second failure.

  Run: FAIL.
- [ ] **Step 2: Implement** `genieLayer.ts` and `genieClient.ts` until the tests pass.
- [ ] **Step 3: Build the panel and wiring.** Story and Explore both render `GeniePanel` in the right rail; Story passes the scene's suggested questions.
- [ ] **Step 4: Local check.**
  - Ask "Which alternative ports are running above their pre-war baseline?": the answer card shows SQL and a table, and points appear on the map. Screenshot `docs/img/genie-alt-ports.png`.
  - Ask "Which of our lanes are disrupted today, and how much volume is at risk?": the lanes highlight.
  - No console errors.
- [ ] **Step 5: Commit** `feat: Genie panel with answers on the map`.

---

### Task 8: Architecture tab

**Files:**
- Create: `app/client/src/architecture/ArchitecturePage.tsx`, `app/client/src/architecture/graph.ts`
- Test: `app/client/src/architecture/__tests__/graph.test.ts`

**Interfaces:**
- **Produces:**
  - `graph.NODES: ArchNode[]`, where `ArchNode = {id: string; column: 1|2|3|4|5|6; title: string; sub: string; layer: ArchLayer; detail: {resources: string[]; talk: string}}`.
  - `graph.EDGES: {id; source; target; label?: string; dashed?: boolean}[]`.
  - `graph.LAYERS: Record<ArchLayer, {label: string; fg: string}>`.
  - `ArchLayer = 'source' | 'jobs' | 'sdp' | 'spatial' | 'uc' | 'genie' | 'dbsql' | 'app'`.
  - Columns 1 to 6 are labeled `1 Sources`, `2 Ingest`, `3 Process`, `4 Govern`, `5 Intelligence`, `6 Serve`.
  - Nodes and edges are exactly as in spec section 5.3. Resource names:
    - PortWatch: `bronze_portwatch_chokepoints_daily`, `bronze_portwatch_ports_daily`;
    - aisstream: `bronze_ais_samples`;
    - Natural Earth: `ref_land_region`;
    - Demo lanes: `ref_demo_lanes`;
    - Lakeflow Jobs: `hormuz_reference_daily`, `hormuz_ais_sampler`;
    - Lakeflow SDP (Python): `hormuz_reference`;
    - Lakeflow SDP: `hormuz_reference`, `hormuz_ais`;
    - Spatial SQL: `h3_longlatash3`, `st_intersection`, `gold_ais_h3_daily`;
    - Unity Catalog: `jdub_demo.hormuz`;
    - Genie: `Hormuz Chokepoint Monitor`;
    - Databricks SQL: `serverless SQL warehouse`;
    - App: `hormuz-map`.
  - Each `talk` is one plain sentence with no dashes.
  - Layer colors come from the Databricks tokens: Sources gray `#64748B`; Lakeflow Jobs Navy 900; Lakeflow SDP `#1B5162`; Spatial SQL `#1B8A8F`; Unity Catalog `#7C4DFF`; Genie Lava 600; Databricks SQL `#F5A623`; App `#00A972`. Record the exact hex values used.

- [ ] **Step 1: `graph.test.ts`:**
  - every edge's source and target exist;
  - every node's column is 1 to 6;
  - there are exactly 6 distinct column labels;
  - no em or en dash characters (U+2014, U+2013) in any title, sub, or talk;
  - every node has at least one resource.

  Run: FAIL.
- [ ] **Step 2: Implement** `graph.ts` until the tests pass.
- [ ] **Step 3: Port the page.** Port `~/Desktop/Projects/geologic/app/frontend/src/pages/ArchitecturePage.tsx` into `ArchitecturePage.tsx`:
  - keep its React Flow canvas, CardNode, column headers, Zoom In / Zoom Out / Fit / PNG / SVG controls, and the bottom legend;
  - drive it from `graph.ts`;
  - restyle with the tokens;
  - add a click popover (resources list + talk sentence).
  - Header copy is exactly as in spec 5.3.
- [ ] **Step 4: Local check.** Screenshot `docs/img/architecture.png` after Fit; PNG export downloads a file; clicking the Genie node opens its popover.
- [ ] **Step 5: Commit** `feat: architecture tab`.

- [ ] **Step 4b: Decision layer addendum.**
  - Add node `ai_decide` (column 5, layer `aifn`, title "AI Functions", sub "ai_decide lane recommendations", resources `gold_lane_recommendation`, `hormuz_decisions`, talk "A decision model reads a plain-language description of each lane and returns calibrated probabilities; our SQL turns them into Recommended, Review, or Analyst.").
  - Add edges Unity Catalog to ai_decide and ai_decide to Genie (label "recommendations").
  - Add `aifn: {label: 'AI Functions', fg: '#5A2D82'}` to `LAYERS`.

---

### Task 9: Deploy through the bundle, verify live, update docs

**Files:**
- Create: `resources/hormuz_app.app.yml`
- Modify: `databricks.yml` (variables), `README.md`, `docs/design.md` (one paragraph pointing to the app spec)

**Interfaces:**
- **Consumes:** everything above.
- **Produces:** a live app `hormuz-map` and its URL.

- [ ] **Step 1: Bundle variables.** In `databricks.yml` add `warehouse_id` (required, no default; description "SQL warehouse for the app") and `genie_space_id` (required, no default; description "Genie space id printed by genie/build_space.py").
- [ ] **Step 2: `resources/hormuz_app.app.yml`:**
```yaml
resources:
  apps:
    hormuz_map:
      name: hormuz-map
      description: "The Invisible Strait: Hormuz supply lane monitor"
      source_code_path: ../app
      user_api_scopes:
        - sql
        - genie
      resources:
        - name: sql-warehouse
          sql_warehouse:
            id: ${var.warehouse_id}
            permission: CAN_USE
      config:
        env:
          - name: DATABRICKS_WAREHOUSE_ID
            value_from: sql-warehouse
          - name: HORMUZ_CATALOG
            value: ${var.catalog}
          - name: HORMUZ_SCHEMA
            value: ${var.schema}
          - name: GENIE_SPACE_ID
            value: ${var.genie_space_id}
          - name: GENIE_SPACE_TITLE
            value: Hormuz Chokepoint Monitor
```
  - Merge in anything else the generated (and deleted) `app/databricks.yml` declared for the app (resource bindings, scopes) as recorded in the Task 3 report.
  - Add to `databricks.yml`: `sync: exclude: ["app/node_modules/**", "app/dist/**", "app/client/dist/**"]`. The Apps container installs from the committed public lockfile and runs the template's build, which is the standard flow.
  - If validate rejects `config.command` or `value_from`, use the shape the `databricks:databricks-dabs` skill documents for CLI 1.18 and record the change.
  - If `user_api_scopes` value `genie` is rejected, use `dashboards.genie`.
- [ ] **Step 3: Build, validate, plan (STOP on any delete or recreate), deploy, run.**
```bash
cd ~/Desktop/Projects/hormuz-genie-map/app && databricks apps validate --profile DEFAULT && bash scripts/lockfile-public.sh && cd ..
V1='--var=catalog=jdub_demo'; V2='--var=schedule_pause_status=UNPAUSED'; V3='--var=warehouse_id=<warehouse-id>'; V4='--var=genie_space_id=<genie-space-id>'
databricks bundle validate "$V1" "$V2" "$V3" "$V4" --profile DEFAULT
databricks bundle plan "$V1" "$V2" "$V3" "$V4" --profile DEFAULT
databricks bundle deploy "$V1" "$V2" "$V3" "$V4" --profile DEFAULT
databricks bundle run hormuz_map "$V1" "$V2" "$V3" "$V4" --profile DEFAULT
databricks apps get hormuz-map --profile DEFAULT -o json
```
  The plan must show only `create apps.hormuz_map`, with the pipelines and jobs unchanged.
- [ ] **Step 4: Live verification** (Chrome DevTools MCP, logged in as the user).
  - The app URL loads; all 8 queries succeed (no error banner); the freshness badge shows dates.
  - Story scenes 1 to 5 render; one Genie question renders as a map layer; the Architecture tab renders.
  - If the Genie or SQL calls fail with a scope error, follow the memory notes: wait about 1 minute for scope propagation, reload, then check `effective_user_api_scopes` in `apps get`.
  - Save screenshots to `docs/img/live-*.png`. Record the URL.
- [ ] **Step 5: README.** Add an "App" section:
  - what it shows (scenes, Explore, Genie, Architecture);
  - the build and deploy commands with all four vars;
  - that the lanes are synthetic and editable in `src/pipelines/reference/ref_demo_lanes.sql`;
  - that the viewer needs SELECT on the schema and CAN_RUN on the Genie space;
  - local dev with `.env`;
  - screenshots from `docs/img/`.

  No dashes.
- [ ] **Step 6: Commit** `feat: deploy hormuz-map app via bundle`.

---

### Task 10: ai_decide decision layer (run after Task 3, before Task 4)

**Files:**
- Modify: `src/pipelines/reference/gold_lane_status.sql` (the `alt_ports` struct gains `baseline`)
- Create: `src/pipelines/decisions/gold_lane_recommendation.sql`, `resources/hormuz_decisions.pipeline.yml`
- Create: `resources/hormuz_decisions_weekly.job.yml`
- Modify: `genie/space_config.py`, `tests/test_genie_config.py`

**Interfaces:**
- **Consumes:** `gold_lane_status`, `ref_conflict_events`, `gold_ais_visibility_index`.
- **Produces:** `gold_lane_recommendation`, with columns `date, lane_id, lane, state_text, action, action_probabilities (MAP<STRING,DOUBLE>), action_confidence, shift_target, situation, signal_quality_score, tier, decision (VARIANT)`.

- [ ] **Step 1: Struct change.** In `gold_lane_status.sql`, change the `alt_ports` struct to `named_struct('port', p.port, 'lat', p.lat, 'lon', p.lon, 'pct', ROUND(100 * p.calls_7d / NULLIF(p.baseline, 0), 1), 'baseline', p.baseline)`.

- [ ] **Step 2: Create `src/pipelines/decisions/gold_lane_recommendation.sql`:**
```sql
CREATE OR REFRESH MATERIALIZED VIEW gold_lane_recommendation
COMMENT 'ai_decide recommendations per demo lane on weekly snapshot dates (Mondays from 2026-02-02 plus the latest date). SQL turns the numbers into a plain-language description (state_text); ai_decide classifies it with calibrated probabilities; SQL composes a tier with untuned demo thresholds: Novel situation (none_fit or top probability below 0.40), Analyst (signal_quality score 1.5 or more), Recommended (confidence 0.90 or more), Review (0.60 or more), else Analyst. Lanes are synthetic examples.'
AS
WITH s AS (
  SELECT ls.*,
         LAG(ls.primary_pct, 14) OVER (PARTITION BY ls.lane_id ORDER BY ls.date) AS primary_pct_14d_ago
  FROM `${hormuz.catalog}`.`${hormuz.schema}`.gold_lane_status ls
),
ev AS (
  SELECT s.lane_id, s.date, max_by(e.event, e.event_date) AS latest_event
  FROM snap s LEFT JOIN `${hormuz.catalog}`.`${hormuz.schema}`.ref_conflict_events e ON e.event_date <= s.date
  GROUP BY s.lane_id, s.date
),
vis AS (
  SELECT s.lane_id, s.date, max_by(v.visibility_vs_control, v.sample_hour) AS gulf_vis
  FROM snap s LEFT JOIN `${hormuz.catalog}`.`${hormuz.schema}`.gold_ais_visibility_index v
    ON v.region = 'gulf_hormuz' AND CAST(v.sample_hour AS DATE) <= s.date
  GROUP BY s.lane_id, s.date
),
snap AS (
  SELECT * FROM s
  WHERE dayofweek(s.date) = 2 AND s.date >= DATE'2026-02-02'
     OR s.date = (SELECT MAX(date) FROM `${hormuz.catalog}`.`${hormuz.schema}`.gold_lane_status)
),
described AS (
  SELECT s.date, s.lane_id, s.lane,
    concat(
      'Lane: ', s.lane, ' via ', s.primary_port, ' (',
      CASE s.vessel_type WHEN 'tanker' THEN 'tankers' WHEN 'container' THEN 'container ships' ELSE 'dry bulk carriers' END, '). ',
      'Primary port: visible calls ',
      CASE WHEN s.primary_pct IS NULL THEN 'have no visible data'
           WHEN s.primary_pct < 25 THEN 'are far below pre-war levels'
           WHEN s.primary_pct < 50 THEN 'are well below pre-war levels'
           WHEN s.primary_pct < 80 THEN 'are below pre-war levels'
           WHEN s.primary_pct < 120 THEN 'are near pre-war levels'
           WHEN s.primary_pct < 200 THEN 'are above pre-war levels'
           ELSE 'are well above pre-war levels' END,
      CASE WHEN s.primary_pct IS NULL OR s.primary_pct_14d_ago IS NULL THEN ''
           WHEN s.primary_pct_14d_ago = 0 THEN CASE WHEN s.primary_pct > 0 THEN ' and rising over the last 14 days' ELSE ' and steady over the last 14 days' END
           WHEN s.primary_pct < 0.8 * s.primary_pct_14d_ago THEN ' and falling over the last 14 days'
           WHEN s.primary_pct > 1.25 * s.primary_pct_14d_ago THEN ' and rising over the last 14 days'
           ELSE ' and steady over the last 14 days' END, '. ',
      'Alternative ports: ',
      coalesce(nullif(array_join(transform(s.alt_ports, a -> concat(a.port, ' is ',
        CASE WHEN a.pct IS NULL THEN 'without visible data'
             WHEN a.pct < 50 THEN 'well below pre-war levels'
             WHEN a.pct < 80 THEN 'below pre-war levels'
             WHEN a.pct < 120 THEN 'near pre-war levels'
             WHEN a.pct < 200 THEN 'above pre-war levels'
             ELSE 'well above pre-war levels' END,
        CASE WHEN a.baseline < 1 THEN ' but on a very small baseline' ELSE '' END)), '; '), ''),
        'none, this lane has no bypass route'), '. ',
      'Strait of Hormuz: visible transits for this vessel type ',
      CASE WHEN s.hormuz_pct IS NULL THEN 'have no visible data'
           WHEN s.hormuz_pct < 25 THEN 'are near zero compared with pre-war levels'
           WHEN s.hormuz_pct < 80 THEN 'are below pre-war levels'
           ELSE 'are near pre-war levels' END, '. ',
      'Latest event: ', coalesce(ev.latest_event, 'none recorded'), '. ',
      'Gulf AIS visibility: ',
      CASE WHEN vis.gulf_vis IS NULL THEN 'not measured'
           WHEN vis.gulf_vis < 0.05 THEN 'very low'
           WHEN vis.gulf_vis < 0.3 THEN 'low'
           ELSE 'moderate' END, '.'
    ) AS state_text
  FROM snap s JOIN ev USING (lane_id, date) JOIN vis USING (lane_id, date)
),
decided AS (
  SELECT d.*, ai_decide(d.state_text, '{
    "situation": {"type": "choice", "instructions": "Which pattern best describes this shipping lane right now?",
      "criteria": {"acute_closure": "Traffic through the strait recently collapsed",
                   "sustained_closure": "Traffic has been far below normal for a long period",
                   "partial_recovery": "Traffic is recovering toward normal levels",
                   "normal": "Traffic is at or near normal levels",
                   "none_fit": "None of these patterns fits the description"}},
    "action": {"type": "choice", "instructions": "Which action does the description support for a shipper using this lane?",
      "criteria": {"hold": "Keep using the primary port and route",
                   "shift": "Move volume to alternative ports that are running above normal",
                   "buffer": "Build safety stock because no alternative is working",
                   "escalate": "Escalate to leadership because the situation is severe and unclear",
                   "none_fit": "None of these actions fits the description"}},
    "shift_target": {"type": "choice", "instructions": "If volume should shift, which alternative port does the description show running best?",
      "criteria": {"Yanbu (King Fahd Port)": null, "Fujairah": null, "Khor Fakkan": null, "Port of Sohar": null,
                   "Salalah": null, "Jeddah": null,
                   "not_applicable": "The lane has no working alternative port or should not shift"}},
    "signal_quality": {"type": "score", "instructions": "How clear and consistent are the signals in this description?",
      "criteria": ["Clear and consistent signals", "Mixed signals with some caveats", "Thin or contradictory signals"]}
  }', map('version', '1.0')) AS decision
  FROM described d
),
parsed AS (
  SELECT date, lane_id, lane, state_text, decision,
    decision:response.answers.action.choice::string AS action,
    from_json(to_json(decision:response.answers.action.probabilities), 'map<string,double>') AS action_probabilities,
    decision:response.answers.action.confidence::double AS action_confidence,
    decision:response.answers.shift_target.choice::string AS shift_target,
    decision:response.answers.situation.choice::string AS situation,
    decision:response.answers.signal_quality.score::double AS signal_quality_score
  FROM decided
)
SELECT p.*,
  CASE
    WHEN p.action IS NULL OR p.action = 'none_fit' OR array_max(map_values(p.action_probabilities)) < 0.40 THEN 'Novel situation'
    WHEN p.signal_quality_score >= 1.5 THEN 'Analyst'
    WHEN p.action_confidence >= 0.90 THEN 'Recommended'
    WHEN p.action_confidence >= 0.60 THEN 'Review'
    ELSE 'Analyst'
  END AS tier
FROM parsed p;
```

- [ ] **Step 3: `resources/hormuz_decisions.pipeline.yml`.** Copy the shape of `hormuz_ais.pipeline.yml`: name `hormuz_decisions`, serverless, channel CURRENT, catalog and schema from the variables, `root_path: ../src`, library glob `../src/pipelines/decisions/**`, and configuration `hormuz.catalog: ${var.catalog}` and `hormuz.schema: ${var.schema}`.
  Create `resources/hormuz_decisions_weekly.job.yml`:
  - job `hormuz_decisions_weekly`, schedule `0 0 8 ? * MON` UTC with `pause_status: ${var.schedule_pause_status}`, `timeout_seconds: 1800`;
  - one task `refresh_decisions` with `pipeline_task.pipeline_id: ${resources.pipelines.hormuz_decisions.id}`.
  - Do not touch `hormuz_reference_daily`.

- [ ] **Step 4: Deploy and run.** Validate, plan (STOP on delete or recreate), deploy. Selectively refresh only `gold_lane_status` in `hormuz_reference`, then `databricks bundle run hormuz_decisions` with the Global vars.

- [ ] **Step 5: Verify.**
```bash
databricks experimental aitools tools query --profile DEFAULT -o csv "SELECT COUNT(*) n, COUNT_IF(decision:error_message IS NOT NULL) errs FROM jdub_demo.hormuz.gold_lane_recommendation"
databricks experimental aitools tools query --profile DEFAULT -o csv "SELECT tier, action, COUNT(*) FROM jdub_demo.hormuz.gold_lane_recommendation GROUP BY ALL ORDER BY 3 DESC"
databricks experimental aitools tools query --profile DEFAULT -o csv "SELECT lane_id, action, action_confidence, shift_target, situation, signal_quality_score, tier, state_text FROM jdub_demo.hormuz.gold_lane_recommendation WHERE date = (SELECT MAX(date) FROM jdub_demo.hormuz.gold_lane_recommendation) ORDER BY lane_id"
```
Expected:
- n is about 220 (6 × the number of snapshot dates), with errs = 0;
- no state_text contains `null` or `NaN`;
- on the latest date, record each lane's tier and action. Do not tune thresholds to reach a particular result; report the distribution.

- [ ] **Step 6: Genie.**
  - Add `gold_lane_recommendation` to `TABLES`.
  - Append to `INSTRUCTIONS`: "- gold_lane_recommendation holds ai_decide recommendations. Always report tier, action, and action_confidence together; tiers use untuned demo thresholds; never present a recommendation as certain."
  - Add two EXAMPLE_SQL entries (backticked templated names, no dashes), each validated on the warehouse:
    - "What should we do about the Jebel Ali lane, and how confident is the model?" (latest date, L4);
    - "When did the model start recommending a shift for our container lane?" (first date where L4 `action = 'shift'` and tier in Recommended or Review).
  - The test asserts the table is in `TABLES`.
  - Rebuild the space and ask the first question live; record the answer.

- [ ] **Step 7: Commit** `feat: ai_decide lane recommendations`.

