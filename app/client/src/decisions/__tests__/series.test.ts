import { describe, expect, it } from 'vitest';
import type { LaneRec } from '../../data/types';
import { recSeries } from '../series';

const rec = (o: Partial<LaneRec>): LaneRec => ({
  date: '2026-03-01',
  lane_id: 'L1',
  action: 'Hold',
  action_probabilities: { Hold: 0.6, Shift: 0.3, Pause: 0.1 },
  action_confidence: 0.6,
  shift_target: null,
  situation: null,
  signal_quality_score: 0.8,
  tier: 'Recommended',
  ...o,
});

describe('recSeries', () => {
  const recs = [
    rec({ date: '2026-03-15', action_probabilities: { Hold: 0.2, Shift: 0.75 }, tier: 'Review' }),
    rec({ date: '2026-03-01' }),
    rec({ date: '2026-03-08', lane_id: 'L2' }),
    rec({ date: '2026-03-08', action_probabilities: { Hold: 0.41, Shift: 0.4 } }),
  ];
  it('sorts by date', () => {
    expect(recSeries(recs, 'L1').map((p) => p.date)).toEqual(['2026-03-01', '2026-03-08', '2026-03-15']);
  });
  it('uses the max probability', () => {
    expect(recSeries(recs, 'L1').map((p) => p.p)).toEqual([0.6, 0.41, 0.75]);
    expect(recSeries(recs, 'L1')[2].tier).toBe('Review');
  });
  it('returns empty for an unknown lane', () => {
    expect(recSeries(recs, 'L9')).toEqual([]);
  });
});
