import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../data/loadAll';
import type { ChokepointDay, LaneDay } from '../../data/types';
import { headline, headlineText } from '../headline';

const choke = (date: string, pct: number): ChokepointDay =>
  ({ date, chokepoint: 'Strait of Hormuz', pct_of_baseline_total: pct, n_total_7d_avg: 4 }) as ChokepointDay;
const lane = (lane_id: string, status: LaneDay['status']): LaneDay => ({ date: '2026-10-09', lane_id, status }) as LaneDay;

describe('headline', () => {
  it('uses the latest Hormuz percent and the latest lane statuses', () => {
    const ds = {
      ...emptyDataset(),
      chokepoints: [choke('2026-10-01', 9), choke('2026-10-11', 6.1)],
      lanes: [lane('L1', 'Disrupted'), lane('L2', 'Disrupted'), lane('L3', 'Shifted to alternative')],
    };
    const h = headline(ds);
    expect(h).toEqual({ hormuzPct: 6.1, disrupted: 2, lanes: 3 });
    expect(headlineText(h)).toBe('Hormuz at 6% of normal · 2 of 3 lanes disrupted');
  });

  it('says no data before anything loads', () => {
    expect(headlineText(headline(emptyDataset()))).toBe('Hormuz: no data');
  });
});
