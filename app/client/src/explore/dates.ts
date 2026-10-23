import type { Dataset } from '../data/types';

export const DAY = 86_400_000;
export const SCRUB_START = '2026-01-01';

export const toT = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

export function fmtDate(d: string): string {
  const t = toT(d);
  if (Number.isNaN(t)) return d;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "Oct 2" style label (UTC). */
export function fmtShort(d: string): string {
  const t = toT(d);
  if (Number.isNaN(t)) return d;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** First day of every month from start to end (inclusive), so ticks keep going past 2026. */
export function monthTicks(start: string, end: string): string[] {
  const out: string[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  for (;;) {
    const d = `${y}-${String(m).padStart(2, '0')}-01`;
    if (d > end || out.length > 240) break;
    if (d >= start) out.push(d);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const maxDate = (rows: { date: string }[]): string | null =>
  rows.reduce<string | null>((m, r) => (m == null || r.date > m ? r.date : m), null);

const maxDay = (days: string[]): string | null =>
  days.reduce<string | null>((m, d) => (d.length === 10 && (m == null || d > m) ? d : m), null);

/** Latest AIS day across visibility samples and vessel position days (UTC), or null before any sample. */
export function latestAisDay(ds: Dataset): string | null {
  return maxDay([
    ...ds.visibility.map((v) => String(v.sample_hour).slice(0, 10)),
    ...ds.vessels.map((v) => String(v.day).slice(0, 10)),
  ]);
}

/** Latest visibility sample day (UTC), or null. */
export const latestVisibilityDay = (ds: Dataset): string | null =>
  maxDay(ds.visibility.map((v) => String(v.sample_hour).slice(0, 10)));

/** Scrubber end: the latest of the PortWatch and AIS days, so the vessel layer is reachable. */
export function scrubEnd(ds: Dataset): string {
  return (
    [maxDate(ds.ports), maxDate(ds.chokepoints), latestAisDay(ds)]
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? SCRUB_START
  );
}
