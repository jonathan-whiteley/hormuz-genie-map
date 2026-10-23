import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../data/loadAll';
import type { VesselPosition, VisibilityPoint } from '../../data/types';
import { latestAisDay, monthTicks, scrubEnd } from '../dates';

describe('monthTicks', () => {
  it('first of each month in range', () => {
    expect(monthTicks('2026-01-01', '2026-03-15')).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });
  it('keeps going past the end of 2026', () => {
    expect(monthTicks('2026-11-01', '2027-02-01')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
  });
  it('skips a partial first month', () => {
    expect(monthTicks('2026-01-15', '2026-02-20')).toEqual(['2026-02-01']);
  });
});

describe('latestAisDay', () => {
  const vis = (h: string) => ({ region: 'gulf_hormuz', sample_hour: h }) as VisibilityPoint;
  const vessel = (day: string) => ({ region: 'gulf_hormuz', day }) as VesselPosition;
  it('null before any sample', () => expect(latestAisDay(emptyDataset())).toBeNull());
  it('max over visibility samples and vessel days, and drives the scrubber end', () => {
    const ds = { ...emptyDataset(), visibility: [vis('2026-10-13T20:00:00Z')], vessels: [vessel('2026-10-14')] };
    expect(latestAisDay(ds)).toBe('2026-10-14');
    expect(scrubEnd(ds)).toBe('2026-10-14');
    const ds2 = { ...emptyDataset(), visibility: [vis('2026-10-15T01:00:00Z')], vessels: [vessel('2026-10-14')] };
    expect(latestAisDay(ds2)).toBe('2026-10-15');
  });
});
