import { describe, expect, it } from 'vitest';
import { BASELINE_END, BASELINE_START, chokepointBaselines } from '../dataIndex';
import { emptyDataset } from '../loadAll';
import type { ChokepointDay, Dataset } from '../types';

const ds = (o: Partial<Dataset>): Dataset => ({ ...emptyDataset(), ...o });
const choke = (o: Partial<ChokepointDay>): ChokepointDay =>
  ({
    date: '2026-01-10',
    chokepoint: 'Strait of Hormuz',
    lat: 26.3,
    lon: 56.9,
    n_total_7d_avg: 100,
    ...o,
  }) as ChokepointDay;

describe('chokepointBaselines', () => {
  it('averages n_total_7d_avg over the pre-war window only, skipping missing values', () => {
    const d = ds({
      chokepoints: [
        choke({ date: '2025-12-31', n_total_7d_avg: 1000 }),
        choke({ date: BASELINE_START, n_total_7d_avg: 90 }),
        choke({ date: '2026-02-01', n_total_7d_avg: null }),
        choke({ date: '2026-02-10', n_total_7d_avg: Number.NaN }),
        choke({ date: BASELINE_END, n_total_7d_avg: 110 }),
        choke({ date: '2026-02-28', n_total_7d_avg: 0 }),
        choke({ date: '2026-03-15', n_total_7d_avg: 0 }),
        choke({ chokepoint: 'Suez Canal', date: '2026-01-05', n_total_7d_avg: 40 }),
        choke({ chokepoint: 'Late Only', date: '2026-04-01', n_total_7d_avg: 30 }),
        choke({ chokepoint: 'All Null', date: '2026-01-05', n_total_7d_avg: null }),
      ],
    });
    const b = chokepointBaselines(d);
    expect(b.get('Strait of Hormuz')).toBe(100);
    expect(b.get('Suez Canal')).toBe(40);
    expect(b.has('Late Only')).toBe(false);
    expect(b.has('All Null')).toBe(false);
  });

  it('is memoized per dataset', () => {
    const d = ds({ chokepoints: [choke({})] });
    expect(chokepointBaselines(d)).toBe(chokepointBaselines(d));
    expect(chokepointBaselines(ds({ chokepoints: [choke({})] }))).not.toBe(chokepointBaselines(d));
  });
});
