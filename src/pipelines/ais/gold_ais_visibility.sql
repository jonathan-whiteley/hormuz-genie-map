CREATE OR REFRESH MATERIALIZED VIEW gold_ais_visibility
COMMENT 'One row per hourly sample and region: AIS positions and unique vessels heard by the free aisstream.io receiver network during the listening window, plus density per 10,000 km2. Low values in target regions mean low AIS visibility, not necessarily low traffic.'
AS
WITH samples AS (
  SELECT sample_id, window_start, window_end,
         timestampdiff(SECOND, window_start, window_end) AS window_seconds,
         n_messages AS total_messages, error
  FROM ${hormuz.catalog}.${hormuz.schema}.bronze_ais_samples
  WHERE message_type = '_heartbeat'
),
per_region AS (
  SELECT sample_id, region, COUNT(*) AS positions, COUNT(DISTINCT mmsi) AS unique_vessels
  FROM silver_ais_positions
  GROUP BY sample_id, region
)
SELECT
  s.sample_id, s.window_start, date_trunc('HOUR', s.window_start) AS sample_hour, s.window_seconds,
  s.total_messages, s.error,
  r.region, r.role, r.label, r.area_km2,
  coalesce(p.positions, 0) AS positions,
  coalesce(p.unique_vessels, 0) AS unique_vessels,
  ROUND(coalesce(p.unique_vessels, 0) * 10000.0 / r.area_km2, 3) AS vessels_per_10k_km2,
  ROUND(coalesce(p.positions, 0) * 60.0 / NULLIF(s.window_seconds, 0), 2) AS positions_per_minute
FROM samples s
CROSS JOIN ref_ais_regions r
LEFT JOIN per_region p ON p.sample_id = s.sample_id AND p.region = r.region;
