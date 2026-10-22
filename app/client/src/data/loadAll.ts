import type {
  AisCell,
  AltPort,
  ChokepointDay,
  ConflictEvent,
  Dataset,
  EventEffect,
  Freshness,
  LaneDay,
  LaneRec,
  PortDay,
  Region,
  VisibilityPoint,
} from './types';

export type RunQuery = (name: string, params: Record<string, unknown>) => Promise<unknown[]>;
type Row = Record<string, unknown>;

/** Number-like -> number; empty string, null, undefined, NaN -> null. */
function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

function coerce<T>(row: Row, numeric: string[]): T {
  const out: Row = { ...row };
  for (const k of numeric) if (k in out) out[k] = num(out[k]);
  return out as T;
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string') return v as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

const CHOKE_NUM = [
  'lat',
  'lon',
  'n_total',
  'n_tanker',
  'n_container',
  'n_dry_bulk',
  'n_total_7d_avg',
  'n_tanker_7d_avg',
  'n_container_7d_avg',
  'n_dry_bulk_7d_avg',
  'pct_of_baseline_total',
  'pct_of_baseline_tanker',
  'pct_of_baseline_container',
  'pct_of_baseline_dry_bulk',
];
const PORT_NUM = [
  'lat',
  'lon',
  'portcalls_tanker_7d_avg',
  'portcalls_container_7d_avg',
  'portcalls_dry_bulk_7d_avg',
  'baseline_portcalls_tanker',
  'baseline_portcalls_container',
  'baseline_portcalls_dry_bulk',
];

/** 100 * 7-day average / baseline; null when either is missing or the baseline is 0. */
function pctOf(avg: unknown, baseline: unknown): number | null {
  const a = num(avg);
  const b = num(baseline);
  if (a == null || b == null || b === 0) return null;
  return Math.round(1000 * (a / b) * 100) / 1000;
}

function toPort(r: Row): PortDay {
  const p = coerce<PortDay>(r, PORT_NUM);
  p.pct_of_baseline_portcalls_tanker = pctOf(p.portcalls_tanker_7d_avg, p.baseline_portcalls_tanker);
  p.pct_of_baseline_portcalls_container = pctOf(p.portcalls_container_7d_avg, p.baseline_portcalls_container);
  p.pct_of_baseline_portcalls_dry_bulk = pctOf(p.portcalls_dry_bulk_7d_avg, p.baseline_portcalls_dry_bulk);
  return p;
}
const LANE_NUM = [
  'annual_volume',
  'primary_lat',
  'primary_lon',
  'hormuz_lat',
  'hormuz_lon',
  'exit_lat',
  'exit_lon',
  'hormuz_pct',
  'primary_pct',
  'alternative_pct',
  'volume_at_risk',
];
const VIS_NUM = [
  'unique_vessels',
  'vessels_per_10k_km2',
  'visibility_vs_control',
  'vs_north_sea_channel',
  'vs_suez_east_med',
  'vs_malacca_singapore',
];
const REGION_NUM = ['lat_min', 'lon_min', 'lat_max', 'lon_max', 'area_km2'];
const CELL_NUM = ['unique_vessels', 'positions'];

const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

const EFFECTS: readonly string[] = ['down', 'up', 'context'];

/** An older ref_conflict_events has no effect or short_label; both default to null. */
function toEvent(r: Row): ConflictEvent {
  const effect = typeof r.effect === 'string' && EFFECTS.includes(r.effect) ? (r.effect as EventEffect) : null;
  const label = str(r.short_label);
  return {
    event_date: str(r.event_date) ?? '',
    event: str(r.event) ?? '',
    source_url: str(r.source_url) ?? '',
    effect,
    short_label: label?.trim() ? label : null,
  };
}

export const emptyDataset = (): Dataset => ({
  chokepoints: [],
  ports: [],
  lanes: [],
  events: [],
  visibility: [],
  regions: [],
  aisCells: [],
  recs: [],
  recsAvailable: false,
  freshness: null,
  errors: [],
});

export async function loadAll(runQuery: RunQuery, cfg: { catalog: string; schema: string }): Promise<Dataset> {
  const params = { catalog: cfg.catalog, schema: cfg.schema };
  const ds = emptyDataset();
  const get = async (name: string, optional = false): Promise<Row[] | null> => {
    try {
      return (await runQuery(name, params)) as Row[];
    } catch (e) {
      if (!optional) ds.errors.push({ query: name, message: e instanceof Error ? e.message : String(e) });
      return null;
    }
  };

  const [choke, ports1, ports2, ports3, lanes, events, vis, regions, cells, recs, fresh] = await Promise.all([
    get('chokepoints_daily'),
    get('ports_daily'),
    get('ports_daily_2'),
    get('ports_daily_3'),
    get('lane_status'),
    get('conflict_events'),
    get('ais_visibility'),
    get('ais_regions'),
    get('ais_h3_daily'),
    get('lane_recommendation', true),
    get('freshness'),
  ]);

  if (choke) ds.chokepoints = choke.map((r) => coerce<ChokepointDay>(r, CHOKE_NUM));
  // Three fixed date chunks (5 MB per-event cap); a failed chunk is reported by name.
  ds.ports = [ports1, ports2, ports3].flatMap((p) => (p ?? []).map(toPort));
  if (lanes) {
    ds.lanes = lanes.map((r) => {
      const o = coerce<LaneDay>(r, LANE_NUM);
      o.alternative_ports = parseJson<string[]>(r.alternative_ports, []) ?? [];
      const alts = parseJson<Row[]>(r.alt_ports, []) ?? [];
      o.alt_ports = alts.map((a) => coerce<AltPort>(a, ['lat', 'lon', 'pct', 'baseline']));
      return o;
    });
  }
  if (events) ds.events = events.map(toEvent);
  if (vis) ds.visibility = vis.map((r) => coerce<VisibilityPoint>(r, VIS_NUM));
  if (regions) ds.regions = regions.map((r) => coerce<Region>(r, REGION_NUM));
  if (cells) ds.aisCells = cells.map((r) => coerce<AisCell>(r, CELL_NUM));
  if (recs) {
    ds.recsAvailable = true;
    ds.recs = recs.map((r) => {
      const probs = parseJson<Record<string, unknown>>(r.action_probabilities, {}) ?? {};
      const action_probabilities: Record<string, number> = {};
      for (const [k, v] of Object.entries(probs)) {
        const n = num(v);
        if (n != null) action_probabilities[k] = n;
      }
      const o = coerce<LaneRec>(r, ['action_confidence', 'signal_quality_score']);
      o.action_probabilities = action_probabilities;
      o.shift_target = str(r.shift_target);
      o.situation = str(r.situation);
      return o;
    });
  }
  if (fresh && fresh[0]) {
    const f = fresh[0];
    const out: Freshness = {
      portwatch_chokepoints_max: str(f.chokepoint_date),
      portwatch_ports_max: str(f.port_date),
      ais_latest_sample: str(f.ais_sample_hour),
    };
    ds.freshness = out;
  }
  return ds;
}
