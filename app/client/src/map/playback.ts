import { DAY, toT } from '../explore/dates';

/** About one month of data every 2 seconds: 30 days in about 2000 ms. */
export const YEAR_TICK_MS = 66;
/** Under prefers-reduced-motion: a week per step, about the same pace through the year. */
export const REDUCED_STEP_DAYS = 7;
export const REDUCED_TICK_MS = 466;

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function dayStepsBetween(start: string, end: string, stepDays: number): string[] {
  const t0 = toT(start);
  const t1 = toT(end);
  if (!(t1 > t0)) return [start.slice(0, 10)];
  const out: string[] = [];
  for (let t = t0; t < t1; t += stepDays * DAY) out.push(iso(t));
  out.push(iso(t1));
  return out;
}

export const nextIndex = (steps: string[], current: string): number => {
  const i = steps.findIndex((s) => s > current);
  return i;
};

export const startIndex = (steps: string[], current: string): number => {
  const i = nextIndex(steps, current);
  return i < 0 ? 0 : i;
};

/** Frame interval for an answer series: 1 s a frame, clamped so the whole series takes 5 to 12 s. */
export function answerTickMs(frames: number): number {
  if (frames <= 0) return 1000;
  const total = Math.min(12000, Math.max(5000, frames * 1000));
  return Math.round(total / frames);
}

/**
 * Scrub takes over: while playing, a date that is not the one playback last set came from someone
 * else (a slider drag, a tour step), so playback pauses. Before playback sets a date, nothing pauses.
 */
export const shouldPause = (playing: boolean, lastSet: string | null, date: string): boolean =>
  playing && lastSet !== null && date !== lastSet;
