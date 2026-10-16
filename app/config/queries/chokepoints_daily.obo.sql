-- @param catalog STRING = jdub_demo
-- @param schema STRING = hormuz
-- Every pct_of_baseline_* here is the 7-day average over the pre-war baseline, so it matches the
-- 7-day transit figure shown next to it and gold_lane_status.hormuz_pct. The gold table's own
-- pct_of_baseline_total and pct_of_baseline_tanker are daily values (Genie examples use them).
SELECT
  date, chokepoint, lat, lon,
  n_total, n_tanker, n_container, n_dry_bulk,
  n_total_7d_avg, n_tanker_7d_avg, n_container_7d_avg, n_dry_bulk_7d_avg,
  ROUND(100 * n_total_7d_avg / NULLIF(baseline_total, 0), 1) AS pct_of_baseline_total,
  ROUND(100 * n_tanker_7d_avg / NULLIF(baseline_tanker, 0), 1) AS pct_of_baseline_tanker,
  ROUND(100 * n_container_7d_avg / NULLIF(baseline_container, 0), 1) AS pct_of_baseline_container,
  ROUND(100 * n_dry_bulk_7d_avg / NULLIF(baseline_dry_bulk, 0), 1) AS pct_of_baseline_dry_bulk
FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_chokepoint_daily')
WHERE date >= DATE'2026-01-01'
  AND chokepoint IN ('Strait of Hormuz', 'Bab el-Mandeb Strait', 'Suez Canal', 'Cape of Good Hope')
