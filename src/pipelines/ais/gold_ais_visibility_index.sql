CREATE OR REFRESH MATERIALIZED VIEW gold_ais_visibility_index
COMMENT 'AIS visibility of each target region relative to the median control lane in the same sample (1.0 = as visible as the median busy lane), plus a ratio to each control lane. Only complete samples. Densities use bounding-box area, which includes land.'
AS
WITH ok AS (
  SELECT * FROM gold_ais_visibility WHERE sample_ok
),
ctrl AS (
  SELECT sample_id,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY vessel_density) AS control_median_density,
         MAX(CASE WHEN region = 'north_sea_channel' THEN vessel_density END) AS d_north_sea_channel,
         MAX(CASE WHEN region = 'suez_east_med' THEN vessel_density END) AS d_suez_east_med,
         MAX(CASE WHEN region = 'malacca_singapore' THEN vessel_density END) AS d_malacca_singapore
  FROM ok WHERE role = 'control'
  GROUP BY sample_id
)
SELECT
  t.sample_id, t.sample_hour, t.window_seconds, t.error, t.region, t.label,
  t.unique_vessels, t.vessels_per_10k_km2,
  c.control_median_density,
  ROUND(t.vessel_density / NULLIF(c.control_median_density, 0), 5) AS visibility_vs_control,
  ROUND(t.vessel_density / NULLIF(c.d_north_sea_channel, 0), 5) AS vs_north_sea_channel,
  ROUND(t.vessel_density / NULLIF(c.d_suez_east_med, 0), 5) AS vs_suez_east_med,
  ROUND(t.vessel_density / NULLIF(c.d_malacca_singapore, 0), 5) AS vs_malacca_singapore
FROM ok t
JOIN ctrl c ON c.sample_id = t.sample_id
WHERE t.role = 'target';
