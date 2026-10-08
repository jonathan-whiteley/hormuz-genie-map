CREATE OR REFRESH MATERIALIZED VIEW silver_ais_positions
CLUSTER BY (region, window_start)
COMMENT 'AIS position reports from the hourly samples, assigned to a sampling region, with H3 res 5 and 7 cells. AIS not-available coordinates (lat 91, lon 181) and rows without MMSI are removed before indexing.'
AS
WITH parsed AS (
  SELECT sample_id, window_start, window_end, received_at, mmsi, message_type, parse_json(payload) AS v
  FROM ${hormuz.catalog}.${hormuz.schema}.bronze_ais_samples
  WHERE message_type IN ('PositionReport', 'StandardClassBPositionReport') AND mmsi IS NOT NULL
),
pos AS (
  SELECT *, v:MetaData.latitude::double AS lat, v:MetaData.longitude::double AS lon
  FROM parsed
),
valid AS (
  SELECT * FROM pos WHERE lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180
)
SELECT
  p.sample_id, p.window_start, p.window_end, p.received_at, p.mmsi, p.message_type,
  p.v:MetaData.ShipName::string AS ship_name,
  p.lat, p.lon,
  coalesce(p.v:Message.PositionReport.Sog, p.v:Message.StandardClassBPositionReport.Sog)::double AS sog_knots,
  coalesce(p.v:Message.PositionReport.Cog, p.v:Message.StandardClassBPositionReport.Cog)::double AS cog_deg,
  coalesce(p.v:Message.PositionReport.TrueHeading, p.v:Message.StandardClassBPositionReport.TrueHeading)::int AS true_heading,
  p.v:Message.PositionReport.NavigationalStatus::int AS nav_status,
  h3_longlatash3(p.lon, p.lat, 5) AS h3_res5,
  h3_longlatash3(p.lon, p.lat, 7) AS h3_res7,
  r.region, r.role
FROM valid p
JOIN ref_ais_regions r
  ON p.lat >= r.lat_min AND p.lat < r.lat_max AND p.lon BETWEEN r.lon_min AND r.lon_max;
