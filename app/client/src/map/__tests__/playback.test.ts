import { describe, expect, it } from 'vitest';
import { REDUCED_STEP_DAYS, answerTickMs, dayStepsBetween, nextIndex, shouldPause, startIndex } from '../playback';

describe('dayStepsBetween', () => {
  it('lists every day from start to end inclusive', () => {
    expect(dayStepsBetween('2026-02-27', '2026-03-02', 1)).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('reduced motion steps a week and still ends on the end date', () => {
    const s = dayStepsBetween('2026-01-01', '2026-01-20', REDUCED_STEP_DAYS);
    expect(s).toEqual(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-20']);
  });

  it('returns just the start when end is before start', () => {
    expect(dayStepsBetween('2026-03-01', '2026-02-01', 1)).toEqual(['2026-03-01']);
  });
});

describe('startIndex and nextIndex', () => {
  const steps = ['2026-01-01', '2026-02-01', '2026-03-01'];

  it('play starts after the current date', () => {
    expect(startIndex(steps, '2026-01-15')).toBe(1);
    expect(startIndex(steps, '2026-02-01')).toBe(2);
  });

  it('play at the end restarts', () => {
    expect(startIndex(steps, '2026-03-01')).toBe(0);
    expect(startIndex(steps, '2026-10-21')).toBe(0);
  });

  it('nextIndex returns -1 at the end', () => {
    expect(nextIndex(steps, '2026-02-01')).toBe(2);
    expect(nextIndex(steps, '2026-03-01')).toBe(-1);
  });
});

describe('answerTickMs', () => {
  it('plays a series in 5 to 12 seconds, one second a frame when that fits', () => {
    expect(answerTickMs(10)).toBe(1000);
    expect(answerTickMs(2)).toBe(2500);
    expect(answerTickMs(300)).toBe(40);
    expect(answerTickMs(0)).toBe(1000);
  });
});

describe('shouldPause (scrub takes over)', () => {
  it('pauses when the date moves to a value playback did not set', () => {
    expect(shouldPause(true, '2026-03-01', '2026-05-10')).toBe(true);
  });

  it('keeps playing when the date is the one playback set', () => {
    expect(shouldPause(true, '2026-03-01', '2026-03-01')).toBe(false);
  });

  it('never pauses when not playing or before playback has set a date', () => {
    expect(shouldPause(false, '2026-03-01', '2026-05-10')).toBe(false);
    expect(shouldPause(true, null, '2026-05-10')).toBe(false);
  });
});
