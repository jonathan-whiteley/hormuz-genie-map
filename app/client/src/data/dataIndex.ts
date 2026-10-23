import type { ChokepointDay, Dataset, LaneDay, PortDay, VesselPosition } from './types';

/** Ports with a baseline under this many calls a day are not drawn and the tour copy skips them (percent unreliable). */
export const LOW_BASELINE = 1;

// ---------------------------------------------------------------------------------------------
// Index: built once per Dataset object (WeakMap), so scrubber ticks never scan the 22.8k port rows.

interface Index {
  ports: Map<string, PortDay[]>;
  chokepoints: Map<string, ChokepointDay[]>;
  lanes: Map<string, LaneDay[]>;
  vesselDays: string[];
  vesselsByDay: Map<string, VesselPosition[]>;
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
  const vesselsByDay = new Map<string, VesselPosition[]>();
  for (const v of ds.vessels) {
    const d = String(v.day).slice(0, 10);
    const arr = vesselsByDay.get(d);
    if (arr) arr.push(v);
    else vesselsByDay.set(d, [v]);
  }
  const idx: Index = {
    ports: groupSorted(ds.ports, (r) => r.port),
    chokepoints: groupSorted(ds.chokepoints, (r) => r.chokepoint),
    lanes: groupSorted(ds.lanes, (r) => r.lane_id),
    vesselDays: [...vesselsByDay.keys()].sort(),
    vesselsByDay,
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
export function latestPer<T extends { date: string }>(m: Map<string, T[]>, date: string): T[] {
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

/** Vessel positions of the latest AIS day on or before the date. */
export function vesselsOn(ds: Dataset, date: string): { day: string | null; vessels: VesselPosition[] } {
  const idx = indexOf(ds);
  const i = lastLE(idx.vesselDays, date, (d) => d);
  if (i < 0) return { day: null, vessels: [] };
  const day = idx.vesselDays[i];
  return { day, vessels: idx.vesselsByDay.get(day) ?? [] };
}

/** Latest row per chokepoint on or before the date. */
export const latestChokepoints = (ds: Dataset, date: string): ChokepointDay[] =>
  latestPer(indexOf(ds).chokepoints, date);

/** Pre-war baseline window (inclusive) used to size chokepoints by their normal traffic. */
export const BASELINE_START = '2026-01-01';
export const BASELINE_END = '2026-02-27';

const baselineCache = new WeakMap<Dataset, Map<string, number>>();

/** Mean pre-war n_total_7d_avg per chokepoint; chokepoints with no usable pre-war rows are absent. */
export function chokepointBaselines(ds: Dataset): Map<string, number> {
  const hit = baselineCache.get(ds);
  if (hit) return hit;
  const sums = new Map<string, { sum: number; n: number }>();
  for (const r of ds.chokepoints) {
    const day = r.date.slice(0, 10);
    const v = r.n_total_7d_avg;
    if (day < BASELINE_START || day > BASELINE_END || v == null || Number.isNaN(v)) continue;
    const s = sums.get(r.chokepoint) ?? { sum: 0, n: 0 };
    s.sum += v;
    s.n += 1;
    sums.set(r.chokepoint, s);
  }
  const out = new Map<string, number>();
  for (const [k, s] of sums) out.set(k, s.sum / s.n);
  baselineCache.set(ds, out);
  return out;
}
