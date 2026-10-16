CREATE OR REFRESH MATERIALIZED VIEW gold_lane_status (
  -- Warn only: every alternative port named in ref_demo_lanes should join a gold_port_daily row. A misspelled
  -- name silently drops out of the alternative sums; this expectation flags it in the pipeline event log.
  CONSTRAINT alt_ports_resolved
    EXPECT ((CASE WHEN alt_ports IS NULL THEN 0 ELSE size(alt_ports) END) = size(alternative_ports))
)
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
                                   'pct', ROUND(100 * p.calls_7d / NULLIF(p.baseline, 0), 1),
                                   'baseline', p.baseline)) AS alt_ports
  FROM (SELECT lane_id, vessel_type, explode(alternative_ports) AS alt_port FROM ref_demo_lanes) l
  JOIN port_type p ON p.port = l.alt_port AND p.vessel_type = l.vessel_type
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
