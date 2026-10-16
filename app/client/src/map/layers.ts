import type { Layer } from '@deck.gl/core';
import { PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { CollisionFilterExtension } from '@deck.gl/extensions';
import { fmtPct, recOn } from '../data/kpi';
import type {
  AisCell,
  ChokepointDay,
  Dataset,
  LaneDay,
  LaneStatus,
  PortDay,
  VesselType,
  VisibilityPoint,
} from '../data/types';
import { recText } from '../decisions/series';
import { toNum, type GenieMapLayer } from '../genie/genieLayer';
import { LAVA, NAVY, pctColor, statusColor, type RGBA } from './colors';

export type Vessel = VesselType | 'total';

export interface LayerToggles {
  chokepoints: boolean;
  ports: boolean;
  lanes: boolean;
  aisCells: boolean;
  regions: boolean;
  genie: boolean;
}

export const ALL_ON: LayerToggles = {
  chokepoints: true,
  ports: true,
  lanes: true,
  aisCells: true,
  regions: true,
  genie: true,
};

export type LngLat = [number, number];

/** One pickable map object; the tooltip and onPick read these fields. */
export interface MapDatum {
  kind: 'port' | 'chokepoint' | 'lane' | 'ais' | 'region' | 'genie';
  name: string;
  position?: LngLat;
  country?: string;
  value7d?: number | null;
  pct?: number | null;
  baseline?: number | null;
  lowBaseline?: boolean;
  laneId?: string;
  path?: LngLat[];
  status?: LaneStatus;
  highlighted?: boolean;
  recText?: string | null;
  hexagon?: string;
  vessels?: number;
  alpha?: number;
  polygon?: LngLat[];
  label?: string;
}

export interface BuildArgs {
  dataset: Dataset;
  date: string;
  vessel: Vessel;
  visible: LayerToggles;
  highlightLaneIds?: string[];
  /** Genie answers that are on, each with its stable id (genie-<n>) and its question as title. */
  genieLayers?: GenieMapLayer[];
}

/** Ports with a baseline under this many calls a day get no percent color (small baseline, percent unreliable). */
export const LOW_BASELINE = 1;

const isNum = (v: number | null | undefined): v is number => v != null && !Number.isNaN(v);

export function portMetric(
  p: PortDay,
  vessel: Vessel
): { value7d: number | null; baseline: number | null; pct: number | null; lowBaseline: boolean } {
  let value7d: number | null;
  let baseline: number | null;
  let pct: number | null;
  if (vessel === 'total') {
    const types: VesselType[] = ['tanker', 'container', 'dry_bulk'];
    const vals = types.map((t) => p[`portcalls_${t}_7d_avg`]).filter(isNum);
    const bases = types.map((t) => p[`baseline_portcalls_${t}`]).filter(isNum);
    value7d = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    baseline = bases.length ? bases.reduce((a, b) => a + b, 0) : null;
    pct = isNum(value7d) && isNum(baseline) && baseline > 0 ? (100 * value7d) / baseline : null;
  } else {
    value7d = p[`portcalls_${vessel}_7d_avg`];
    baseline = p[`baseline_portcalls_${vessel}`];
    pct = p[`pct_of_baseline_portcalls_${vessel}`];
  }
  const lowBaseline = isNum(baseline) && baseline < LOW_BASELINE;
  return { value7d, baseline, pct, lowBaseline };
}

/** Chokepoint and port marker radius in pixels; a missing value counts as 0. */
export const markerRadius = (v: number | null | undefined): number => 6 + 2.5 * Math.sqrt(isNum(v) && v > 0 ? v : 0);

// ---------------------------------------------------------------------------------------------
// Index: built once per Dataset object (WeakMap), so scrubber ticks never scan the 22.8k port rows.

interface Index {
  ports: Map<string, PortDay[]>;
  chokepoints: Map<string, ChokepointDay[]>;
  lanes: Map<string, LaneDay[]>;
  aisDays: string[];
  aisByDay: Map<string, AisCell[]>;
  visByRegion: Map<string, { t: number; v: VisibilityPoint }[]>;
}

const cache = new WeakMap<Dataset, Index>();

function groupSorted<T extends { date: string }>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  return m;
}

export function indexOf(ds: Dataset): Index {
  const hit = cache.get(ds);
  if (hit) return hit;
  const aisByDay = new Map<string, AisCell[]>();
  for (const c of ds.aisCells) {
    const d = String(c.day).slice(0, 10);
    const arr = aisByDay.get(d);
    if (arr) arr.push(c);
    else aisByDay.set(d, [c]);
  }
  const visByRegion = new Map<string, { t: number; v: VisibilityPoint }[]>();
  for (const v of ds.visibility) {
    const t = Date.parse(v.sample_hour);
    if (Number.isNaN(t)) continue;
    const arr = visByRegion.get(v.region);
    if (arr) arr.push({ t, v });
    else visByRegion.set(v.region, [{ t, v }]);
  }
  for (const arr of visByRegion.values()) arr.sort((a, b) => a.t - b.t);
  const idx: Index = {
    ports: groupSorted(ds.ports, (r) => r.port),
    chokepoints: groupSorted(ds.chokepoints, (r) => r.chokepoint),
    lanes: groupSorted(ds.lanes, (r) => r.lane_id),
    aisDays: [...aisByDay.keys()].sort(),
    aisByDay,
    visByRegion,
  };
  cache.set(ds, idx);
  return idx;
}

/** Index of the last element whose key is <= target in a sorted array, or -1. */
function lastLE<T>(arr: T[], target: string | number, key: (x: T) => string | number): number {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) <= target) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function onOrBefore<T extends { date: string }>(sorted: T[], date: string): T | undefined {
  const i = lastLE(sorted, date, (r) => r.date);
  return i < 0 ? undefined : sorted[i];
}

/** Latest row per key on or before the date. */
function latestPer<T extends { date: string }>(m: Map<string, T[]>, date: string): T[] {
  const out: T[] = [];
  for (const arr of m.values()) {
    const r = onOrBefore(arr, date);
    if (r) out.push(r);
  }
  return out;
}

export const portsOn = (ds: Dataset, date: string): PortDay[] => latestPer(indexOf(ds).ports, date);
export const lanesOnIdx = (ds: Dataset, date: string): LaneDay[] =>
  latestPer(indexOf(ds).lanes, date).sort((a, b) => a.lane_id.localeCompare(b.lane_id));

export function aisCellsOn(ds: Dataset, date: string): { day: string | null; cells: AisCell[] } {
  const idx = indexOf(ds);
  const i = lastLE(idx.aisDays, date, (d) => d);
  if (i < 0) return { day: null, cells: [] };
  const day = idx.aisDays[i];
  return { day, cells: idx.aisByDay.get(day) ?? [] };
}

export function visibilityOn(ds: Dataset, region: string, date: string): VisibilityPoint | undefined {
  const arr = indexOf(ds).visByRegion.get(region);
  if (!arr) return undefined;
  const i = lastLE(arr, Date.parse(`${date}T23:59:59.999Z`), (x) => x.t);
  return i < 0 ? undefined : arr[i].v;
}

// ---------------------------------------------------------------------------------------------

const lanePt = (lat: number | null, lon: number | null): LngLat | null =>
  isNum(lat) && isNum(lon) ? [lon, lat] : null;

export function buildLayers(args: BuildArgs): Layer[] {
  const { dataset: ds, date, vessel, visible } = args;
  const genie = visible.genie ? (args.genieLayers ?? []) : [];
  const genieLanes = new Set<string>();
  for (const g of genie) if (g.spec.kind === 'lanes') for (const id of g.spec.laneIds) genieLanes.add(id);
  const highlight = new Set([...(args.highlightLaneIds ?? []), ...genieLanes]);
  const layers: Layer[] = [];

  if (visible.regions && ds.regions.length) {
    const regions: MapDatum[] = ds.regions.map((r) => {
      const vis = visibilityOn(ds, r.region, date)?.visibility_vs_control ?? null;
      return {
        kind: 'region',
        name: r.label,
        pct: isNum(vis) ? 100 * vis : null,
        label: `${r.label}: ${fmtPct(isNum(vis) ? 100 * vis : null)}`,
        position: [r.lon_min + 0.15, r.lat_max - 0.15],
        polygon: [
          [r.lon_min, r.lat_min],
          [r.lon_max, r.lat_min],
          [r.lon_max, r.lat_max],
          [r.lon_min, r.lat_max],
        ],
      };
    });
    layers.push(
      new PolygonLayer<MapDatum>({
        id: 'regions',
        data: regions,
        getPolygon: (d) => d.polygon ?? [],
        stroked: true,
        filled: true,
        getFillColor: [...NAVY, 10],
        getLineColor: [...NAVY, 200],
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        pickable: true,
      }),
      new TextLayer<MapDatum>({
        id: 'regions-labels',
        data: regions,
        getPosition: (d) => d.position ?? [0, 0],
        getText: (d) => d.label ?? '',
        getColor: [...NAVY, 255],
        getSize: 12,
        fontFamily: 'DM Sans, system-ui, sans-serif',
        fontWeight: 500,
        getTextAnchor: 'start',
        getAlignmentBaseline: 'top',
        background: true,
        getBackgroundColor: [249, 247, 244, 220],
        backgroundPadding: [4, 2],
        // Labels that would overlap (Red Sea, Suez, the Gulf at world zoom) hide instead of colliding.
        extensions: [new CollisionFilterExtension()],
      })
    );
  }

  if (visible.aisCells) {
    const { cells } = aisCellsOn(ds, date);
    const max = cells.reduce((m, c) => Math.max(m, c.unique_vessels || 0), 0) || 1;
    const data: MapDatum[] = cells.map((c) => ({
      kind: 'ais',
      name: c.h3_res5_str,
      hexagon: c.h3_res5_str,
      vessels: c.unique_vessels,
      alpha: Math.round(90 + 160 * Math.min(1, (c.unique_vessels || 0) / max)),
    }));
    layers.push(
      new H3HexagonLayer<MapDatum>({
        id: 'ais-cells',
        data,
        getHexagon: (d) => d.hexagon ?? '',
        extruded: false,
        stroked: false,
        filled: true,
        // Navy, alpha by vessels heard: Lava stays for the 0% ramp end, Disrupted lanes and Genie outlines.
        getFillColor: (d): RGBA => [...NAVY, d.alpha ?? 90],
        pickable: true,
      })
    );
  }

  // With the lanes toggle off, a Genie lanes answer still draws its own lanes (and only those).
  if (visible.lanes || genieLanes.size > 0) {
    const all = lanesOnIdx(ds, date);
    const lanes = visible.lanes ? all : all.filter((l) => genieLanes.has(l.lane_id));
    const primary: MapDatum[] = [];
    const alt: MapDatum[] = [];
    for (const l of lanes) {
      const p = lanePt(l.primary_lat, l.primary_lon);
      const h = lanePt(l.hormuz_lat, l.hormuz_lon);
      const exit = lanePt(l.exit_lat, l.exit_lon);
      const rec = ds.recsAvailable ? recOn(ds.recs, l.lane_id, date) : undefined;
      const base = {
        kind: 'lane' as const,
        name: l.lane,
        laneId: l.lane_id,
        status: l.status,
        pct: l.hormuz_pct,
        value7d: l.volume_at_risk,
        label: l.volume_unit,
        highlighted: highlight.has(l.lane_id),
        recText: rec ? recText(rec) : null,
      };
      const path = [p, h, exit].filter((x): x is LngLat => x !== null);
      if (path.length >= 2) primary.push({ ...base, path });
      if (exit) {
        for (const a of l.alt_ports ?? []) {
          const ap = lanePt(a.lat, a.lon);
          if (ap) alt.push({ ...base, name: `${l.lane} via ${a.port}`, path: [ap, exit] });
        }
      }
    }
    const common = {
      getPath: (d: MapDatum) => d.path ?? [],
      getColor: (d: MapDatum) => statusColor(d.status),
      getWidth: (d: MapDatum) => (d.highlighted ? 6 : 3),
      widthUnits: 'pixels' as const,
      capRounded: true,
      jointRounded: true,
      pickable: true,
    };
    layers.push(
      new PathLayer<MapDatum>({ id: 'lanes-alt', data: alt, ...common }),
      new PathLayer<MapDatum>({ id: 'lanes-primary', data: primary, ...common })
    );
  }

  if (visible.ports) {
    // A row without coordinates is skipped, so nothing draws at (0, 0).
    const data: MapDatum[] = portsOn(ds, date).flatMap((p): MapDatum[] => {
      const position = lanePt(p.lat, p.lon);
      return position ? [{ kind: 'port', name: p.port, country: p.country, position, ...portMetric(p, vessel) }] : [];
    });
    layers.push(
      new ScatterplotLayer<MapDatum>({
        id: 'ports',
        data,
        getPosition: (d) => d.position ?? [0, 0],
        getRadius: (d) => markerRadius(d.value7d),
        radiusUnits: 'pixels',
        getFillColor: (d) => pctColor(d.lowBaseline ? null : (d.pct ?? null)),
        stroked: true,
        getLineColor: [255, 255, 255, 220],
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        pickable: true,
      })
    );
  }

  if (visible.chokepoints) {
    const data: MapDatum[] = latestPer(indexOf(ds).chokepoints, date).flatMap((c): MapDatum[] => {
      const position = lanePt(c.lat, c.lon);
      if (!position) return [];
      return [
        {
          kind: 'chokepoint',
          name: c.chokepoint,
          position,
          value7d: c[`n_${vessel}_7d_avg`],
          pct: c[`pct_of_baseline_${vessel}`],
        },
      ];
    });
    layers.push(
      new ScatterplotLayer<MapDatum>({
        id: 'chokepoints',
        data,
        getPosition: (d) => d.position ?? [0, 0],
        getRadius: (d) => markerRadius(d.value7d),
        radiusUnits: 'pixels',
        getFillColor: (d) => pctColor(d.pct ?? null),
        stroked: true,
        getLineColor: [...NAVY, 255],
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        pickable: true,
      })
    );
  }

  // Oldest first, so the newest answer draws on top. Ids come from the entry, never from the position.
  for (const g of [...genie].reverse()) {
    const layer = genieLayer(g);
    if (layer) layers.push(layer);
  }
  return layers;
}

/** 0..1 position of each value between the column's min and max; 1 when there is no spread or no value field. */
function scaler(rows: Record<string, unknown>[], field: string | undefined): (r: Record<string, unknown>) => number {
  if (!field) return () => 1;
  const vals = rows.map((r) => toNum(r[field])).filter((v): v is number => v !== null);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return (r) => {
    const v = toNum(r[field]);
    if (v === null || !(max > min)) return 1;
    return (v - min) / (max - min);
  };
}

/** Tooltip detail line: the row's first text value (a port name, say), then the value field as returned. */
function genieLabel(r: Record<string, unknown>, skip: string[], field: string | undefined): string {
  const nameKey = Object.keys(r).find(
    (k) => !skip.includes(k) && k !== field && typeof r[k] === 'string' && toNum(r[k]) === null
  );
  const head = nameKey ? String(r[nameKey]) : '';
  const value = field ? `${field} ${fmtGenie(r[field])}` : '';
  return head && value ? `${head}: ${value}` : head || value;
}
const fmtGenie = (v: unknown) => {
  const n = toNum(v);
  return n === null ? 'no data' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

/** Genie answer layer: h3 cells in Lava (alpha by value) or Navy points (radius by value). Lanes only highlight. */
function genieLayer({ id, title, spec: g }: GenieMapLayer): Layer | null {
  if (g.kind === 'h3') {
    const t = scaler(g.rows, g.valueField);
    const data: MapDatum[] = g.rows
      .filter((r) => typeof r[g.hexField] === 'string')
      .map((r) => ({
        kind: 'genie',
        name: title,
        hexagon: String(r[g.hexField]),
        alpha: Math.round(70 + 170 * t(r)),
        label: genieLabel(r, [g.hexField], g.valueField),
      }));
    return new H3HexagonLayer<MapDatum>({
      id,
      data,
      getHexagon: (d) => d.hexagon ?? '',
      extruded: false,
      stroked: true,
      getLineColor: [...LAVA, 255],
      lineWidthUnits: 'pixels',
      getLineWidth: 1,
      filled: true,
      getFillColor: (d): RGBA => [...LAVA, d.alpha ?? 70],
      pickable: true,
    });
  }
  if (g.kind === 'points') {
    const t = scaler(g.rows, g.valueField);
    const data: MapDatum[] = [];
    for (const r of g.rows) {
      const lat = toNum(r[g.latField]);
      const lon = toNum(r[g.lonField]);
      if (lat === null || lon === null) continue;
      data.push({
        kind: 'genie',
        name: title,
        position: [lon, lat],
        value7d: 5 + 13 * Math.sqrt(t(r)),
        label: genieLabel(r, [g.latField, g.lonField], g.valueField),
      });
    }
    return new ScatterplotLayer<MapDatum>({
      id,
      data,
      getPosition: (d) => d.position ?? [0, 0],
      getRadius: (d) => d.value7d ?? 5,
      radiusUnits: 'pixels',
      getFillColor: [...NAVY, 220],
      stroked: true,
      getLineColor: [...LAVA, 255],
      lineWidthUnits: 'pixels',
      getLineWidth: 2,
      pickable: true,
    });
  }
  return null;
}
