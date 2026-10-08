CREATE OR REFRESH MATERIALIZED VIEW gold_ais_visibility_index
COMMENT 'AIS visibility of each target region relative to the mean of the control lanes in the same sample (1.0 = as visible as a normal busy lane; near 0 = almost dark).'
AS
WITH ctrl AS (
  SELECT sample_id, AVG(vessels_per_10k_km2) AS control_vessels_per_10k_km2
  FROM gold_ais_visibility WHERE role = 'control'
  GROUP BY sample_id
)
SELECT
  t.sample_id, t.sample_hour, t.region, t.label, t.unique_vessels, t.vessels_per_10k_km2,
  c.control_vessels_per_10k_km2,
  ROUND(t.vessels_per_10k_km2 / NULLIF(c.control_vessels_per_10k_km2, 0), 4) AS visibility_vs_control
FROM gold_ais_visibility t
JOIN ctrl c ON c.sample_id = t.sample_id
WHERE t.role = 'target';
