import type { Layer } from '@deck.gl/core';
import { ColumnLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import {
  LOW_BASELINE,
  chokepointBaselines,
  lanesOnIdx,
  latestChokepoints,
  portsOn,
  vesselsOn,
} from '../data/dataIndex';
import { fmtPct } from '../data/kpi';
import type { Dataset, LaneDay, LaneStatus, PortDay, VesselPosition, VesselType } from '../data/types';
import { NAVY, TEAL, pctColor, statusColor, type RGBA } from './colors';
import { COLUMN_RADIUS_PX, LABEL_ON_TOP, columnTransitions, elevationOf, elevationScaleFor, labelZ } from './columns';

export type LngLat = [number, number];

/** One pickable map object; the tooltip, popover and answer highlighting read these fields. */
export interface MapDatum {
  kind: 'port' | 'chokepoint' | 'lane' | 'vessel' | 'answer';
  name: string;
  position?: LngLat;
  pct?: number | null;
  value7d?: number | null;
  baseline?: number | null;
  country?: string;
  path?: LngLat[];
  status?: LaneStatus;
  laneNames?: string[];
  hexagon?: string;
  vessel?: VesselPosition;
  label?: string;
  /** Answer marks: the table row they belong to, and their feature key. */
  rowIndex?: number | null;
  key?: string;
}

export interface Toggles {
  chokepoints: boolean;
  ports: boolean;
  lanes: boolean;
  vessels: boolean;
}

/** The resting map: chokepoints only. */
export const RESTING: Toggles = { chokepoints: true, ports: false, lanes: false, vessels: false };

/** Port names show from this zoom; below it they show on hover. */
export const PORT_LABEL_ZOOM = 6;
/** Base layer opacity while a Genie answer is on the map. */
export const DIM_OPACITY = 0.35;

const FONT = 'DM Sans, system-ui, sans-serif';
const LABEL_BG: RGBA = [255, 255, 255, 235];
const isNum = (v: number | null | undefined): v is number => v != null && !Number.isNaN(v);
const pt = (lat: number | null | undefined, lon: number | null | undefined): LngLat | null =>
  isNum(lat) && isNum(lon) ? [lon, lat] : null;

const SHORT: Record<string, string> = {
  'Strait of Hormuz': 'Hormuz',
  'Bab el-Mandeb Strait': 'Bab el-Mandeb',
  'Suez Canal': 'Suez',
};
export const shortName = (name: string): string => SHORT[name] ?? name;

const TYPES: VesselType[] = ['tanker', 'container', 'dry_bulk'];

/** Total 7-day calls, total baseline and percent across the three vessel types. */
export function portTotals(p: PortDay): { value7d: number | null; baseline: number | null; pct: number | null } {
  const vals = TYPES.map((t) => p[`portcalls_${t}_7d_avg`]).filter(isNum);
  const bases = TYPES.map((t) => p[`baseline_portcalls_${t}`]).filter(isNum);
  const value7d = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  const baseline = bases.length ? bases.reduce((a, b) => a + b, 0) : null;
  const pct = isNum(value7d) && isNum(baseline) && baseline > 0 ? (100 * value7d) / baseline : null;
  return { value7d, baseline, pct };
}

/** Ports with coordinates and at least LOW_BASELINE pre-war calls a day; the rest are not drawn. */
export function visiblePorts(ds: Dataset, date: string): MapDatum[] {
  return portsOn(ds, date).flatMap((p): MapDatum[] => {
    const position = pt(p.lat, p.lon);
    const t = portTotals(p);
    if (!position || !isNum(t.baseline) || t.baseline < LOW_BASELINE) return [];
    return [{ kind: 'port', name: p.port, country: p.country, position, ...t }];
  });
}

export interface LaneSegment {
  key: string;
  from: LngLat;
  to: LngLat;
  laneIds: string[];
  names: string[];
  status: LaneStatus;
}

const RANK: Record<LaneStatus, number> = {
  Disrupted: 4,
  'Shifted to alternative': 3,
  Degraded: 2,
  Normal: 1,
  'No data': 0,
};

export function worstStatus(statuses: LaneStatus[]): LaneStatus {
  return statuses.reduce<LaneStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), 'No data');
}

const keyOf = (p: LngLat) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

/**
 * Every stretch of every lane (primary port to Hormuz, Hormuz to the exit, alternative port to the
 * exit), with identical stretches merged so a shared route draws once with all its lanes.
 */
export function laneSegments(lanes: LaneDay[]): LaneSegment[] {
  const by = new Map<string, { from: LngLat; to: LngLat; ids: string[]; names: string[]; statuses: LaneStatus[] }>();
  const add = (from: LngLat | null, to: LngLat | null, l: LaneDay) => {
    if (!from || !to) return;
    const key = `${keyOf(from)}|${keyOf(to)}`;
    const cur = by.get(key) ?? { from, to, ids: [], names: [], statuses: [] };
    if (!cur.ids.includes(l.lane_id)) {
      cur.ids.push(l.lane_id);
      cur.names.push(l.lane);
      cur.statuses.push(l.status);
    }
    by.set(key, cur);
  };
  for (const l of lanes) {
    const p = pt(l.primary_lat, l.primary_lon);
    const h = pt(l.hormuz_lat, l.hormuz_lon);
    const e = pt(l.exit_lat, l.exit_lon);
    add(p, h, l);
    add(h, e, l);
    for (const a of l.alt_ports ?? []) add(pt(a.lat, a.lon), e, l);
  }
  return [...by.entries()].map(([key, v]) => ({
    key,
    from: v.from,
    to: v.to,
    laneIds: v.ids,
    names: v.names,
    status: worstStatus(v.statuses),
  }));
}

/** A gentle quadratic curve from a to b, bowed sideways by `bend` times the distance, as steps + 1 points. */
export function curve(a: LngLat, b: LngLat, steps = 16, bend = 0.12): LngLat[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c: LngLat = [(a[0] + b[0]) / 2 - dy * bend, (a[1] + b[1]) / 2 + dx * bend];
  const out: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  out[0] = a;
  out[steps] = b;
  return out;
}

/** curve() across consecutive points of a path. */
export function curvePath(points: LngLat[]): LngLat[] {
  const out: LngLat[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const seg = curve(points[i], points[i + 1]);
    out.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return out;
}

export interface BaseArgs {
  dataset: Dataset;
  date: string;
  visible: Toggles;
  /** Integer zoom for the layer thresholds (port labels at 6). */
  zoom: number;
  /** Camera zoom rounded to ZOOM_STEP, for column heights and label altitude; defaults to `zoom`. */
  columnZoom?: number;
  dimmed: boolean;
  /** True under prefers-reduced-motion: no height transitions. */
  reducedMotion?: boolean;
  /** True while a Genie answer is on the map: the answer carries its own labels. */
  hideLabels?: boolean;
  /** Places a series answer draws itself: no base column or label there. */
  hidePlaces?: LngLat[];
}

/** A base datum within this many degrees (on both axes) of an answer place is the same place. */
export const SAME_PLACE_DEG = 0.05;

const near = (a: LngLat, b: LngLat): boolean =>
  Math.abs(a[0] - b[0]) <= SAME_PLACE_DEG && Math.abs(a[1] - b[1]) <= SAME_PLACE_DEG;

/** Drops the data whose position is one of the hidden places. */
export function withoutPlaces<T extends { position?: LngLat }>(data: T[], hide: LngLat[]): T[] {
  if (hide.length === 0) return data;
  return data.filter((d) => !d.position || !hide.some((h) => near(h, d.position as LngLat)));
}

export function buildBaseLayers({
  dataset: ds,
  date,
  visible,
  zoom,
  columnZoom = zoom,
  dimmed,
  reducedMotion = false,
  hideLabels = false,
  hidePlaces = [],
}: BaseArgs): Layer[] {
  const opacity = dimmed ? DIM_OPACITY : 1;
  const layers: Layer[] = [];

  if (visible.lanes) {
    const segs = laneSegments(lanesOnIdx(ds, date));
    layers.push(
      new PathLayer<MapDatum>({
        id: 'lanes',
        data: segs.map((s) => ({
          kind: 'lane',
          name: s.names.length === 1 ? s.names[0] : `${s.names.length} lanes`,
          laneNames: s.names,
          status: s.status,
          path: curve(s.from, s.to),
        })),
        opacity,
        getPath: (d) => d.path ?? [],
        getColor: (d) => statusColor(d.status),
        getWidth: (d) => Math.min(6, 1.5 + (d.laneNames?.length ?? 1)),
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        pickable: true,
      })
    );
  }

  if (visible.vessels) {
    const { vessels } = vesselsOn(ds, date);
    layers.push(
      new ScatterplotLayer<MapDatum>({
        id: 'vessels',
        data: vessels.map((v) => ({
          kind: 'vessel',
          name: v.ship_name ?? `MMSI ${v.mmsi}`,
          position: [v.lon, v.lat],
          vessel: v,
        })),
        opacity,
        getPosition: (d) => d.position ?? [0, 0],
        radiusUnits: 'pixels',
        getRadius: 3,
        getFillColor: [...TEAL, 220],
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 0.75,
        getLineColor: [255, 255, 255, 230],
        pickable: true,
      })
    );
  }

  if (visible.ports) {
    const ports = withoutPlaces(visiblePorts(ds, date), hidePlaces);
    layers.push(
      new ColumnLayer<MapDatum>({
        id: 'ports',
        data: ports,
        opacity,
        diskResolution: 12,
        radius: COLUMN_RADIUS_PX.port,
        radiusUnits: 'pixels',
        extruded: true,
        flatShading: true,
        elevationScale: elevationScaleFor(columnZoom),
        getPosition: (d) => d.position ?? [0, 0],
        getElevation: (d) => elevationOf(d.value7d),
        getFillColor: (d) => pctColor(d.pct ?? null),
        transitions: columnTransitions(reducedMotion),
        pickable: true,
      })
    );
    if (zoom >= PORT_LABEL_ZOOM && !hideLabels) {
      layers.push(
        new TextLayer<MapDatum>({
          id: 'port-labels',
          data: ports,
          opacity,
          getPosition: (d) => [...(d.position ?? [0, 0]), labelZ(d.value7d, columnZoom)],
          getText: (d) => d.name,
          getColor: [...NAVY, 230],
          getSize: 11,
          fontFamily: FONT,
          characterSet: 'auto',
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'bottom',
          getPixelOffset: [0, -10],
          background: true,
          getBackgroundColor: [255, 255, 255, 200],
          backgroundPadding: [3, 1],
          parameters: LABEL_ON_TOP,
        })
      );
    }
  }

  if (visible.chokepoints) {
    const baselines = chokepointBaselines(ds);
    const all: MapDatum[] = latestChokepoints(ds, date).flatMap((c): MapDatum[] => {
      const position = pt(c.lat, c.lon);
      if (!position) return [];
      const v = c.n_total_7d_avg;
      const p = c.pct_of_baseline_total;
      // No pre-war rows: fall back to today's 7-day value divided by its percent of baseline.
      const ratio = isNum(v) && isNum(p) && p > 0 ? (100 * v) / p : null;
      return [
        {
          kind: 'chokepoint',
          name: c.chokepoint,
          position,
          value7d: c.n_total_7d_avg,
          pct: c.pct_of_baseline_total,
          baseline: baselines.get(c.chokepoint) ?? ratio,
          label: `${shortName(c.chokepoint)} ${fmtPct(c.pct_of_baseline_total)}`,
        },
      ];
    });
    const data = withoutPlaces(all, hidePlaces);
    layers.push(
      new ColumnLayer<MapDatum>({
        id: 'chokepoints',
        data,
        opacity,
        diskResolution: 16,
        radius: COLUMN_RADIUS_PX.chokepoint,
        radiusUnits: 'pixels',
        extruded: true,
        flatShading: true,
        elevationScale: elevationScaleFor(columnZoom),
        getPosition: (d) => d.position ?? [0, 0],
        getElevation: (d) => elevationOf(d.value7d),
        getFillColor: (d) => pctColor(d.pct ?? null),
        transitions: columnTransitions(reducedMotion),
        pickable: true,
      })
    );
    if (!hideLabels) {
      layers.push(
        new TextLayer<MapDatum>({
          id: 'chokepoint-labels',
          data,
          opacity,
          getPosition: (d) => [...(d.position ?? [0, 0]), labelZ(d.value7d, columnZoom)],
          getText: (d) => d.label ?? d.name,
          getColor: [...NAVY, 255],
          getSize: 13,
          fontFamily: FONT,
          fontWeight: 500,
          characterSet: 'auto',
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'bottom',
          getPixelOffset: [0, -10],
          background: true,
          getBackgroundColor: LABEL_BG,
          backgroundPadding: [6, 3],
          parameters: LABEL_ON_TOP,
        })
      );
    }
  }
  return layers;
}
