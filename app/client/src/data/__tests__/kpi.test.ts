import { describe, expect, it } from 'vitest';
import {
  disruptedCount,
  fmtNum,
  fmtPct,
  gulfVisibility,
  hormuzOn,
  lanesOn,
  latestOnOrBefore,
  noDataCount,
  recOn,
  riskPhrase,
  volumeAtRisk,
  riskSources,
} from '../kpi';
import type { ChokepointDay, LaneDay, LaneRec, VisibilityPoint } from '../types';

const lane = (o: Partial<LaneDay>): LaneDay =>
  ({
    date: '2026-03-01',
    lane_id: 'L1',
    status: 'Normal',
    volume_unit: 'tonnes',
    volume_at_risk: null,
    ...o,
  }) as LaneDay;

describe('latestOnOrBefore', () => {
  const rows = [{ date: '2026-03-01' }, { date: '2026-03-03' }];
  it('exact date', () => expect(latestOnOrBefore(rows, '2026-03-03')).toBe(rows[1]));
  it('previous date when missing', () => expect(latestOnOrBefore(rows, '2026-03-02')).toBe(rows[0]));
  it('past the data', () => expect(latestOnOrBefore(rows, '2026-12-01')).toBe(rows[1]));
  it('before first row', () => expect(latestOnOrBefore(rows, '2026-02-01')).toBeUndefined());
});

describe('formatters', () => {
  it('no data for null/undefined/NaN', () => {
    for (const v of [null, undefined, NaN]) {
      expect(fmtNum(v)).toBe('no data');
      expect(fmtPct(v)).toBe('no data');
    }
  });
  it('formats numbers', () => {
    expect(fmtNum(1234.5)).toBe('1,235');
    expect(fmtNum(1.234, 1)).toBe('1.2');
    expect(fmtPct(12.3)).toBe('12%');
  });
});

describe('lanes', () => {
  const lanes = [
    lane({ date: '2026-03-01', lane_id: 'L1', status: 'Normal' }),
    lane({ date: '2026-03-02', lane_id: 'L1', status: 'Disrupted', volume_at_risk: 100 }),
    lane({ date: '2026-03-02', lane_id: 'L2', status: 'Degraded', volume_unit: 'TEU', volume_at_risk: 50 }),
    lane({ date: '2026-03-02', lane_id: 'L3', status: 'Disrupted', volume_unit: 'TEU', volume_at_risk: null }),
  ];
  it('lanesOn one row per lane, latest on or before', () => {
    const r = lanesOn(lanes, '2026-03-02');
    expect(r.map((l) => l.lane_id).sort()).toEqual(['L1', 'L2', 'L3']);
    expect(r.find((l) => l.lane_id === 'L1')?.status).toBe('Disrupted');
    expect(lanesOn(lanes, '2026-03-01')).toHaveLength(1);
  });
  it('disruptedCount counts only Disrupted', () => expect(disruptedCount(lanesOn(lanes, '2026-03-02'))).toBe(2));
  it('volumeAtRisk sums by unit, ignoring nulls', () => {
    expect(volumeAtRisk(lanesOn(lanes, '2026-03-02'))).toEqual({ tonnes: 100, teu: 50 });
  });
  it('No data lanes never count as 0', () => {
    const nd = [
      lane({ lane_id: 'L1', status: 'No data', volume_at_risk: null }),
      lane({ lane_id: 'L2', status: 'No data', volume_unit: 'TEU', volume_at_risk: null }),
    ];
    expect(volumeAtRisk(nd)).toEqual({ tonnes: null, teu: null });
    expect(disruptedCount(nd)).toBeNull();
    expect(disruptedCount([])).toBeNull();
    expect(noDataCount(nd)).toBe(2);
    expect(volumeAtRisk([nd[0], lane({ volume_at_risk: 0 })])).toEqual({ tonnes: 0, teu: null });
    expect(disruptedCount([nd[0], lane({ status: 'Normal' })])).toBe(0);
  });
});

describe('riskPhrase', () => {
  it('names only the units with a value', () => {
    expect(riskPhrase({ tonnes: 750, teu: null })).toBe('750 tonnes');
    expect(riskPhrase({ tonnes: null, teu: 1200 })).toBe('1,200 TEU');
    expect(riskPhrase({ tonnes: 750, teu: 1200 })).toBe('750 tonnes and 1,200 TEU');
    expect(riskPhrase({ tonnes: 0, teu: 1200 })).toBe('1,200 TEU');
  });
  it('a real 0 stays 0; nothing at all is null', () => {
    expect(riskPhrase({ tonnes: 0, teu: null })).toBe('0 tonnes');
    expect(riskPhrase({ tonnes: null, teu: null })).toBeNull();
  });
});

describe('hormuzOn', () => {
  const cp = [
    { date: '2026-03-01', chokepoint: 'Strait of Hormuz', n_tanker_7d_avg: 10, pct_of_baseline_tanker: 50 },
    { date: '2026-03-01', chokepoint: 'Suez Canal', n_tanker_7d_avg: 99, pct_of_baseline_tanker: 99 },
  ] as ChokepointDay[];
  it('reads the vessel column for Hormuz', () => {
    expect(hormuzOn(cp, '2026-03-05', 'tanker')).toEqual({ transits7d: 10, pctBaseline: 50 });
  });
  it('nulls when missing', () => {
    expect(hormuzOn(cp, '2026-02-01', 'tanker')).toEqual({ transits7d: null, pctBaseline: null });
  });
});

describe('gulfVisibility', () => {
  it('null with no samples', () => expect(gulfVisibility([], '2026-10-01')).toBeNull());
  it('latest gulf sample on or before end of date', () => {
    const pts = [
      { region: 'gulf_hormuz', sample_hour: '2026-10-01T05:00:00.000Z', visibility_vs_control: 0.1 },
      { region: 'gulf_hormuz', sample_hour: '2026-10-01T23:00:00.000Z', visibility_vs_control: 0.2 },
      { region: 'gulf_hormuz', sample_hour: '2026-10-02T01:00:00.000Z', visibility_vs_control: 0.3 },
      { region: 'red_sea', sample_hour: '2026-10-01T22:00:00.000Z', visibility_vs_control: 0.9 },
    ] as VisibilityPoint[];
    expect(gulfVisibility(pts, '2026-10-01')).toBe(0.2);
  });
});

describe('recOn', () => {
  const recs = [
    { date: '2026-03-01', lane_id: 'L1', action: 'buffer' },
    { date: '2026-03-03', lane_id: 'L1', action: 'shift' },
    { date: '2026-03-02', lane_id: 'L2', action: 'hold' },
  ] as LaneRec[];
  it('previous day when exact missing', () => expect(recOn(recs, 'L1', '2026-03-02')?.action).toBe('buffer'));
  it('exact day', () => expect(recOn(recs, 'L1', '2026-03-03')?.action).toBe('shift'));
  it('per lane', () => expect(recOn(recs, 'L2', '2026-03-01')).toBeUndefined());
});

describe('riskSources', () => {
  it('names the contributing lanes by status', () => {
    expect(
      riskSources([lane({ status: 'Normal', volume_at_risk: 45 }), lane({ status: 'Normal', volume_at_risk: 0 })])
    ).toBe('from 1 Normal lane');
    expect(
      riskSources([
        lane({ status: 'Disrupted', volume_at_risk: 10 }),
        lane({ status: 'Disrupted', volume_at_risk: 5 }),
        lane({ status: 'Shifted to alternative', volume_at_risk: 3 }),
      ])
    ).toBe('from 3 lanes: 2 Disrupted, 1 Shifted to alternative');
  });
  it('says so when nothing is at risk', () => {
    expect(riskSources([lane({ volume_at_risk: null })])).toBe('no lane shortfall');
  });
});
