import type { ChokepointDay, LaneDay, LaneRec, VesselType, VisibilityPoint } from './types';

/** Latest row whose date is on or before `date` (ISO YYYY-MM-DD strings compare lexicographically). */
export function latestOnOrBefore<T extends { date: string }>(rows: T[], date: string): T | undefined {
  let best: T | undefined;
  for (const r of rows) {
    if (r.date <= date && (!best || r.date >= best.date)) best = r;
  }
  return best;
}

const bad = (v: number | null | undefined): v is null | undefined => v == null || Number.isNaN(v);

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (bad(v)) return 'no data';
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v: number | null | undefined): string {
  if (bad(v)) return 'no data';
  return `${Math.round(v)}%`;
}

export function hormuzOn(
  chokepoints: ChokepointDay[],
  date: string,
  vessel: VesselType | 'total'
): { transits7d: number | null; pctBaseline: number | null } {
  const row = latestOnOrBefore(
    chokepoints.filter((c) => c.chokepoint === 'Strait of Hormuz'),
    date
  );
  if (!row) return { transits7d: null, pctBaseline: null };
  const avg = `n_${vessel}_7d_avg` as keyof ChokepointDay;
  const pct = `pct_of_baseline_${vessel}` as keyof ChokepointDay;
  return { transits7d: (row[avg] as number | null) ?? null, pctBaseline: (row[pct] as number | null) ?? null };
}

export function lanesOn(lanes: LaneDay[], date: string): LaneDay[] {
  const byLane = new Map<string, LaneDay>();
  for (const l of lanes) {
    if (l.date > date) continue;
    const cur = byLane.get(l.lane_id);
    if (!cur || l.date >= cur.date) byLane.set(l.lane_id, l);
  }
  return [...byLane.values()].sort((a, b) => a.lane_id.localeCompare(b.lane_id));
}

/** Lanes whose status is 'No data' (no primary port reading on the date). */
export const noDataCount = (lanes: LaneDay[]): number => lanes.filter((l) => l.status === 'No data').length;

/** Disrupted lanes, or null when no lane has a status reading (every lane is 'No data', or there are none). */
export function disruptedCount(lanes: LaneDay[]): number | null {
  if (lanes.length === noDataCount(lanes)) return null;
  return lanes.filter((l) => l.status === 'Disrupted').length;
}

/** Volume at risk per unit; a unit is null when no lane of that unit has a value (never a silent 0). */
export function volumeAtRisk(lanes: LaneDay[]): { tonnes: number | null; teu: number | null } {
  const out: { tonnes: number | null; teu: number | null } = { tonnes: null, teu: null };
  for (const l of lanes) {
    if (bad(l.volume_at_risk)) continue;
    const k = l.volume_unit === 'TEU' ? 'teu' : 'tonnes';
    out[k] = (out[k] ?? 0) + l.volume_at_risk;
  }
  return out;
}

/** "{t} tonnes and {teu} TEU" from the units that have a non-zero value; "0 tonnes" style when all are 0; null when none. */
export function riskPhrase(risk: { tonnes: number | null; teu: number | null }): string | null {
  const units = [
    { v: risk.tonnes, label: 'tonnes' },
    { v: risk.teu, label: 'TEU' },
  ].filter((u): u is { v: number; label: string } => !bad(u.v));
  if (units.length === 0) return null;
  const nonZero = units.filter((u) => u.v > 0);
  return (nonZero.length > 0 ? nonZero : units.slice(0, 1)).map((u) => `${fmtNum(u.v)} ${u.label}`).join(' and ');
}

/** gulf_hormuz visibility_vs_control of the latest sample at or before the end of `date` (UTC). */
export function gulfVisibility(points: VisibilityPoint[], date: string): number | null {
  const end = Date.parse(`${date}T23:59:59.999Z`);
  let best: VisibilityPoint | undefined;
  let bestT = -Infinity;
  for (const p of points) {
    if (p.region !== 'gulf_hormuz') continue;
    const t = Date.parse(p.sample_hour);
    if (Number.isNaN(t) || t > end) continue;
    if (t >= bestT) {
      best = p;
      bestT = t;
    }
  }
  return best?.visibility_vs_control ?? null;
}

export function recOn(recs: LaneRec[], laneId: string, date: string): LaneRec | undefined {
  return latestOnOrBefore(
    recs.filter((r) => r.lane_id === laneId),
    date
  );
}

/**
 * Which lanes contribute to volume at risk. volume_at_risk is annual volume times the primary
 * port shortfall, so a Normal or Degraded lane running slightly under baseline also contributes.
 */
export function riskSources(lanes: LaneDay[]): string {
  const by = new Map<string, number>();
  for (const l of lanes) {
    if (l.volume_at_risk == null || Number.isNaN(l.volume_at_risk) || l.volume_at_risk <= 0) continue;
    by.set(l.status, (by.get(l.status) ?? 0) + 1);
  }
  const n = [...by.values()].reduce((a, b) => a + b, 0);
  if (n === 0) return 'no lane shortfall';
  if (by.size === 1) return `from ${n} ${[...by.keys()][0]} lane${n === 1 ? '' : 's'}`;
  const parts = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([s, c]) => `${c} ${s}`);
  return `from ${n} lanes: ${parts.join(', ')}`;
}
