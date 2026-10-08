CREATE OR REFRESH MATERIALIZED VIEW gold_ais_h3_daily
COMMENT 'Daily AIS vessels heard per H3 res 5 cell and region across hourly samples; the map layer for AIS visibility.'
AS SELECT
  region, role,
  CAST(window_start AS DATE) AS day,
  h3_res5,
  h3_h3tostring(h3_res5) AS h3_res5_str,
  COUNT(*) AS positions,
  COUNT(DISTINCT mmsi) AS unique_vessels,
  COUNT(DISTINCT sample_id) AS samples
FROM silver_ais_positions
GROUP BY region, role, CAST(window_start AS DATE), h3_res5;
