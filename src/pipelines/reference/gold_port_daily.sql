CREATE OR REFRESH MATERIALIZED VIEW gold_port_daily
COMMENT 'Daily port calls and estimated tanker export/import volumes (metric tons) for Gulf and Red Sea region ports, with 7-day averages and percent of the pre-war baseline (mean of 2026-01-01 to 2026-02-27). Bypass ports outside the strait include Fujairah and Khor Fakkan (UAE) and Yanbu (Saudi Red Sea coast). Source: IMF PortWatch.'
AS
WITH baseline AS (
  SELECT portid,
         AVG(portcalls) AS baseline_portcalls,
         AVG(portcalls_tanker) AS baseline_portcalls_tanker,
         AVG(portcalls_container) AS baseline_portcalls_container,
         AVG(portcalls_dry_bulk) AS baseline_portcalls_dry_bulk,
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
  d.portcalls, d.portcalls_tanker, d.portcalls_container, d.portcalls_dry_bulk,
  d.export_tanker, d.import_tanker,
  d.`export` AS export_total,
  d.`import` AS import_total,
  AVG(d.portcalls_tanker) OVER (PARTITION BY d.portid ORDER BY d.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS portcalls_tanker_7d_avg,
  AVG(d.export_tanker)    OVER (PARTITION BY d.portid ORDER BY d.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS export_tanker_7d_avg,
  AVG(d.portcalls_container) OVER (PARTITION BY d.portid ORDER BY d.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS portcalls_container_7d_avg,
  AVG(d.portcalls_dry_bulk)  OVER (PARTITION BY d.portid ORDER BY d.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS portcalls_dry_bulk_7d_avg,
  b.baseline_portcalls, b.baseline_portcalls_tanker, b.baseline_export_tanker,
  b.baseline_portcalls_container, b.baseline_portcalls_dry_bulk,
  ROUND(100 * d.portcalls_tanker / NULLIF(b.baseline_portcalls_tanker, 0), 1) AS pct_of_baseline_portcalls_tanker,
  ROUND(100 * d.export_tanker    / NULLIF(b.baseline_export_tanker, 0), 1)    AS pct_of_baseline_export_tanker,
  ROUND(100 * d.portcalls_container / NULLIF(b.baseline_portcalls_container, 0), 1) AS pct_of_baseline_portcalls_container,
  ROUND(100 * d.portcalls_dry_bulk  / NULLIF(b.baseline_portcalls_dry_bulk, 0), 1)  AS pct_of_baseline_portcalls_dry_bulk
FROM bronze_portwatch_ports_daily d
LEFT JOIN baseline b ON b.portid = d.portid
LEFT JOIN ref_portwatch_ports p ON p.portid = d.portid;
