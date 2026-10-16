-- @param catalog STRING = jdub_demo
-- @param schema STRING = hormuz
-- Last 30 days only. One SSE result event is capped at 5 MB, and the hourly sampler adds about
-- 1,100 cell rows a day (about 110 bytes each), so the unbounded table would pass the cap within
-- weeks. The map draws one day of cells, the latest on or before the selected date.
SELECT region, day, h3_res5_str, unique_vessels, positions
FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_ais_h3_daily')
WHERE day >= date_sub(current_date(), 30)
