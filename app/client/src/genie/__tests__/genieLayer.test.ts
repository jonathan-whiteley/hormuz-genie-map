import { describe, expect, it } from 'vitest';
import type { GenieAnswer } from '../genieClient';
import {
  MAX_GENIE_LAYERS,
  MAX_LAYER_ROWS,
  cellText,
  detect,
  genieQuestionFor,
  mapLayersOf,
  mapRowsCaption,
  turnOn,
  type GenieEntry,
} from '../genieLayer';

const answer = (columns: string[], rows: Record<string, unknown>[], totalRows = rows.length): GenieAnswer => ({
  columns,
  rows,
  totalRows,
});

describe('detect', () => {
  it('finds an h3 hex string column and a numeric value column', () => {
    const spec = detect(
      answer(
        ['h3', 'label', 'vessels'],
        [
          { h3: '85283473fffffff', label: 'a', vessels: '12' },
          { h3: '85283477fffffff', label: 'b', vessels: '3' },
        ]
      )
    );
    expect(spec).toMatchObject({ kind: 'h3', hexField: 'h3', valueField: 'vessels' });
    expect(spec?.kind === 'h3' && spec.rows.map((r) => r.h3)).toEqual(['85283473fffffff', '85283477fffffff']);
  });

  it('converts an h3_res5 decimal BIGINT string to hex', () => {
    const hex = '85283473fffffff';
    const dec = BigInt(`0x${hex}`).toString(10);
    const spec = detect(answer(['h3_res5', 'n'], [{ h3_res5: dec, n: 4 }]));
    expect(spec?.kind).toBe('h3');
    if (spec?.kind !== 'h3') throw new Error('expected h3');
    expect(spec.hexField).toBe('h3_res5');
    expect(spec.rows[0].h3_res5).toBe(hex);
  });

  it('accepts a 0x-prefixed or upper-case hex id', () => {
    const spec = detect(answer(['h3'], [{ h3: '0x85283473FFFFFFF' }]));
    expect(spec?.kind === 'h3' && spec.rows[0].h3).toBe('85283473fffffff');
  });

  it('an h3_resolution column with no valid ids falls through to lat/lon', () => {
    const spec = detect(
      answer(['h3_resolution', 'lat', 'lon', 'n'], [{ h3_resolution: '5', lat: '25', lon: '55', n: '3' }])
    );
    expect(spec).toMatchObject({ kind: 'points', latField: 'lat', lonField: 'lon', valueField: 'n' });
  });

  it('an h3 column of junk with no other geo columns is table only', () => {
    expect(detect(answer(['h3_res5', 'n'], [{ h3_res5: 'abc', n: 1 }]))).toBeNull();
  });

  it('the h3 value field skips coordinates and other h3 columns', () => {
    const spec = detect(
      answer(
        ['h3_res5', 'h3_res7', 'lat', 'lon', 'vessels'],
        [{ h3_res5: '85283473fffffff', h3_res7: '87283472bffffff', lat: '25', lon: '55', vessels: '9' }]
      )
    );
    expect(spec).toMatchObject({ kind: 'h3', hexField: 'h3_res5', valueField: 'vessels' });
  });

  it('matches a column ending in _h3', () => {
    expect(detect(answer(['cell_h3'], [{ cell_h3: '85283473fffffff' }]))?.kind).toBe('h3');
  });

  it('finds Latitude/Longitude in mixed case', () => {
    const spec = detect(
      answer(
        ['Port', 'Latitude', 'Longitude', 'pct'],
        [{ Port: 'Salalah', Latitude: '16.9', Longitude: '54.0', pct: '130.5' }]
      )
    );
    expect(spec).toMatchObject({ kind: 'points', latField: 'Latitude', lonField: 'Longitude', valueField: 'pct' });
  });

  it('finds lat/lon', () => {
    expect(detect(answer(['lat', 'lon'], [{ lat: 1, lon: 2 }]))).toMatchObject({
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
    });
  });

  it('turns a lane_id column into a lanes spec with unique ids', () => {
    const spec = detect(
      answer(
        ['LANE_ID', 'volume'],
        [
          { LANE_ID: 'L1', volume: 3 },
          { LANE_ID: 'L4', volume: 1 },
          { LANE_ID: 'L1', volume: 2 },
          { LANE_ID: null, volume: 2 },
        ]
      )
    );
    expect(spec).toEqual({ kind: 'lanes', laneIds: ['L1', 'L4'] });
  });

  it('returns null without geo columns', () => {
    expect(detect(answer(['port', 'calls'], [{ port: 'x', calls: 1 }]))).toBeNull();
    expect(detect(answer([], []))).toBeNull();
  });

  it('picks the first column whose non-null values are all numeric, skipping text columns', () => {
    const spec = detect(
      answer(
        ['lat', 'lon', 'name', 'mixed', 'calls', 'pct'],
        [
          { lat: '1', lon: '2', name: 'Fujairah', mixed: '5', calls: '7.5', pct: '80' },
          { lat: '1', lon: '2', name: 'Dibba', mixed: 'n/a', calls: null, pct: '90' },
        ]
      )
    );
    expect(spec).toMatchObject({ kind: 'points', valueField: 'calls' });
  });

  it('leaves valueField undefined when no other column is numeric', () => {
    const spec = detect(answer(['lat', 'lon', 'name'], [{ lat: 1, lon: 2, name: 'x' }]));
    expect(spec?.kind === 'points' && spec.valueField).toBeUndefined();
  });

  it('caps rendered rows at 5,000 while totalRows keeps the original count', () => {
    const rows = Array.from({ length: 6000 }, (_, i) => ({ lat: 20 + i / 1000, lon: 55, n: i }));
    const a = answer(['lat', 'lon', 'n'], rows, 6000);
    const spec = detect(a);
    expect(MAX_LAYER_ROWS).toBe(5000);
    expect(spec?.kind === 'points' && spec.rows.length).toBe(5000);
    expect(a.totalRows).toBe(6000);
  });
});

describe('turnOn', () => {
  const entry = (id: string, on: boolean): GenieEntry => ({
    id,
    question: id,
    loading: false,
    spec: { kind: 'lanes', laneIds: ['L1'] },
    on,
  });

  it('turning on a sixth layer turns off the oldest', () => {
    // Newest first: q5 is newest of the five on, q0 is the oldest.
    const entries = [entry('q6', false), ...[5, 4, 3, 2, 1].map((n) => entry(`q${n}`, true)), entry('q0', false)];
    const next = turnOn(entries, 'q6');
    expect(next.filter((e) => e.on).map((e) => e.id)).toEqual(['q6', 'q5', 'q4', 'q3', 'q2']);
    expect(MAX_GENIE_LAYERS).toBe(5);
  });

  it('turning on an old entry under the cap leaves the others on', () => {
    const next = turnOn([entry('q2', true), entry('q1', false)], 'q1');
    expect(next.map((e) => e.on)).toEqual([true, true]);
  });
});

describe('cellText', () => {
  it('shows missing values as no data and keeps a real 0', () => {
    expect(cellText(null)).toBe('no data');
    expect(cellText(undefined)).toBe('no data');
    expect(cellText(Number.NaN)).toBe('no data');
    expect(cellText('NaN')).toBe('no data');
    expect(cellText(0)).toBe('0');
    expect(cellText('0')).toBe('0');
    expect(cellText('130.5')).toBe('130.5');
  });
});

describe('genieQuestionFor', () => {
  it('builds the map-click question', () => {
    expect(genieQuestionFor('Salalah')).toBe('How has Salalah changed since the war began?');
  });
});

describe('mapLayersOf', () => {
  const e = (id: string, on: boolean, spec: GenieEntry['spec']): GenieEntry => ({
    id,
    question: `Q ${id}`,
    loading: false,
    spec,
    on,
  });
  const pts = { kind: 'points' as const, latField: 'lat', lonField: 'lon', rows: [] };

  it('keeps each entry id as its layer id, with the question as title, for on entries only', () => {
    const one = mapLayersOf([e('genie-1', true, pts)]);
    const two = mapLayersOf([
      e('genie-2', true, { kind: 'lanes', laneIds: ['L1'] }),
      e('genie-1', true, pts),
      e('genie-0', false, pts),
    ]);
    expect(one.map((l) => l.id)).toEqual(['genie-1']);
    expect(two.map((l) => [l.id, l.title])).toEqual([
      ['genie-2', 'Q genie-2'],
      ['genie-1', 'Q genie-1'],
    ]);
  });

  it('skips entries without a spec', () => {
    expect(mapLayersOf([e('genie-1', true, null)])).toEqual([]);
  });
});

describe('mapRowsCaption', () => {
  const rows = (n: number) => Array.from({ length: n }, () => ({ lat: 1, lon: 2 }));
  it('says how many rows the map shows when the layer is capped', () => {
    const spec = { kind: 'points' as const, latField: 'lat', lonField: 'lon', rows: rows(5000) };
    expect(mapRowsCaption(spec, 6000)).toBe('Map shows 5,000 of 6,000 rows');
    expect(mapRowsCaption(spec, 12345)).toBe('Map shows 5,000 of 12,345 rows');
  });
  it('is null when nothing is capped or the spec has no rows', () => {
    expect(mapRowsCaption({ kind: 'points', latField: 'lat', lonField: 'lon', rows: rows(2) }, 2)).toBeNull();
    expect(mapRowsCaption({ kind: 'lanes', laneIds: ['L1'] }, 9000)).toBeNull();
    expect(mapRowsCaption(null, 9000)).toBeNull();
  });
});
