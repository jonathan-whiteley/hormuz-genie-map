import { describe, expect, it } from 'vitest';
import type { LaneDay } from '../../data/types';
import { answerFeatures, featureBounds, mapChipText, mappableSpec } from '../answerFeatures';
import type { GenieAnswer } from '../genieClient';
import { PLACE_LAT, PLACE_LON, ROW_INDEX, type GenieLayerSpec } from '../genieLayer';

const lane = (o: Partial<LaneDay>): LaneDay =>
  ({
    lane_id: 'L1',
    lane: 'Crude feedstock',
    status: 'Disrupted',
    primary_lat: 26.6,
    primary_lon: 50.2,
    hormuz_lat: 26.3,
    hormuz_lon: 56.9,
    exit_lat: 24,
    exit_lon: 60,
    ...o,
  }) as LaneDay;

const points: GenieLayerSpec = {
  kind: 'points',
  latField: PLACE_LAT,
  lonField: PLACE_LON,
  valueField: 'calls_7d',
  nameField: 'port',
  rows: [
    { port: 'Salalah', calls_7d: '3.14', pct: '135.0', [PLACE_LAT]: 16.9, [PLACE_LON]: 54.0, [ROW_INDEX]: 0 },
    { port: 'Khor Fakkan', calls_7d: '1.0', pct: '1160.0', [PLACE_LAT]: 25.4, [PLACE_LON]: 56.4, [ROW_INDEX]: 2 },
  ],
};

describe('answerFeatures', () => {
  it('names points by nameField and labels them with the percent column when there is one', () => {
    const f = answerFeatures(points, []);
    expect(f.map((x) => [x.name, x.value, x.rowIndex, x.position])).toEqual([
      ['Salalah', '135%', 0, [54.0, 16.9]],
      ['Khor Fakkan', '1,160%', 2, [56.4, 25.4]],
    ]);
  });

  it('falls back to valueField, then to the row position, for labels and row indexes', () => {
    const spec: GenieLayerSpec = {
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      valueField: 'n',
      rows: [{ lat: '1', lon: '2', n: '12.346' }],
    };
    expect(answerFeatures(spec, [])[0]).toMatchObject({ name: 'Place 1', value: '12.35', rowIndex: 0 });
  });

  it('skips rows without usable coordinates and returns null bounds', () => {
    const spec: GenieLayerSpec = {
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      rows: [
        { lat: null, lon: '2' },
        { lat: 'n/a', lon: '2' },
      ],
    };
    const f = answerFeatures(spec, []);
    expect(f).toEqual([]);
    expect(featureBounds(f)).toBeNull();
    expect(mapChipText(spec, f)).toBeNull();
  });

  it('draws lanes from the lane geometry and skips unknown lane ids', () => {
    const spec: GenieLayerSpec = { kind: 'lanes', laneIds: ['L1', 'L9'] };
    const f = answerFeatures(spec, [lane({})]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ key: 'lane:L1', name: 'L1 Crude feedstock', value: 'Disrupted', rowIndex: null });
    expect(f[0].path).toEqual([
      [50.2, 26.6],
      [56.9, 26.3],
      [60, 24],
    ]);
  });

  it('keeps h3 cells and uses lat/lon columns on the row for bounds', () => {
    const spec: GenieLayerSpec = {
      kind: 'h3',
      hexField: 'h3_res5',
      valueField: 'vessels',
      rows: [{ h3_res5: '85283473fffffff', vessels: '4', lat: '25', lon: '55' }],
    };
    const f = answerFeatures(spec, []);
    expect(f[0]).toMatchObject({ hexagon: '85283473fffffff', position: [55, 25], value: '4' });
  });

  it('places h3 cells without lat/lon at the cell centroid so the camera can fit them', () => {
    const spec: GenieLayerSpec = {
      kind: 'h3',
      hexField: 'h3_res5',
      valueField: 'vessels',
      rows: [{ h3_res5: '8543a107fffffff', vessels: '4' }],
    };
    const f = answerFeatures(spec, []);
    const [lng, lat] = f[0].position!;
    expect(lng).toBeCloseTo(55, 0);
    expect(lat).toBeCloseTo(25, 0);
    expect(featureBounds(f)).not.toBeNull();
  });

  it('merges a cell on several rows into one feature at its latest day', () => {
    const spec: GenieLayerSpec = {
      kind: 'h3',
      hexField: 'h3_res5',
      valueField: 'n',
      rows: [
        { h3_res5: '8543a107fffffff', day: '2026-03-02', n: '7' },
        { h3_res5: '8543a107fffffff', day: '2026-03-01', n: '4' },
      ],
    };
    expect(answerFeatures(spec, []).map((x) => [x.key, x.rowIndex, x.value])).toEqual([['hex:0', 0, '7']]);
  });

  it('never names a feature "null" or "undefined"', () => {
    const pts: GenieLayerSpec = {
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      nameField: 'port',
      rows: [
        { port: null, lat: '1', lon: '2' },
        { lat: '3', lon: '4' },
      ],
    };
    expect(answerFeatures(pts, []).map((x) => x.name)).toEqual(['Place 1', 'Place 2']);
    const cells: GenieLayerSpec = {
      kind: 'h3',
      hexField: 'h3',
      rows: [
        { h3: '8543a107fffffff', region: 'Gulf' },
        { h3: '85283473fffffff', region: null },
      ],
    };
    expect(answerFeatures(cells, []).map((x) => x.name)).toEqual(['Gulf', 'Cell 2']);
  });

  it('merges rows at one place into one feature labelled by the latest date', () => {
    const spec: GenieLayerSpec = {
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      nameField: 'chokepoint',
      rows: [
        { date: '2026-10-10', chokepoint: 'Strait of Hormuz', pct: '40', lat: '26.3', lon: '56.9' },
        { date: '2026-10-11', chokepoint: 'Strait of Hormuz', pct: '42', lat: '26.3', lon: '56.9' },
        { date: '2026-10-10', chokepoint: 'Suez Canal', pct: '70', lat: '30.6', lon: '32.3' },
        { date: '2026-10-09', chokepoint: 'Strait of Hormuz', pct: '38', lat: '26.3', lon: '56.9' },
      ],
    };
    const f = answerFeatures(spec, []);
    expect(f.map((x) => [x.name, x.value, x.rowIndex])).toEqual([
      ['Strait of Hormuz', '42%', 1],
      ['Suez Canal', '70%', 2],
    ]);
    expect(mapChipText(spec, f)).toBe('On the map: 2 chokepoints');
  });

  it('without a date column, keeps the last row at a shared position', () => {
    const spec: GenieLayerSpec = {
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      nameField: 'port',
      valueField: 'n',
      rows: [
        { port: 'Salalah', n: '1', lat: '16.9', lon: '54' },
        { port: 'Salalah', n: '2', lat: '16.9', lon: '54' },
      ],
    };
    expect(answerFeatures(spec, []).map((x) => [x.value, x.rowIndex])).toEqual([['2', 1]]);
  });

  it('drops points outside the valid latitude and longitude range', () => {
    const spec: GenieLayerSpec = {
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      rows: [
        { lat: '95', lon: '2' },
        { lat: '-91', lon: '2' },
        { lat: '10', lon: '181' },
        { lat: '10', lon: '-180' },
      ],
    };
    expect(answerFeatures(spec, []).map((x) => x.position)).toEqual([[-180, 10]]);
  });

  it('ignores out-of-range lat/lon on an h3 row and uses the cell centroid', () => {
    const spec: GenieLayerSpec = {
      kind: 'h3',
      hexField: 'h3',
      rows: [{ h3: '8543a107fffffff', lat: '250', lon: '55' }],
    };
    const [lng, lat] = answerFeatures(spec, [])[0].position!;
    expect(lng).toBeCloseTo(55, 0);
    expect(lat).toBeCloseTo(25, 0);
  });

  it('does not headline a percent on a small baseline', () => {
    const spec: GenieLayerSpec = {
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      nameField: 'port',
      rows: [
        { port: 'Khor Fakkan', pct: '1160', low_baseline: true, lat: '25.4', lon: '56.4' },
        { port: 'Yanbu', pct: '210', baseline: '0.4', lat: '24', lon: '38' },
        { port: 'Fujairah', pct: '135', baseline: '6.2', low_baseline: 'false', lat: '25.1', lon: '56.3' },
      ],
    };
    expect(answerFeatures(spec, []).map((x) => x.value)).toEqual([
      '1,160% (small baseline)',
      '210% (small baseline)',
      '135%',
    ]);
  });
});

describe('mappableSpec', () => {
  const ans = (columns: string[], rows: Record<string, unknown>[]): GenieAnswer => ({
    columns,
    rows,
    totalRows: rows.length,
  });

  it('is null when the detected spec draws nothing', () => {
    expect(mappableSpec(ans(['port', 'lat', 'lon'], [{ port: 'x', lat: null, lon: null }]), undefined, [])).toBeNull();
    expect(mappableSpec(ans(['lane_id'], [{ lane_id: 'L9' }]), undefined, [lane({})])).toBeNull();
    expect(mappableSpec(ans(['n'], [{ n: 1 }]), undefined, [])).toBeNull();
  });

  it('is the detected spec when it draws something', () => {
    expect(mappableSpec(ans(['lane_id'], [{ lane_id: 'L1' }]), undefined, [lane({})])).toEqual({
      kind: 'lanes',
      laneIds: ['L1'],
    });
  });
});

describe('featureBounds', () => {
  it('spans every position and path point', () => {
    expect(featureBounds(answerFeatures(points, []))).toEqual([
      [54.0, 16.9],
      [56.4, 25.4],
    ]);
  });

  it('pads a single-point bounds', () => {
    const one = answerFeatures({ ...points, rows: [points.rows[0]] } as GenieLayerSpec, []);
    expect(featureBounds(one)).toEqual([
      [52.5, 15.4],
      [55.5, 18.4],
    ]);
  });
});

describe('mapChipText', () => {
  it('counts features with a noun from the spec', () => {
    expect(mapChipText(points, answerFeatures(points, []))).toBe('On the map: 2 ports');
    const one = answerFeatures({ ...points, rows: [points.rows[0]] } as GenieLayerSpec, []);
    expect(mapChipText(points, one)).toBe('On the map: 1 port');
    const chokeSpec = { ...points, nameField: 'chokepoint' } as GenieLayerSpec;
    expect(mapChipText(chokeSpec, one)).toBe('On the map: 1 chokepoint');
    const lanes: GenieLayerSpec = { kind: 'lanes', laneIds: ['L1'] };
    expect(mapChipText(lanes, answerFeatures(lanes, [lane({})]))).toBe('On the map: 1 lane');
  });
});
