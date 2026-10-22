import { describe, expect, it } from 'vitest';
import { timeSeriesOf } from '../../genie/timeSeries';
import { MAX_DAILY_VESSELS, RELATIVE_PEAK_VESSELS, answerElevation, answerLabelZ, seriesHeightScale } from '../answerScale';
import { REF_ZOOM, elevationOf, labelZ } from '../columns';

const monthly = (field: string, nameField: string, a: string, b: string) =>
  timeSeriesOf({
    kind: 'points',
    latField: 'lat',
    lonField: 'lon',
    nameField,
    rows: [
      { month: '2026-02', [nameField]: 'Place A', [field]: a, lat: '26.3', lon: '56.9' },
      { month: '2026-03', [nameField]: 'Place A', [field]: b, lat: '26.3', lon: '56.9' },
    ],
  })!;

describe('answer column scale', () => {
  it('a per-day series in range keeps the shared absolute scale', () => {
    const s = monthly('n_total_7d_avg', 'chokepoint', '76.9', '10.3');
    expect(s.perDay).toBe(true);
    expect(seriesHeightScale(s)).toBe(1);
    expect(answerElevation(s, 76.9)).toBe(elevationOf(76.9));
    expect(answerElevation(s, 10.3)).toBe(elevationOf(10.3));
    expect(answerLabelZ(s, 10.3, REF_ZOOM + 1)).toBe(labelZ(10.3, REF_ZOOM + 1));
  });

  it('a monthly SUM(n_total) is scaled to its own peak, at about the pre-war Hormuz height', () => {
    const s = monthly('n_total', 'chokepoint', '2100', '300');
    expect(s.perDay).toBe(false);
    expect(answerElevation(s, 2100)).toBeCloseTo(elevationOf(RELATIVE_PEAK_VESSELS));
    expect(answerElevation(s, 300)).toBeCloseTo(elevationOf((RELATIVE_PEAK_VESSELS * 300) / 2100));
    expect(answerLabelZ(s, 2100, REF_ZOOM)).toBeCloseTo(labelZ(RELATIVE_PEAK_VESSELS, REF_ZOOM));
  });

  it('a tonnes series is scaled to its own peak', () => {
    const s = monthly('export_tanker', 'port', '1200000', '600000');
    expect(answerElevation(s, 1200000)).toBeCloseTo(elevationOf(RELATIVE_PEAK_VESSELS));
    expect(answerElevation(s, 600000)).toBeCloseTo(elevationOf(RELATIVE_PEAK_VESSELS / 2));
  });

  it('a per-day series above the daily ceiling is scaled to its own peak', () => {
    const s = monthly('n_total_7d_avg', 'chokepoint', String(MAX_DAILY_VESSELS * 4), '10');
    expect(s.perDay).toBe(true);
    expect(answerElevation(s, MAX_DAILY_VESSELS * 4)).toBeCloseTo(elevationOf(RELATIVE_PEAK_VESSELS));
  });

  it('a missing value still draws the minimum stub', () => {
    const s = monthly('n_total', 'chokepoint', '2100', '300');
    expect(answerElevation(s, null)).toBe(elevationOf(null));
  });
});
