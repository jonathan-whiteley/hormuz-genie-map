import { inRange, posKey } from './answerFeatures';
import {
  ROW_INDEX,
  dateColumn,
  isCoordName,
  isDateName,
  isH3Name,
  isIdName,
  missing,
  toNum,
  type GenieLayerSpec,
} from './genieLayer';

type Row = Record<string, unknown>;

export interface SeriesFrame {
  value: number | null;
  pct: number | null;
  rowIndex: number;
}

export interface SeriesPlace {
  key: string;
  name: string;
  position: [number, number];
  frames: Map<string, SeriesFrame>;
}

/** A Genie answer about places over time: one frame per place per date, in date order. */
export interface TimeSeries {
  dates: string[];
  /** Every date is the first of a month (a monthly series). */
  monthly: boolean;
  valueField: string;
  pctField: string | null;
  /** The value is a daily rate (a 7-day average, a per-day field, or n_total in a daily series), so labels say "a day". */
  perDay: boolean;
  places: SeriesPlace[];
}

const PCT = /pct|percent/i;
const PER_DAY = /7d_avg|per_day|daily/i;
const N_TOTAL = /^n_total$/i;

/** YYYY-MM-DD from a month ("2026-02"), a day or a timestamp; null for anything else. */
export function normDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

/** The count to draw as height: 7-day averages first, then n_total, then calls or transits, then any non-percent number. */
/**
 * A column that can carry a measure: outside `skip`, not synthetic, never a coordinate, an H3 id,
 * an id (id, *_id, mmsi) or a date name, and every non-missing value numeric.
 */
function measureColumn(c: string, rows: Row[], skip: string[]): boolean {
  const lc = c.toLowerCase();
  if (skip.includes(c) || c.startsWith('__')) return false;
  if (isCoordName(lc) || isH3Name(lc) || isIdName(lc) || isDateName(lc)) return false;
  const vals = rows.map((r) => r[c]).filter((v) => !missing(v));
  return vals.length > 0 && vals.every((v) => toNum(v) !== null);
}

export function seriesValueField(columns: string[], rows: Row[], skip: string[]): string | null {
  const numeric = columns.filter((c) => measureColumn(c, rows, skip));
  const nonPct = numeric.filter((c) => !PCT.test(c));
  const pick = (re: RegExp) => nonPct.find((c) => re.test(c));
  return pick(/7d_avg/i) ?? pick(/^n_total$/i) ?? pick(/calls|transits/i) ?? nonPct[0] ?? null;
}

export function timeSeriesOf(spec: GenieLayerSpec): TimeSeries | null {
  if (spec.kind !== 'points') return null;
  const rows = spec.rows;
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const dateField = dateColumn(columns, rows);
  if (!dateField) return null;
  const skip = [spec.latField, spec.lonField, dateField, ...(spec.nameField ? [spec.nameField] : [])];
  const valueField = seriesValueField(columns, rows, skip);
  if (!valueField) return null;
  const pctField = columns.find((c) => PCT.test(c) && measureColumn(c, rows, skip)) ?? null;

  const places = new Map<string, SeriesPlace>();
  const dates = new Set<string>();
  rows.forEach((r, i) => {
    const d = normDate(r[dateField]);
    const lat = toNum(r[spec.latField]);
    const lon = toNum(r[spec.lonField]);
    if (!d || lat === null || lon === null || !inRange(lat, lon)) return;
    const key = posKey([lon, lat]);
    const name = spec.nameField && r[spec.nameField] != null && r[spec.nameField] !== '' ? String(r[spec.nameField] as string) : `Place ${places.size + 1}`;
    const place: SeriesPlace = places.get(key) ?? { key, name, position: [lon, lat], frames: new Map<string, SeriesFrame>() };
    const idx = typeof r[ROW_INDEX] === 'number' ? r[ROW_INDEX] : i;
    const value = toNum(r[valueField]);
    const prev = place.frames.get(d);
    if (prev) {
      // Several rows for one place and date (a breakdown, say by vessel type) sum to the total;
      // null values are left out, the pct no longer applies and the first row stays linked.
      const sum = prev.value === null ? value : value === null ? prev.value : prev.value + value;
      place.frames.set(d, { value: sum, pct: null, rowIndex: prev.rowIndex });
    } else {
      place.frames.set(d, { value, pct: pctField ? toNum(r[pctField]) : null, rowIndex: idx });
    }
    places.set(key, place);
    dates.add(d);
  });
  const sorted = [...dates].sort();
  const list = [...places.values()].filter((p) => [...p.frames.values()].some((f) => f.value !== null));
  if (sorted.length < 2 || list.length === 0) return null;
  const monthly = sorted.every((d) => d.endsWith('-01'));
  return {
    dates: sorted,
    monthly,
    valueField,
    pctField,
    // n_total is a count per day in a daily series, but a monthly row of it is not a daily rate.
    perDay: PER_DAY.test(valueField) || (N_TOTAL.test(valueField) && !monthly),
    places: list,
  };
}

export function frameOn(series: TimeSeries, date: string) {
  let pick: string | null = null;
  for (const d of series.dates) if (d <= date) pick = d;
  const at = pick ?? series.dates[0] ?? null;
  return {
    date: at,
    values: series.places.map((place) => ({ place, frame: at ? (place.frames.get(at) ?? null) : null })),
  };
}

export function fmtFrameDate(series: TimeSeries, date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return date;
  return new Date(t).toLocaleDateString(
    'en-US',
    series.monthly ? { month: 'short', year: 'numeric', timeZone: 'UTC' } : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  );
}
