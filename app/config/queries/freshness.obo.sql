-- @param catalog STRING = jdub_demo
-- @param schema STRING = hormuz
SELECT
  (SELECT MAX(date) FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_chokepoint_daily')) AS chokepoint_date,
  (SELECT MAX(date) FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_port_daily')) AS port_date,
  (SELECT MAX(sample_hour) FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_ais_visibility')) AS ais_sample_hour
