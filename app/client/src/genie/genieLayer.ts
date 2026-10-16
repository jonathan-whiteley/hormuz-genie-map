import type { GenieAnswer } from './genieClient';

type Row = Record<string, unknown>;

export type GenieLayerSpec =
  | { kind: 'h3'; hexField: string; valueField?: string; rows: Row[] }
  | { kind: 'points'; latField: string; lonField: string; valueField?: string; rows: Row[] }
  | { kind: 'lanes'; laneIds: string[] };

/** At most this many rows are drawn per Genie layer; the table says "showing N of M". */
export const MAX_LAYER_ROWS = 5000;

const missing = (v: unknown) => v === null || v === undefined || v === '';

/** A finite number, or null when the value is missing or not numeric. Numbers may arrive as strings. */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A 15-digit hex H3 cell index (mode 1, so the first digit is 8 to b). */
const H3_HEX = /^[89ab][0-9a-f]{14}$/;

/**
 * H3 ids arrive as hex strings (optionally 0x-prefixed) or as decimal BIGINT strings; deck.gl wants hex.
 * Anything that is not a valid cell index (for example an h3_resolution value of 5) is null.
 */
export function toH3Hex(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'bigint') return null;
  let s = String(v).trim().toLowerCase();
  if (s === '') return null;
  if (/^\d+$/.test(s)) {
    try {
      s = BigInt(s).toString(16);
    } catch {
      return null;
    }
  } else if (s.startsWith('0x')) {
    s = s.slice(2);
  }
  return H3_HEX.test(s) ? s : null;
}

const isH3Name = (lc: string) => lc === 'h3' || lc.endsWith('_h3') || lc.startsWith('h3');
const COORD_NAMES = new Set(['lat', 'lon', 'lng', 'latitude', 'longitude']);

/** First column whose non-null values are all numeric, never a coordinate or another h3 column. */
function valueField(columns: string[], rows: Row[], used: string[]): string | undefined {
  return columns.find((c) => {
    if (used.includes(c)) return false;
    const lc = c.toLowerCase();
    if (COORD_NAMES.has(lc) || isH3Name(lc)) return false;
    const vals = rows.map((r) => r[c]).filter((v) => !missing(v));
    return vals.length > 0 && vals.every((v) => toNum(v) !== null);
  });
}

/** Chooses how a Genie answer is drawn on the map, or null for table only. First match wins. */
export function detect(answer: GenieAnswer): GenieLayerSpec | null {
  const { columns, rows } = answer;
  const find = (pred: (lc: string) => boolean) => columns.find((c) => pred(c.toLowerCase()));

  // An h3-named column counts only when at least one row holds a valid cell index; otherwise the
  // lat/lon and lane rules still get their turn instead of an empty "On map" layer.
  const hexField = columns.find((c) => {
    const lc = c.toLowerCase();
    return (lc === 'h3' || lc.endsWith('_h3') || lc.startsWith('h3_res')) && rows.some((r) => toH3Hex(r[c]) !== null);
  });
  if (hexField) {
    const vf = valueField(columns, rows, [hexField]);
    const out = rows.slice(0, MAX_LAYER_ROWS).map((r) => ({ ...r, [hexField]: toH3Hex(r[hexField]) }));
    return { kind: 'h3', hexField, valueField: vf, rows: out };
  }

  const pairs: [string, string][] = [
    ['lat', 'lon'],
    ['latitude', 'longitude'],
  ];
  for (const [la, lo] of pairs) {
    const latField = find((c) => c === la);
    const lonField = find((c) => c === lo);
    if (latField && lonField) {
      const vf = valueField(columns, rows, [latField, lonField]);
      return { kind: 'points', latField, lonField, valueField: vf, rows: rows.slice(0, MAX_LAYER_ROWS) };
    }
  }

  const laneField = find((c) => c === 'lane_id');
  if (laneField) {
    const ids = rows
      .map((r) => r[laneField])
      .filter((v) => !missing(v))
      .map(String);
    return { kind: 'lanes', laneIds: [...new Set(ids)] };
  }
  return null;
}

/** One question in the Genie panel: its answer, how it maps, and whether it is on the map. */
export interface GenieEntry {
  id: string;
  question: string;
  loading: boolean;
  answer?: GenieAnswer;
  spec: GenieLayerSpec | null;
  on: boolean;
}

/** Most Genie layers on the map at once; turning on a sixth turns off the oldest. */
export const MAX_GENIE_LAYERS = 5;

/** Turns on one entry and, past the cap, turns off the oldest other entries that are on. Entries are newest first. */
export function turnOn(entries: GenieEntry[], id: string): GenieEntry[] {
  const next = entries.map((e) => (e.id === id ? { ...e, on: true } : e));
  const onIds = next.filter((e) => e.on && e.spec).map((e) => e.id);
  const keep = new Set([id, ...onIds.filter((x) => x !== id).slice(0, MAX_GENIE_LAYERS - 1)]);
  return next.map((e) => (e.on && !keep.has(e.id) ? { ...e, on: false } : e));
}

/** Rows shown in an answer card table; the map still gets up to MAX_LAYER_ROWS. */
export const TABLE_ROWS = 50;

/** Cell text exactly as Genie returned it; null, undefined and NaN read "no data", a real 0 stays 0. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined || v === 'NaN') return 'no data';
  if (typeof v === 'number' && Number.isNaN(v)) return 'no data';
  return typeof v === 'object' ? JSON.stringify(v) : String(v as string | number | boolean | bigint);
}

/** The question a map click on a port or chokepoint puts in the Genie input. */
export const genieQuestionFor = (name: string) => `How has ${name} changed since the war began?`;

/** One Genie answer on the map. The id is the entry id (genie-<n>), so it never changes as answers come and go. */
export interface GenieMapLayer {
  id: string;
  title: string;
  spec: GenieLayerSpec;
}

/** The answers that are on the map, newest first, each keeping its own id and named after its question. */
export const mapLayersOf = (entries: GenieEntry[]): GenieMapLayer[] =>
  entries.flatMap((e) => (e.on && e.spec ? [{ id: e.id, title: e.question, spec: e.spec }] : []));

/** "Map shows N of M rows" when a layer draws fewer rows than the result has; null otherwise. */
export function mapRowsCaption(spec: GenieLayerSpec | null, totalRows: number): string | null {
  if (!spec || spec.kind === 'lanes' || spec.rows.length >= totalRows) return null;
  const f = (n: number) => n.toLocaleString('en-US');
  return `Map shows ${f(spec.rows.length)} of ${f(totalRows)} rows`;
}
