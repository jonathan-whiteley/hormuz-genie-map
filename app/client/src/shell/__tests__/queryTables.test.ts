import { describe, expect, it } from 'vitest';
import { QUERY_TABLES, errorLine } from '../queryTables';

const QUERIES = [
  'chokepoints_daily',
  'ports_daily',
  'ports_daily_2',
  'ports_daily_3',
  'lane_status',
  'conflict_events',
  'ais_visibility',
  'ais_regions',
  'ais_h3_daily',
  'lane_recommendation',
  'freshness',
];

describe('error banner', () => {
  it('maps every startup query to its table', () => {
    expect(Object.keys(QUERY_TABLES).sort()).toEqual([...QUERIES].sort());
  });

  it('names the query, the table and the grant', () => {
    expect(errorLine('ports_daily_2', 'TABLE_OR_VIEW_NOT_FOUND', 'c.hormuz')).toBe(
      'Could not load ports_daily_2 (gold_port_daily, May to Aug chunk): TABLE_OR_VIEW_NOT_FOUND. Grant USE CATALOG, USE SCHEMA and SELECT on c.hormuz to your user.'
    );
  });

  it('an unknown query still renders', () => {
    expect(errorLine('other', 'boom', 'c.s')).toContain('Could not load other: boom.');
  });
});
