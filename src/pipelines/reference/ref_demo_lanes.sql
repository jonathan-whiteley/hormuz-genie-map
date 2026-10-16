CREATE OR REFRESH MATERIALIZED VIEW ref_demo_lanes
COMMENT 'Synthetic example supply lanes for a fictional company (Northwind Supply Co.). Every value is an editable demo assumption, not real customer data. Primary routes use ports inside the Strait of Hormuz; alternatives use ports or pipelines outside it.'
AS SELECT lane_id, lane, commodity, vessel_type, primary_port, 'Strait of Hormuz' AS chokepoint,
          alternative_ports, alternative_route, alt_exit, CAST(annual_volume AS DOUBLE) AS annual_volume,
          volume_unit, destination
FROM VALUES
  ('L1', 'Crude feedstock', 'Crude oil', 'tanker', 'Juaymah', ARRAY('Yanbu (King Fahd Port)'), 'East-West pipeline to the Red Sea', 'red_sea', 2000000, 'tonnes', 'Asia refineries'),
  ('L2', 'Jet fuel and diesel', 'Refined products', 'tanker', 'Jabal Az Zannah-Ruways', ARRAY('Fujairah'), 'Habshan-Fujairah pipeline to the Gulf of Oman', 'arabian_sea', 800000, 'tonnes', 'Europe and East Africa'),
  ('L3', 'LNG', 'Liquefied natural gas', 'tanker', 'Ras Laffan', CAST(ARRAY() AS ARRAY<STRING>), 'No bypass route', 'none', 1500000, 'tonnes', 'Europe and Asia utilities'),
  ('L4', 'Consumer goods and packaging', 'Containerized goods', 'container', 'Jebel Ali', ARRAY('Khor Fakkan', 'Port of Sohar', 'Salalah'), 'Transship via Gulf of Oman and Arabian Sea ports', 'arabian_sea', 40000, 'TEU', 'Gulf retail distribution'),
  ('L5', 'Containers to the Saudi east coast', 'Containerized goods', 'container', 'Dammam', ARRAY('Jeddah'), 'Red Sea port plus land bridge', 'red_sea', 15000, 'TEU', 'Saudi Eastern Province'),
  ('L6', 'Fertilizer (urea)', 'Urea', 'dry_bulk', 'Jubail', CAST(ARRAY() AS ARRAY<STRING>), 'No bypass route', 'none', 500000, 'tonnes', 'South Asia and Americas agriculture')
AS t(lane_id, lane, commodity, vessel_type, primary_port, alternative_ports, alternative_route, alt_exit, annual_volume, volume_unit, destination);
