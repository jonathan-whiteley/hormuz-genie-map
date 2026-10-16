-- @param catalog STRING = jdub_demo
-- @param schema STRING = hormuz
-- Region ports, UI columns only. One SSE result event is capped at 5 MB and the full 2026 set is
-- about 7.0 MB, so it is split into three fixed date chunks (ports_daily, ports_daily_2, ports_daily_3).
-- Measured compact JSON sizes: Jan-Apr ~3.1 MB, May-Aug ~3.1 MB, Sep-Dec ~0.9 MB now (about 2.8 MB by Dec 31).
-- A port is kept if it had any calls in 2026 OR has a nonzero baseline for any vessel type,
-- so a port whose traffic fell to zero stays visible against its baseline.
WITH p AS (
  SELECT * FROM IDENTIFIER(:catalog || '.' || :schema || '.gold_port_daily')
  WHERE date >= DATE'2026-01-01'
),
active AS (
  SELECT port
  FROM p
  GROUP BY port
  HAVING SUM(COALESCE(portcalls, 0)) > 0
    OR MAX(COALESCE(baseline_portcalls_tanker, 0)) > 0
    OR MAX(COALESCE(baseline_portcalls_container, 0)) > 0
    OR MAX(COALESCE(baseline_portcalls_dry_bulk, 0)) > 0
)
SELECT
  date, port, country, ROUND(lat, 4) AS lat, ROUND(lon, 4) AS lon,
  ROUND(portcalls_tanker_7d_avg, 2) AS portcalls_tanker_7d_avg,
  ROUND(portcalls_container_7d_avg, 2) AS portcalls_container_7d_avg,
  ROUND(portcalls_dry_bulk_7d_avg, 2) AS portcalls_dry_bulk_7d_avg,
  ROUND(baseline_portcalls_tanker, 2) AS baseline_portcalls_tanker,
  ROUND(baseline_portcalls_container, 2) AS baseline_portcalls_container,
  ROUND(baseline_portcalls_dry_bulk, 2) AS baseline_portcalls_dry_bulk
FROM p
WHERE port IN (SELECT port FROM active)
  AND date < DATE'2026-05-01'
