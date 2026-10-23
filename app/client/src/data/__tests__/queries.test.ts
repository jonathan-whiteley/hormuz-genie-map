import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = (name: string) => readFileSync(path.resolve(__dirname, '../../../../config/queries', `${name}.obo.sql`), 'utf8');

describe('chokepoints_daily', () => {
  it('computes every percent of baseline from the 7-day average', () => {
    const q = sql('chokepoints_daily');
    for (const v of ['total', 'tanker', 'container', 'dry_bulk']) {
      expect(q).toContain(`ROUND(100 * n_${v}_7d_avg / NULLIF(baseline_${v}, 0), 1) AS pct_of_baseline_${v}`);
    }
  });
});

describe('AIS queries stay under the 5 MB per-event cap', () => {
  it('vessel_positions keeps the last 7 days without the North Sea, one row per vessel per day', () => {
    const q = sql('vessel_positions');
    expect(q).toMatch(/WHERE window_start >= date_sub\(current_date\(\), 7\)\n  AND region <> 'north_sea_channel'/);
    expect(q).toMatch(/PARTITION BY CAST\(window_start AS DATE\), mmsi ORDER BY received_at DESC\) = 1/);
  });
  it('ais_visibility keeps the last 30 days', () => {
    expect(sql('ais_visibility')).toMatch(/WHERE sample_hour >= current_timestamp\(\) - INTERVAL 30 DAYS/);
  });
});

describe('conflict_events', () => {
  it('reads effect and short_label without failing on an older table that lacks them', () => {
    const q = sql('conflict_events');
    expect(q).toMatch(/SELECT \* FROM IDENTIFIER\(:catalog \|\| '\.' \|\| :schema \|\| '\.ref_conflict_events'\)/);
    expect(q).toContain('effect');
    expect(q).toContain('short_label');
  });
});
