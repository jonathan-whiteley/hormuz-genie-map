import { describe, expect, it } from 'vitest';
import { SERIES_DATE_START, seriesDate } from '../seriesDate';

const series = (id: string) => ({ id, series: true });
const flat = (id: string) => ({ id, series: false });

describe('seriesDate', () => {
  it('saves the date from before a series answer and restores it when the answer is cleared', () => {
    const on = seriesDate(SERIES_DATE_START, series('a'), '2026-06-01');
    expect(on).toEqual({ state: { id: 'a', saved: '2026-06-01' }, restore: null });
    expect(seriesDate(on.state, null, '2026-10-01')).toEqual({ state: SERIES_DATE_START, restore: { date: '2026-06-01' } });
  });

  it('restores null (the latest day) when the reader had not picked a date', () => {
    const on = seriesDate(SERIES_DATE_START, series('a'), null);
    expect(seriesDate(on.state, null, '2026-10-01').restore).toEqual({ date: null });
  });

  it('a slider drag during the answer does not change the saved date', () => {
    const on = seriesDate(SERIES_DATE_START, series('a'), '2026-06-01');
    // Same answer, any later date: nothing changes.
    const drag = seriesDate(on.state, series('a'), '2026-03-15');
    expect(drag).toEqual({ state: on.state, restore: null });
    expect(seriesDate(drag.state, null, '2026-03-15').restore).toEqual({ date: '2026-06-01' });
  });

  it('a non-series answer replacing a series restores the date', () => {
    const on = seriesDate(SERIES_DATE_START, series('a'), '2026-06-01');
    expect(seriesDate(on.state, flat('b'), '2026-10-01')).toEqual({
      state: SERIES_DATE_START,
      restore: { date: '2026-06-01' },
    });
  });

  it('a series replacing a series keeps the first saved date', () => {
    const a = seriesDate(SERIES_DATE_START, series('a'), '2026-06-01');
    const b = seriesDate(a.state, series('b'), '2026-04-01');
    expect(b).toEqual({ state: { id: 'b', saved: '2026-06-01' }, restore: null });
    expect(seriesDate(b.state, null, '2026-10-01').restore).toEqual({ date: '2026-06-01' });
  });

  it('non-series answers alone never touch the date', () => {
    expect(seriesDate(SERIES_DATE_START, flat('b'), '2026-06-01')).toEqual({ state: SERIES_DATE_START, restore: null });
    expect(seriesDate(SERIES_DATE_START, null, '2026-06-01')).toEqual({ state: SERIES_DATE_START, restore: null });
  });
});
