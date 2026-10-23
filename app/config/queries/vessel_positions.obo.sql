-- @param catalog STRING = jdub_demo
-- @param schema STRING = hormuz
-- Each vessel's last position report per day, for the last 7 days. One SSE result event is capped
-- at 5 MB, so the window stays short and coordinates are rounded to 4 decimals (about 11 m).
-- The North Sea control region is left out: it is off the map and about 13,400 vessels a day,
-- against about 1,600 for the other regions together (2.5 MB for 7 days, measured 2026-10-23).
-- The map draws one day of vessels, the latest on or before the selected date.
SELECT
  CAST(window_start AS DATE) AS day,
  mmsi,
  NULLIF(TRIM(ship_name), '') AS ship_name,
  ROUND(lat, 4) AS lat,
  ROUND(lon, 4) AS lon,
  ROUND(sog_knots, 1) AS sog_knots,
  ROUND(cog_deg) AS cog_deg,
  nav_status,
  region,
  received_at
FROM IDENTIFIER(:catalog || '.' || :schema || '.silver_ais_positions')
WHERE window_start >= date_sub(current_date(), 7)
  AND region <> 'north_sea_channel'
QUALIFY ROW_NUMBER() OVER (PARTITION BY CAST(window_start AS DATE), mmsi ORDER BY received_at DESC) = 1
