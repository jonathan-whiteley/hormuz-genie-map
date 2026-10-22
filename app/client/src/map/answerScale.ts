import type { TimeSeries } from '../genie/timeSeries';
import { elevationOf, labelZ } from './columns';

/**
 * The most vessels a day an answer may draw at the shared base scale: about 3 times the busiest
 * pre-war chokepoint (Hormuz, about 77 a day). Anything above is not a daily rate.
 */
export const MAX_DAILY_VESSELS = 250;

/** A series drawn to its own scale puts its peak at about the pre-war Hormuz column height. */
export const RELATIVE_PEAK_VESSELS = 70;

const peaks = new WeakMap<TimeSeries, number>();

/** The largest value in the series, 0 when there is none. */
function seriesPeak(series: TimeSeries): number {
  const cached = peaks.get(series);
  if (cached !== undefined) return cached;
  let peak = 0;
  for (const p of series.places) for (const f of p.frames.values()) if (f.value !== null && Number.isFinite(f.value) && f.value > peak) peak = f.value;
  peaks.set(series, peak);
  return peak;
}

/**
 * Multiplier from a series value to vessels a day of column height. A per-day series in range keeps
 * the shared scale (1), so it matches the base columns. Anything else (a monthly sum, tonnes, a rate
 * over the ceiling) is scaled so its peak stands at RELATIVE_PEAK_VESSELS. Labels keep the real value.
 */
export function seriesHeightScale(series: TimeSeries): number {
  const peak = seriesPeak(series);
  if (series.perDay && peak <= MAX_DAILY_VESSELS) return 1;
  return peak > 0 ? RELATIVE_PEAK_VESSELS / peak : 1;
}

const scaled = (series: TimeSeries, value: number | null): number | null => (value === null ? null : value * seriesHeightScale(series));

/** Column elevation in meters at REF_ZOOM for one series value. */
export const answerElevation = (series: TimeSeries, value: number | null): number => elevationOf(scaled(series, value));

/** Altitude of the column top at this zoom, for the label on a series column. */
export const answerLabelZ = (series: TimeSeries, value: number | null, zoom: number): number => labelZ(scaled(series, value), zoom);
