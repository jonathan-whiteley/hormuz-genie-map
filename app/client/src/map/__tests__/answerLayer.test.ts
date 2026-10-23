import { describe, expect, it } from 'vitest';
import { LABEL_LIMIT, type AnswerFeature } from '../../genie/answerFeatures';
import { timeSeriesOf } from '../../genie/timeSeries';
import { answerLabel, buildAnswerLayers, seriesLabel } from '../answerLayer';
import type { MapDatum } from '../baseLayers';
import { RELATIVE_PEAK_VESSELS } from '../answerScale';
import { LABEL_ON_TOP, elevationOf } from '../columns';

const pt = (i: number): AnswerFeature => ({
  key: `row:${i}`,
  rowIndex: i,
  name: `Port ${i}`,
  value: `${i}%`,
  position: [50 + i, 20],
});
const ids = (layers: { id: string }[]) => layers.map((l) => l.id);

describe('buildAnswerLayers', () => {
  it('draws points with a halo and labels up to the label limit', () => {
    expect(ids(buildAnswerLayers({ kind: 'points', features: [pt(0), pt(1)], highlightRow: null }))).toEqual([
      'answer-halo',
      'answer-points',
      'answer-labels',
    ]);
    const many = Array.from({ length: 13 }, (_, i) => pt(i));
    expect(ids(buildAnswerLayers({ kind: 'points', features: many, highlightRow: null }))).toEqual([
      'answer-halo',
      'answer-points',
    ]);
  });

  it('enlarges the highlighted row in both the halo and the point', () => {
    for (const layer of buildAnswerLayers({ kind: 'points', features: [pt(0), pt(1)], highlightRow: 1 }).slice(0, 2)) {
      const { getRadius: radius, data } = layer.props as unknown as {
        getRadius: (d: MapDatum) => number;
        data: MapDatum[];
      };
      expect(radius(data[1])).toBeGreaterThan(radius(data[0]));
    }
  });

  it('rings answer points with a white, pickable halo', () => {
    const [halo] = buildAnswerLayers({ kind: 'points', features: [pt(0)], highlightRow: null });
    const props = halo.props as unknown as { getFillColor: number[]; pickable: boolean };
    expect(props.getFillColor.slice(0, 3)).toEqual([255, 255, 255]);
    expect(props.pickable).toBe(true);
  });

  it('draws lanes with a white casing, and cells as H3', () => {
    const lane: AnswerFeature = { key: 'lane:L1', rowIndex: null, name: 'L1 Crude', value: 'Disrupted', position: [50, 26], path: [[50, 26], [57, 26]] };
    expect(ids(buildAnswerLayers({ kind: 'lanes', features: [lane], highlightRow: null }))).toEqual([
      'answer-casing',
      'answer-lanes',
      'answer-labels',
    ]);
    const cell = (i: number): AnswerFeature => ({
      key: `hex:${i}`,
      rowIndex: i,
      name: `Cell ${i}`,
      value: null,
      hexagon: '85283473fffffff',
      position: [55, 25],
    });
    expect(ids(buildAnswerLayers({ kind: 'h3', features: [cell(0)], highlightRow: null }))).toEqual([
      'answer-cells',
      'answer-labels',
    ]);
    const many = Array.from({ length: 13 }, (_, i) => cell(i));
    expect(ids(buildAnswerLayers({ kind: 'h3', features: many, highlightRow: null }))).toEqual(['answer-cells']);
  });

  it('draws nothing for no features', () => {
    expect(buildAnswerLayers({ kind: 'points', features: [], highlightRow: null })).toEqual([]);
  });
});

describe('answerLabel', () => {
  it('joins name and value', () => {
    expect(answerLabel(pt(3))).toBe('Port 3  3%');
    expect(answerLabel({ ...pt(3), value: null })).toBe('Port 3');
  });
});

const series = timeSeriesOf({
  kind: 'points',
  latField: 'lat',
  lonField: 'lon',
  nameField: 'chokepoint',
  rows: [
    { month: '2026-02', chokepoint: 'Strait of Hormuz', n_total_7d_avg: '76.9', lat: '26.3', lon: '56.9' },
    { month: '2026-03', chokepoint: 'Strait of Hormuz', n_total_7d_avg: '10.3', lat: '26.3', lon: '56.9' },
  ],
})!;

describe('series answers', () => {
  it('draw a halo disc, Lava columns and labels', () => {
    const layers = buildAnswerLayers({ kind: 'points', features: [], highlightRow: null, series, date: '2026-03-01', zoom: 4 });
    expect(layers.map((l) => l.id)).toEqual(['answer-halo', 'answer-columns', 'answer-labels']);
  });

  it('height follows the frame on or before the date', () => {
    const at = (date: string) => {
      const cols = buildAnswerLayers({ kind: 'points', features: [], highlightRow: null, series, date, zoom: 4 })[1];
      const data = cols.props.data as { elevation: number }[];
      return data[0].elevation;
    };
    expect(at('2026-02-15')).toBeGreaterThan(at('2026-03-15'));
  });

  it('labels show the place, the frame date and the value', () => {
    expect(seriesLabel(series, 'Strait of Hormuz', '2026-03-01', 10.3)).toBe('Strait of Hormuz · Mar 2026 · 10.3 a day');
    expect(seriesLabel(series, 'Strait of Hormuz', '2026-03-01', null)).toBe('Strait of Hormuz · Mar 2026 · no data');
  });

  it('answer labels, series and 2D, draw on top of the columns', () => {
    const lab = (layers: { id: string; props: { parameters?: unknown } }[]) => layers.find((l) => l.id === 'answer-labels')?.props.parameters;
    expect(lab(buildAnswerLayers({ kind: 'points', features: [], highlightRow: null, series, date: '2026-03-01', zoom: 4 }))).toEqual(LABEL_ON_TOP);
    expect(lab(buildAnswerLayers({ kind: 'points', features: [pt(1)], highlightRow: null }))).toEqual(LABEL_ON_TOP);
  });
});

describe('series answers with many places', () => {
  // 20 ports over two weeks. Week of Oct 5: port i has i tanker calls a day, so port 0 has none.
  // Week of Sep 28 runs the other way, so the labels must follow the frame on the date.
  const row = (week: string, i: number, v: number) => ({
    week,
    port: `Port ${i}`,
    portcalls_tanker_7d_avg: String(v),
    lat: '25',
    lon: String(45 + i),
  });
  const many = timeSeriesOf({
    kind: 'points',
    latField: 'lat',
    lonField: 'lon',
    nameField: 'port',
    rows: Array.from({ length: 20 }, (_, i) => [row('2026-09-28', i, 19 - i), row('2026-10-05', i, i)]).flat(),
  })!;
  const labels = (s: typeof many) =>
    (
      buildAnswerLayers({ kind: 'points', features: [], highlightRow: null, series: s, date: '2026-10-05', zoom: 4 })
        .find((l) => l.id === 'answer-labels')
        ?.props.data as MapDatum[]
    ).map((d) => d.name);

  it('label only the largest values, up to the label limit, and never a zero', () => {
    const got = labels(many);
    expect(got).toHaveLength(LABEL_LIMIT);
    expect(new Set(got)).toEqual(new Set(Array.from({ length: LABEL_LIMIT }, (_, k) => `Port ${19 - k}`)));
  });

  it('still draw a column for every place', () => {
    const layers = buildAnswerLayers({ kind: 'points', features: [], highlightRow: null, series: many, date: '2026-10-05', zoom: 4 });
    expect((layers.find((l) => l.id === 'answer-columns')?.props.data as MapDatum[]).length).toBe(20);
  });

  it('label every place, zeros included, when there are few', () => {
    expect(labels(series)).toEqual(['Strait of Hormuz']);
  });
});

describe('series answers that are not daily rates', () => {
  const sums = timeSeriesOf({
    kind: 'points',
    latField: 'lat',
    lonField: 'lon',
    nameField: 'chokepoint',
    rows: [
      { month: '2026-02', chokepoint: 'Strait of Hormuz', n_total: '2100', lat: '26.3', lon: '56.9' },
      { month: '2026-03', chokepoint: 'Strait of Hormuz', n_total: '300', lat: '26.3', lon: '56.9' },
    ],
  })!;

  it('stay within the pre-war Hormuz height and keep the real value in the label', () => {
    const layers = buildAnswerLayers({ kind: 'points', features: [], highlightRow: null, series: sums, date: '2026-02-01', zoom: 4 });
    const cols = layers.find((l) => l.id === 'answer-columns')!;
    const data = cols.props.data as { elevation: number; label: string }[];
    expect(data[0].elevation).toBeLessThanOrEqual(elevationOf(RELATIVE_PEAK_VESSELS) + 1e-6);
    expect(data[0].label).toBe('Strait of Hormuz · Feb 2026 · 2,100');
  });
});
