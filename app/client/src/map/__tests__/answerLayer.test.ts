import { describe, expect, it } from 'vitest';
import type { AnswerFeature } from '../../genie/answerFeatures';
import { answerLabel, buildAnswerLayers } from '../answerLayer';
import type { MapDatum } from '../baseLayers';

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
