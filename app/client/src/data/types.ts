export type VesselType = 'tanker' | 'container' | 'dry_bulk';
export type Num = number | null;

export interface ChokepointDay {
  date: string;
  chokepoint: string;
  /** Null at runtime when the chokepoint has no reference location. */
  lat: Num;
  lon: Num;
  n_total: Num;
  n_tanker: Num;
  n_container: Num;
  n_dry_bulk: Num;
  n_total_7d_avg: Num;
  n_tanker_7d_avg: Num;
  n_container_7d_avg: Num;
  n_dry_bulk_7d_avg: Num;
  pct_of_baseline_total: Num;
  pct_of_baseline_tanker: Num;
  pct_of_baseline_container: Num;
  pct_of_baseline_dry_bulk: Num;
}

export interface PortDay {
  date: string;
  port: string;
  country: string;
  /** Null at runtime when the port has no reference location. */
  lat: Num;
  lon: Num;
  portcalls_tanker_7d_avg: Num;
  portcalls_container_7d_avg: Num;
  portcalls_dry_bulk_7d_avg: Num;
  /** Pre-war baseline calls per day; under 1 means low confidence (small baseline). */
  baseline_portcalls_tanker: Num;
  baseline_portcalls_container: Num;
  baseline_portcalls_dry_bulk: Num;
  /** Computed client-side: 100 * 7d avg / baseline; null when baseline is 0 or null. */
  pct_of_baseline_portcalls_tanker: Num;
  pct_of_baseline_portcalls_container: Num;
  pct_of_baseline_portcalls_dry_bulk: Num;
}

export type LaneStatus = 'Normal' | 'Degraded' | 'Shifted to alternative' | 'Disrupted' | 'No data';

export interface AltPort {
  port: string;
  lat: Num;
  lon: Num;
  pct: Num;
  baseline?: Num;
}

export interface LaneDay {
  date: string;
  lane_id: string;
  lane: string;
  commodity: string;
  vessel_type: VesselType;
  primary_port: string;
  alternative_ports: string[];
  alternative_route: string;
  alt_exit: string;
  annual_volume: number;
  volume_unit: 'tonnes' | 'TEU';
  primary_lat: number;
  primary_lon: number;
  hormuz_lat: number;
  hormuz_lon: number;
  exit_lat: Num;
  exit_lon: Num;
  alt_ports: AltPort[];
  hormuz_pct: Num;
  primary_pct: Num;
  alternative_pct: Num;
  status: LaneStatus;
  volume_at_risk: Num;
}

export interface ConflictEvent {
  event_date: string;
  event: string;
  source_url: string;
}

export interface VisibilityPoint {
  sample_id: string;
  sample_hour: string;
  region: string;
  label: string;
  unique_vessels: number;
  vessels_per_10k_km2: number;
  visibility_vs_control: Num;
  vs_north_sea_channel: Num;
  vs_suez_east_med: Num;
  vs_malacca_singapore: Num;
}

export interface Region {
  region: string;
  role: string;
  label: string;
  lat_min: number;
  lon_min: number;
  lat_max: number;
  lon_max: number;
  area_km2: number;
}

export interface AisCell {
  region: string;
  day: string;
  h3_res5_str: string;
  unique_vessels: number;
  positions: number;
}

export interface Freshness {
  portwatch_chokepoints_max: string | null;
  portwatch_ports_max: string | null;
  ais_latest_sample: string | null;
}

export type RecTier = 'Recommended' | 'Review' | 'Analyst' | 'Novel situation';

export interface LaneRec {
  date: string;
  lane_id: string;
  action: string;
  action_probabilities: Record<string, number>;
  action_confidence: Num;
  shift_target: string | null;
  situation: string | null;
  signal_quality_score: Num;
  tier: RecTier;
}

export interface QueryError {
  query: string;
  message: string;
}

export interface Dataset {
  chokepoints: ChokepointDay[];
  ports: PortDay[];
  lanes: LaneDay[];
  events: ConflictEvent[];
  visibility: VisibilityPoint[];
  regions: Region[];
  aisCells: AisCell[];
  recs: LaneRec[];
  recsAvailable: boolean;
  freshness: Freshness | null;
  errors: QueryError[];
}
