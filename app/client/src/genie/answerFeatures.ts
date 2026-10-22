import { cellToLatLng, isValidCell } from 'h3-js';
import type { LaneDay } from '../data/types';
import type { GenieAnswer } from './genieClient';
import { ROW_INDEX, dateColumn, detect, nameColumn, toNum, type GenieLayerSpec } from './genieLayer';
import type { Gazetteer } from './places';

export type LngLat = [number, number];

/** One drawable piece of a Genie answer: a point, an H3 cell or a lane, linked to its table row. */
export interface AnswerFeature {
  key: string;
  /** Row in the answer table (null for lanes, which come from lane ids, not rows). */
  rowIndex: number | null;
  name: string;
  /** Formatted label value (percent when the answer has one), or null. */
  value: string | null;
  position?: LngLat;
  hexagon?: string;
  path?: LngLat[];
}

/** More features than this draw without labels (labels then show on hover). */
export const LABEL_LIMIT = 12;

type Row = Record<string, unknown>;
const PCT = /pct|percent/i;

/** The label column: the first numeric percent-named column, else the spec's value field. */
function labelField(rows: Row[], fallback: string | undefined): string | undefined {
  const first = rows[0];
  if (!first) return fallback;
  const pct = Object.keys(first).find(
    (k) => !k.startsWith('__') && PCT.test(k) && rows.some((r) => toNum(r[k]) !== null)
  );
  return pct ?? fallback;
}

/**
 * True when the row says its pre-war baseline is small: low_baseline is true, or a baseline column
 * (not a percent of baseline) is under 1 call a day. Percents on such rows are unreliable.
 */
function smallBaseline(r: Row): boolean {
  return Object.entries(r).some(([k, v]) => {
    const lc = k.toLowerCase();
    if (lc === 'low_baseline') return v === true || (typeof v === 'string' && v.trim().toLowerCase() === 'true');
    const isBaseline = lc === 'baseline' || lc.startsWith('baseline_') || lc.endsWith('_baseline');
    if (!isBaseline || PCT.test(lc)) return false;
    const n = toNum(v);
    return n !== null && n < 1;
  });
}

function fmtValue(field: string | undefined, r: Row): string | null {
  if (!field) return null;
  const n = toNum(r[field]);
  if (n === null) return null;
  if (PCT.test(field)) {
    const pct = `${Math.round(n).toLocaleString('en-US')}%`;
    return smallBaseline(r) ? `${pct} (small baseline)` : pct;
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const missing = (v: unknown) => v === null || v === undefined || v === '';

/** The row's name, or the fallback when the name cell is empty (never the text "null"). */
function nameOf(r: Row, field: string | undefined, fallback: string): string {
  const v = field ? r[field] : undefined;
  return missing(v) ? fallback : String(v as string | number | boolean);
}

/** A latitude and longitude on the globe; anything else would make MapLibre throw on fitBounds. */
export const inRange = (lat: number, lon: number) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

const rowIndexOf = (r: Row, i: number): number => {
  const v = r[ROW_INDEX];
  return typeof v === 'number' ? v : i;
};

/** lat/lon from columns named lat and lon on the row, if both are numeric. */
function rowLatLon(r: Row): LngLat | undefined {
  const keys = Object.keys(r);
  const la = keys.find((k) => k.toLowerCase() === 'lat' || k.toLowerCase() === 'latitude');
  const lo = keys.find((k) => k.toLowerCase() === 'lon' || k.toLowerCase() === 'longitude');
  const lat = la ? toNum(r[la]) : null;
  const lon = lo ? toNum(r[lo]) : null;
  return lat !== null && lon !== null && inRange(lat, lon) ? [lon, lat] : undefined;
}

/** Centre of an H3 cell as [lng, lat], or undefined for an invalid cell id. */
function cellCentroid(hex: string): LngLat | undefined {
  if (!isValidCell(hex)) return undefined;
  const [lat, lng] = cellToLatLng(hex);
  return [lng, lat];
}

/** A drawable feature plus the row it came from and where it sits, before same-place rows merge. */
interface Drawn {
  feature: AnswerFeature;
  row: Row;
  at: string;
}

/**
 * One feature per place: rows at the same position (a time series about one port, say) merge into
 * the row with the latest date in the first date column, or the last such row when there is none.
 * Features keep the order in which their place first appears.
 */
function mergeByPlace(drawn: Drawn[], dateField: string | undefined): AnswerFeature[] {
  // dateColumn only picks columns of ISO strings, which sort as text.
  const dateOf = (r: Row) => {
    const v = dateField ? r[dateField] : undefined;
    return typeof v === 'string' ? v : '';
  };
  const byPlace = new Map<string, Drawn>();
  for (const d of drawn) {
    const prev = byPlace.get(d.at);
    if (!prev) {
      byPlace.set(d.at, d);
      continue;
    }
    // Map.set on an existing key keeps the key's first-seen position.
    if (dateOf(d.row) >= dateOf(prev.row)) byPlace.set(d.at, d);
  }
  return [...byPlace.values()].map((d) => d.feature);
}

/** One key per map position (4 decimal places, about 11 m), so rows at the same place merge. */
export const posKey = ([lon, lat]: LngLat) => `${lon.toFixed(4)},${lat.toFixed(4)}`;

export function answerFeatures(spec: GenieLayerSpec, lanes: LaneDay[]): AnswerFeature[] {
  if (spec.kind === 'lanes') {
    const byId = new Map(lanes.map((l) => [l.lane_id, l]));
    return spec.laneIds.flatMap((id): AnswerFeature[] => {
      const l = byId.get(id);
      if (!l) return [];
      const pts = [
        [l.primary_lon, l.primary_lat],
        [l.hormuz_lon, l.hormuz_lat],
        [l.exit_lon, l.exit_lat],
      ].filter((p): p is LngLat => p[0] != null && p[1] != null && !Number.isNaN(p[0]) && !Number.isNaN(p[1]));
      if (pts.length < 2) return [];
      return [
        { key: `lane:${id}`, rowIndex: null, name: `${id} ${l.lane}`, value: l.status, position: pts[0], path: pts },
      ];
    });
  }

  const field = labelField(spec.rows, spec.valueField);
  const cols = spec.rows[0] ? Object.keys(spec.rows[0]).filter((k) => !k.startsWith('__')) : [];
  const dateField = dateColumn(cols, spec.rows);
  if (spec.kind === 'h3') {
    const nf = nameColumn(cols, spec.rows, [spec.hexField]);
    const drawn = spec.rows.flatMap((r, i): Drawn[] => {
      const hex = r[spec.hexField];
      if (typeof hex !== 'string') return [];
      const idx = rowIndexOf(r, i);
      const feature: AnswerFeature = {
        key: `hex:${idx}`,
        rowIndex: idx,
        name: nameOf(r, nf, `Cell ${idx + 1}`),
        value: fmtValue(field, r),
        hexagon: hex,
        position: rowLatLon(r) ?? cellCentroid(hex),
      };
      return [{ feature, row: r, at: hex }];
    });
    return mergeByPlace(drawn, dateField);
  }

  const drawn = spec.rows.flatMap((r, i): Drawn[] => {
    const lat = toNum(r[spec.latField]);
    const lon = toNum(r[spec.lonField]);
    if (lat === null || lon === null || !inRange(lat, lon)) return [];
    const idx = rowIndexOf(r, i);
    const position: LngLat = [lon, lat];
    const feature: AnswerFeature = {
      key: `row:${idx}`,
      rowIndex: idx,
      name: nameOf(r, spec.nameField, `Place ${idx + 1}`),
      value: fmtValue(field, r),
      position,
    };
    return [{ feature, row: r, at: posKey(position) }];
  });
  return mergeByPlace(drawn, dateField);
}

/**
 * The spec a reply puts on the map, or null when it draws nothing (no geo columns, coordinates all
 * missing or out of range, lane ids not among the loaded lanes). A null spec leaves the map as it is.
 */
export function mappableSpec(
  answer: GenieAnswer,
  places: Gazetteer | undefined,
  lanes: LaneDay[]
): GenieLayerSpec | null {
  const spec = detect(answer, places);
  return spec && answerFeatures(spec, lanes).length > 0 ? spec : null;
}

/** Degrees added on each side when every feature is at one point, so the camera does not zoom in to the street. */
const SINGLE_POINT_MARGIN = 1.5;

export function featureBounds(features: AnswerFeature[]): [[number, number], [number, number]] | null {
  const pts = features.flatMap((f) => [...(f.path ?? []), ...(f.position ? [f.position] : [])]);
  if (pts.length === 0) return null;
  let w = Math.min(...pts.map((p) => p[0]));
  let e = Math.max(...pts.map((p) => p[0]));
  let s = Math.min(...pts.map((p) => p[1]));
  let n = Math.max(...pts.map((p) => p[1]));
  if (w === e && s === n) {
    w -= SINGLE_POINT_MARGIN;
    e += SINGLE_POINT_MARGIN;
    s -= SINGLE_POINT_MARGIN;
    n += SINGLE_POINT_MARGIN;
  }
  const r = (x: number) => Math.round(x * 1e6) / 1e6;
  return [
    [r(w), r(s)],
    [r(e), r(n)],
  ];
}

function noun(spec: GenieLayerSpec): [string, string] {
  if (spec.kind === 'lanes') return ['lane', 'lanes'];
  if (spec.kind === 'h3') return ['cell', 'cells'];
  const nf = (spec.nameField ?? '').toLowerCase();
  if (nf.includes('chokepoint')) return ['chokepoint', 'chokepoints'];
  if (nf.includes('port')) return ['port', 'ports'];
  return ['place', 'places'];
}

/** "On the map: 2 ports", or null when nothing in the answer can be drawn. */
export function mapChipText(spec: GenieLayerSpec, features: AnswerFeature[]): string | null {
  const n = features.length;
  if (n === 0) return null;
  const [one, many] = noun(spec);
  return `On the map: ${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
