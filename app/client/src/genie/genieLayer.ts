import type { GenieAnswer } from './genieClient';
import { lookupPlace, type Gazetteer } from './places';

type Row = Record<string, unknown>;

export type GenieLayerSpec =
  | { kind: 'h3'; hexField: string; valueField?: string; rows: Row[] }
  | { kind: 'points'; latField: string; lonField: string; valueField?: string; nameField?: string; rows: Row[] }
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

/** Synthetic fields added to rows placed by name, and the original row index for table linking. */
export const PLACE_LAT = '__place_lat';
export const PLACE_LON = '__place_lon';
export const ROW_INDEX = '__row';

/** An ISO date or timestamp string: 2026-03-02, 2026-03, 2026-03-02T00:00:00Z or 2026-03-02 00:00:00. */
const ISO_DATE = /^\d{4}-\d{2}(-\d{2})?([T ]\d{2}:\d{2}.*)?$/;
const DATE_NAMES = new Set(['date', 'day', 'week', 'month', 'year']);
const isIdName = (lc: string) => lc === 'id' || lc.endsWith('_id');

/** First column whose non-null values are all ISO dates or timestamps, so rows can be ordered by time. */
export function dateColumn(columns: string[], rows: Row[]): string | undefined {
  return columns.find((c) => {
    const vals = rows.map((r) => r[c]).filter((v) => !missing(v));
    return vals.length > 0 && vals.every((v) => typeof v === 'string' && ISO_DATE.test(v.trim()));
  });
}

/**
 * The column that names each mark: non-numeric strings, outside `skip`, never a date, a timestamp
 * or an id (lane_id, *_id). With a gazetteer, the column with the most port or chokepoint names wins
 * (ties go to the earlier column); otherwise, or when nothing matches, the first such column.
 */
export function nameColumn(columns: string[], rows: Row[], skip: string[], places?: Gazetteer): string | undefined {
  const dates = new Set(columns.filter((c) => dateColumn([c], rows) !== undefined));
  const candidates = columns.filter((c) => {
    const lc = c.toLowerCase();
    if (skip.includes(c) || dates.has(c) || DATE_NAMES.has(lc) || isIdName(lc)) return false;
    const vals = rows.map((r) => r[c]).filter((v) => !missing(v));
    return vals.length > 0 && vals.every((v) => typeof v === 'string' && toNum(v) === null);
  });
  if (places && places.size > 0) {
    let best: { col: string; n: number } | null = null;
    for (const col of candidates) {
      const n = rows.filter((r) => lookupPlace(places, r[col]) !== null).length;
      if (n > (best?.n ?? 0)) best = { col, n };
    }
    if (best) return best.col;
  }
  return candidates[0];
}

/**
 * Chooses how a Genie answer is drawn on the map, or null for table only. First match wins:
 * lat/lon pairs, then H3 cells, then place names (needs `places`), then lane ids. Coordinates come
 * first because Genie often returns an h3_res7 column next to lat/lon for ports and chokepoints;
 * AIS-cell answers have no lat/lon and still draw as cells. Places come before lanes because port
 * answers often carry a lane_id column too.
 */
export function detect(answer: GenieAnswer, places?: Gazetteer): GenieLayerSpec | null {
  const { columns, rows } = answer;
  const find = (pred: (lc: string) => boolean) => columns.find((c) => pred(c.toLowerCase()));

  const pairs: [string, string][] = [
    ['lat', 'lon'],
    ['latitude', 'longitude'],
  ];
  for (const [la, lo] of pairs) {
    const latField = find((c) => c === la);
    const lonField = find((c) => c === lo);
    if (latField && lonField) {
      const vf = valueField(columns, rows, [latField, lonField]);
      // H3 columns are skipped so a hex id never labels a point.
      const nf = nameColumn(
        columns,
        rows,
        [latField, lonField, ...columns.filter((c) => isH3Name(c.toLowerCase()))],
        places
      );
      return { kind: 'points', latField, lonField, valueField: vf, nameField: nf, rows: rows.slice(0, MAX_LAYER_ROWS) };
    }
  }

  // An h3-named column counts only when at least one row holds a valid cell index; otherwise the
  // place and lane rules still get their turn instead of an empty "On map" layer.
  const hexField = columns.find((c) => {
    const lc = c.toLowerCase();
    return (lc === 'h3' || lc.endsWith('_h3') || lc.startsWith('h3_res')) && rows.some((r) => toH3Hex(r[c]) !== null);
  });
  if (hexField) {
    const vf = valueField(columns, rows, [hexField]);
    const out = rows.slice(0, MAX_LAYER_ROWS).map((r) => ({ ...r, [hexField]: toH3Hex(r[hexField]) }));
    return { kind: 'h3', hexField, valueField: vf, rows: out };
  }

  // The column with the most rows naming a known place wins (ties go to the earlier column), so a
  // country column that happens to name one port never beats the port column.
  if (places && places.size > 0) {
    let best: { col: string; matched: Row[] } | null = null;
    for (const col of columns) {
      const matched: Row[] = [];
      rows.forEach((r, i) => {
        const p = lookupPlace(places, r[col]);
        if (p) matched.push({ ...r, [PLACE_LAT]: p.lat, [PLACE_LON]: p.lon, [ROW_INDEX]: i });
      });
      if (matched.length > (best?.matched.length ?? 0)) best = { col, matched };
    }
    if (best) {
      const vf = valueField(columns, rows, [best.col]);
      return {
        kind: 'points',
        latField: PLACE_LAT,
        lonField: PLACE_LON,
        valueField: vf,
        nameField: best.col,
        rows: best.matched.slice(0, MAX_LAYER_ROWS),
      };
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

/** Rows shown in a reply's answer table; the map still gets up to MAX_LAYER_ROWS. */
export const TABLE_ROWS = 50;

/** Cell text exactly as Genie returned it; null, undefined and NaN read "no data", a real 0 stays 0. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined || v === 'NaN') return 'no data';
  if (typeof v === 'number' && Number.isNaN(v)) return 'no data';
  return typeof v === 'object' ? JSON.stringify(v) : String(v as string | number | boolean | bigint);
}

/** The question a map click on a port or chokepoint puts in the Genie input. */
export const genieQuestionFor = (name: string) => `How has ${name} changed since the war began?`;

/** "Map shows N of M rows" when a layer draws fewer rows than the result has; null otherwise. */
export function mapRowsCaption(spec: GenieLayerSpec | null, totalRows: number): string | null {
  if (!spec || spec.kind === 'lanes' || spec.rows.length >= totalRows) return null;
  const f = (n: number) => n.toLocaleString('en-US');
  return `Map shows ${f(spec.rows.length)} of ${f(totalRows)} rows`;
}
