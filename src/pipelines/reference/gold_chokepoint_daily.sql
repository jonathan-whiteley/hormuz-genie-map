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
