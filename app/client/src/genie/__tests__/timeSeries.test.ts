import { describe, expect, it } from 'vitest';
import type { GenieLayerSpec } from '../genieLayer';
import { fmtFrameDate, frameOn, normDate, seriesValueField, timeSeriesOf } from '../timeSeries';

const spec = (rows: Record<string, unknown>[], nameField = 'chokepoint'): GenieLayerSpec => ({
  kind: 'points',
  latField: 'lat',
  lonField: 'lon',
  nameField,
  valueField: 'n_total_7d_avg',
  rows,
});

describe('normDate', () => {
  it('normalises months, days and timestamps to YYYY-MM-DD', () => {
    expect(normDate('2026-02')).toBe('2026-02-01');
    expect(normDate('2026-02-14')).toBe('2026-02-14');
    expect(normDate('2026-02-14T00:00:00.000Z')).toBe('2026-02-14');
    expect(normDate('Feb 2026')).toBeNull();
    expect(normDate(null)).toBeNull();
  });
});

describe('seriesValueField', () => {
  it('prefers 7-day averages, then totals, then calls or transits, then any non-percent number', () => {
    const rows = [{ month: '2026-02', n_total: '80', n_total_7d_avg: '76.9', pct_of_baseline_total: '115', lat: '26', lon: '56' }];
    expect(seriesValueField(Object.keys(rows[0]), rows, ['lat', 'lon'])).toBe('n_total_7d_avg');
    const r2 = [{ month: '2026-02', pct: '50', calls: '3', other: '9', lat: '1', lon: '2' }];
    expect(seriesValueField(Object.keys(r2[0]), r2, ['lat', 'lon'])).toBe('calls');
    const r3 = [{ month: '2026-02', pct: '50', other: '9', lat: '1', lon: '2' }];
    expect(seriesValueField(Object.keys(r3[0]), r3, ['lat', 'lon'])).toBe('other');
    const r4 = [{ month: '2026-02', pct: '50', lat: '1', lon: '2' }];
    expect(seriesValueField(Object.keys(r4[0]), r4, ['lat', 'lon'])).toBeNull();
  });

  it('never picks an H3 id, a year, an id or a coordinate, and needs every value numeric', () => {
    const rows = [
      { port: 'Fujairah', lat: '25.1', lon: '56.3', h3_res7: '608819013457362943', year: '2026', port_id: '17', mmsi: '412345678', vessel_count: '12' },
      { port: 'Jebel Ali', lat: '25.0', lon: '55.1', h3_res7: '608819014430441471', year: '2026', port_id: '18', mmsi: '412345679', vessel_count: '30' },
    ];
    expect(seriesValueField(Object.keys(rows[0]), rows, [])).toBe('vessel_count');
    const mixed = [
      { month: '2026-02', other: '5', lat: '1', lon: '2' },
      { month: '2026-03', other: 'n/a', lat: '1', lon: '2' },
    ];
    expect(seriesValueField(Object.keys(mixed[0]), mixed, [])).toBeNull();
  });
});

describe('timeSeriesOf', () => {
  it('builds one place with frames in date order from monthly rows', () => {
    const ts = timeSeriesOf(
      spec([
        { month: '2026-03', chokepoint: 'Strait of Hormuz', n_total_7d_avg: '10.3', pct_of_baseline_total: '4.7', lat: '26.3', lon: '56.9' },
        { month: '2026-02', chokepoint: 'Strait of Hormuz', n_total_7d_avg: '76.9', pct_of_baseline_total: '115', lat: '26.3', lon: '56.9' },
      ])
    );
    expect(ts?.dates).toEqual(['2026-02-01', '2026-03-01']);
    expect(ts?.monthly).toBe(true);
    expect(ts?.perDay).toBe(true);
    expect(ts?.valueField).toBe('n_total_7d_avg');
    expect(ts?.pctField).toBe('pct_of_baseline_total');
    expect(ts?.places).toHaveLength(1);
    expect(ts?.places[0].name).toBe('Strait of Hormuz');
    expect(ts?.places[0].frames.get('2026-02-01')).toEqual({ value: 76.9, pct: 115, rowIndex: 1 });
  });

  it('monthly strings, unsorted rows, gaps and several places', () => {
    const ts = timeSeriesOf(
      spec([
        { month: '2026-03', chokepoint: 'Suez Canal', n_total_7d_avg: '41', lat: '30.6', lon: '32.4' },
        { month: '2026-01', chokepoint: 'Strait of Hormuz', n_total_7d_avg: '70', lat: '26.3', lon: '56.9' },
        { month: '2026-02', chokepoint: 'Strait of Hormuz', n_total_7d_avg: '77', lat: '26.3', lon: '56.9' },
        { month: '2026-01', chokepoint: 'Suez Canal', n_total_7d_avg: '40', lat: '30.6', lon: '32.4' },
      ])
    );
    expect(ts?.dates).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(ts?.places.map((p) => p.name)).toEqual(['Suez Canal', 'Strait of Hormuz']);
    const feb = frameOn(ts!, '2026-02-15');
    expect(feb.date).toBe('2026-02-01');
    expect(feb.values.find((v) => v.place.name === 'Suez Canal')?.frame).toBeNull();
    expect(feb.values.find((v) => v.place.name === 'Strait of Hormuz')?.frame?.value).toBe(77);
  });

  it('is null without a date column, with one date, for non-point specs, or with no numeric value', () => {
    expect(timeSeriesOf(spec([{ chokepoint: 'A', n_total_7d_avg: '1', lat: '1', lon: '1' }]))).toBeNull();
    expect(timeSeriesOf(spec([{ month: '2026-02', chokepoint: 'A', n_total_7d_avg: '1', lat: '1', lon: '1' }]))).toBeNull();
    expect(timeSeriesOf({ kind: 'lanes', laneIds: ['L1'] })).toBeNull();
    expect(
      timeSeriesOf(
        spec([
          { month: '2026-02', chokepoint: 'A', note: 'x', lat: '1', lon: '1' },
          { month: '2026-03', chokepoint: 'A', note: 'y', lat: '1', lon: '1' },
        ])
      )
    ).toBeNull();
  });

  it('sums rows for the same place and date, ignoring null values, and drops pct', () => {
    const ts = timeSeriesOf(
      spec([
        { month: '2026-02', chokepoint: 'Strait of Hormuz', vessel_type: 'tanker', n_total_7d_avg: '4', pct_of_baseline_total: '90', lat: '26.3', lon: '56.9' },
        { month: '2026-03', chokepoint: 'Strait of Hormuz', vessel_type: 'tanker', n_total_7d_avg: '3', pct_of_baseline_total: '20', lat: '26.3', lon: '56.9' },
        { month: '2026-03', chokepoint: 'Strait of Hormuz', vessel_type: 'container', n_total_7d_avg: '2', pct_of_baseline_total: '10', lat: '26.3', lon: '56.9' },
        { month: '2026-03', chokepoint: 'Strait of Hormuz', vessel_type: 'other', n_total_7d_avg: null, pct_of_baseline_total: '5', lat: '26.3', lon: '56.9' },
      ])
    );
    const place = ts!.places[0];
    expect(place.frames.get('2026-03-01')).toEqual({ value: 5, pct: null, rowIndex: 1 });
    expect(place.frames.get('2026-02-01')).toEqual({ value: 4, pct: 90, rowIndex: 0 });
  });

  it('keeps a null value only when every summed row is null', () => {
    const ts = timeSeriesOf(
      spec([
        { month: '2026-02', chokepoint: 'A', n_total_7d_avg: '4', lat: '1', lon: '1' },
        { month: '2026-03', chokepoint: 'A', n_total_7d_avg: null, lat: '1', lon: '1' },
        { month: '2026-03', chokepoint: 'A', n_total_7d_avg: null, lat: '1', lon: '1' },
      ])
    );
    expect(ts!.places[0].frames.get('2026-03-01')?.value).toBeNull();
  });

  it('treats n_total as a daily rate only in a daily series', () => {
    const rows = (dates: string[]) =>
      dates.map((d) => ({ day: d, chokepoint: 'A', n_total: '5', lat: '1', lon: '1' }));
    const daily = timeSeriesOf({ kind: 'points', latField: 'lat', lonField: 'lon', nameField: 'chokepoint', rows: rows(['2026-03-01', '2026-03-02']) });
    expect(daily?.valueField).toBe('n_total');
    expect(daily?.perDay).toBe(true);
    const monthly = timeSeriesOf({ kind: 'points', latField: 'lat', lonField: 'lon', nameField: 'chokepoint', rows: rows(['2026-02', '2026-03']) });
    expect(monthly?.perDay).toBe(false);
    const avg = timeSeriesOf({
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      nameField: 'chokepoint',
      rows: ['2026-02', '2026-03'].map((d) => ({ month: d, chokepoint: 'A', transits_per_day: '5', lat: '1', lon: '1' })),
    });
    expect(avg?.perDay).toBe(true);
  });

  it('skips rows with out-of-range or missing coordinates', () => {
    const ts = timeSeriesOf(
      spec([
        { month: '2026-02', chokepoint: 'A', n_total_7d_avg: '1', lat: '95', lon: '1' },
        { month: '2026-02', chokepoint: 'B', n_total_7d_avg: '2', lat: '10', lon: '10' },
        { month: '2026-03', chokepoint: 'B', n_total_7d_avg: '3', lat: '10', lon: '10' },
      ])
    );
    expect(ts?.places.map((p) => p.name)).toEqual(['B']);
  });
});

describe('frameOn and fmtFrameDate', () => {
  const ts = timeSeriesOf(
    spec([
      { day: '2026-03-01', chokepoint: 'A', n_total_7d_avg: '5', lat: '1', lon: '1' },
      { day: '2026-03-08', chokepoint: 'A', n_total_7d_avg: '6', lat: '1', lon: '1' },
    ])
  )!;

  it('uses the first frame before the series starts', () => {
    expect(frameOn(ts, '2026-01-01').date).toBe('2026-03-01');
  });

  it('formats months and days', () => {
    expect(fmtFrameDate(ts, '2026-03-08')).toBe('Mar 8, 2026');
    const monthly = timeSeriesOf(
      spec([
        { month: '2026-02', chokepoint: 'A', n_total_7d_avg: '5', lat: '1', lon: '1' },
        { month: '2026-03', chokepoint: 'A', n_total_7d_avg: '6', lat: '1', lon: '1' },
      ])
    )!;
    expect(fmtFrameDate(monthly, '2026-03-01')).toBe('Mar 2026');
  });
});
