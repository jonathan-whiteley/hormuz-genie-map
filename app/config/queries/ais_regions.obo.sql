-- @param catalog STRING = jdub_demo
-- @param schema STRING = hormuz
SELECT region, role, label, lat_min, lon_min, lat_max, lon_max, area_km2 FROM IDENTIFIER(:catalog || '.' || :schema || '.ref_ais_regions')
