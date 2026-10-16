-- @param catalog STRING = jdub_demo
-- @param schema STRING = hormuz
-- Last 30 days only, to stay well under the 5 MB per-event cap as hourly samples accumulate
-- (about 120 rows a day). The app reads the latest sample on or before the selected date.
SELECT
  sample_id, sample_hour, region, label, unique_vessels, vessels_per_10k_km2,
  visibility_vs_control, vs_north_sea_channel, vs_suez_east_med, vs_malacca_singapore
FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_ais_visibility_index')
WHERE sample_hour >= current_timestamp() - INTERVAL 30 DAYS
