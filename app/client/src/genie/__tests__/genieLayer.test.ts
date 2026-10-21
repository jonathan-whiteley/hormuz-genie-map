import { describe, expect, it } from 'vitest';
import type { GenieAnswer } from '../genieClient';
import {
  MAX_LAYER_ROWS,
  cellText,
  dateColumn,
  detect,
  genieQuestionFor,
  mapRowsCaption,
  nameColumn,
} from '../genieLayer';
import type { Gazetteer } from '../places';

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

  it('an h3_resolution column with no valid ids falls through to the lane rule', () => {
    const spec = detect(answer(['h3_resolution', 'lane_id'], [{ h3_resolution: '5', lane_id: 'L1' }]));
    expect(spec).toEqual({ kind: 'lanes', laneIds: ['L1'] });
  });

  it('an h3 column of junk with no other geo columns is table only', () => {
    expect(detect(answer(['h3_res5', 'n'], [{ h3_res5: 'abc', n: 1 }]))).toBeNull();
  });

  it('the h3 value field skips other h3 columns', () => {
    const spec = detect(
      answer(
        ['h3_res5', 'h3_res7', 'vessels'],
        [{ h3_res5: '85283473fffffff', h3_res7: '87283472bffffff', vessels: '9' }]
      )
    );
    expect(spec).toMatchObject({ kind: 'h3', hexField: 'h3_res5', valueField: 'vessels' });
  });

  it('lat/lon points win over a valid h3_res7 column, named by the port column', () => {
    const spec = detect(
      answer(
        ['port', 'lat', 'lon', 'h3_res7', 'calls'],
        [{ port: 'Fujairah', lat: '25.1', lon: '56.3', h3_res7: '87283472bffffff', calls: '12' }]
      )
    );
    expect(spec).toMatchObject({
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      nameField: 'port',
      valueField: 'calls',
    });
  });

  it('an h3 column before the port column is never taken as the point name', () => {
    const spec = detect(
      answer(
        ['h3_res7', 'port', 'lat', 'lon'],
        [{ h3_res7: '87283472bffffff', port: 'Fujairah', lat: '25', lon: '56' }]
      )
    );
    expect(spec).toMatchObject({ kind: 'points', nameField: 'port' });
  });

  it('an h3-only answer (no lat/lon) still draws cells', () => {
    const spec = detect(answer(['h3_res5', 'visibility'], [{ h3_res5: '85283473fffffff', visibility: '0.4' }]));
    expect(spec).toMatchObject({ kind: 'h3', hexField: 'h3_res5', valueField: 'visibility' });
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

describe('nameColumn', () => {
  const G: Gazetteer = new Map([
    ['fujairah', { name: 'Fujairah', kind: 'port', lat: 25.1, lon: 56.3 }],
    ['hormuz', { name: 'Strait of Hormuz', kind: 'chokepoint', lat: 26.3, lon: 56.9 }],
  ]);

  it('skips ISO date and timestamp columns', () => {
    const rows = [
      { week: '2026-03-02', ts: '2026-03-02T00:00:00.000Z', port: 'Fujairah' },
      { week: '2026-03-09', ts: '2026-03-09 00:00:00', port: 'Khor Fakkan' },
    ];
    expect(nameColumn(['week', 'ts', 'port'], rows, [])).toBe('port');
  });

  it('skips lane_id and other columns named *_id', () => {
    const rows = [{ lane_id: 'L1', vessel_id: 'V9', port: 'Fujairah' }];
    expect(nameColumn(['lane_id', 'vessel_id', 'port'], rows, [])).toBe('port');
  });

  it('prefers the column whose values match the gazetteer', () => {
    const rows = [
      { country: 'UAE', place: 'Fujairah' },
      { country: 'Iran', place: 'Strait of Hormuz' },
    ];
    expect(nameColumn(['country', 'place'], rows, [], G)).toBe('place');
    expect(nameColumn(['country', 'place'], rows, [])).toBe('country');
  });
});

describe('dateColumn', () => {
  it('finds the first column of ISO dates or timestamps', () => {
    const rows = [{ port: 'a', d: '2026-03-02', n: 1 }];
    expect(dateColumn(['port', 'd', 'n'], rows)).toBe('d');
    expect(dateColumn(['port', 'n'], rows)).toBeUndefined();
  });
});

describe('detect names lat/lon points', () => {
  it('by the port column when a date column comes first', () => {
    const spec = detect(
      answer(
        ['week', 'port', 'tanker_port_calls', 'lat', 'lon'],
        [{ week: '2026-03-02', port: 'Fujairah', tanker_port_calls: '9', lat: '25.1', lon: '56.3' }]
      )
    );
    expect(spec).toMatchObject({ kind: 'points', nameField: 'port' });
  });

  it('by the port column when lane_id comes first', () => {
    const spec = detect(
      answer(['lane_id', 'port', 'lat', 'lon'], [{ lane_id: 'L1', port: 'Fujairah', lat: '25.1', lon: '56.3' }])
    );
    expect(spec).toMatchObject({ kind: 'points', nameField: 'port' });
  });

  it('by the gazetteer-matching column when places are loaded', () => {
    const G: Gazetteer = new Map([['fujairah', { name: 'Fujairah', kind: 'port', lat: 25.1, lon: 56.3 }]]);
    const spec = detect(
      answer(['country', 'site', 'lat', 'lon'], [{ country: 'UAE', site: 'Fujairah', lat: '25.1', lon: '56.3' }]),
      G
    );
    expect(spec).toMatchObject({ kind: 'points', nameField: 'site' });
  });
});
