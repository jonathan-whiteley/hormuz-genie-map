-- @param catalog STRING = jdub_demo
-- @param schema STRING = hormuz
SELECT
  date, lane_id, lane, commodity, vessel_type, primary_port,
  to_json(alternative_ports) AS alternative_ports,
  alternative_route, alt_exit, annual_volume, volume_unit,
  primary_lat, primary_lon, hormuz_lat, hormuz_lon, exit_lat, exit_lon,
  to_json(alt_ports) AS alt_ports,
  hormuz_pct, primary_pct, alternative_pct, status, volume_at_risk
FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_lane_status')
WHERE date >= DATE'2026-01-01'
