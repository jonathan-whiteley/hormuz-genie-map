import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../data/loadAll';
import type { Region } from '../../data/types';
import { RESTING } from '../../map/baseLayers';
import { firstSentences } from '../copy';
import { STEPS, stepCamera, stepCaption } from '../steps';
import { nextStep, prevStep, startTour, type TourSnapshot } from '../tourState';

const snap: TourSnapshot = {
  toggles: { ...RESTING, ports: true },
  date: '2026-06-01',
  view: { longitude: 1, latitude: 2, zoom: 3 },
};

describe('firstSentences', () => {
  it('keeps the first n sentences without splitting abbreviations or decimals', () => {
    const t =
      'Northwind Supply Co. (a fictional example) runs six lanes. Before the war it carried 2.6 a day. All ran normally.';
    expect(firstSentences(t, 2)).toBe(
      'Northwind Supply Co. (a fictional example) runs six lanes. Before the war it carried 2.6 a day.'
    );
    expect(firstSentences('One sentence.', 2)).toBe('One sentence.');
  });
});

describe('tourState', () => {
  it('walks forward, stops going back at the first step and ends after the last', () => {
    let t = startTour(snap);
    expect(t.step).toBe(0);
    expect(prevStep(t).step).toBe(0);
    for (let i = 1; i < STEPS.length; i++) {
      const n = nextStep(t);
      expect(n?.step).toBe(i);
      t = n!;
    }
    expect(nextStep(t)).toBeNull();
  });

  it('exit restores the snapshot (the caller reads t.snapshot)', () => {
    const t = nextStep(startTour(snap))!;
    expect(t.snapshot).toEqual(snap);
    expect(t.snapshot).not.toBe(snap);
  });
});

describe('steps', () => {
  it('has five steps, each with a question and at least one layer on', () => {
    expect(STEPS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
    for (const s of STEPS) {
      expect(s.question.length).toBeGreaterThan(10);
      expect(Object.values(s.toggles).some(Boolean)).toBe(true);
    }
  });

  it('falls back to the center view without regions, and fits regions when they exist', () => {
    const last = STEPS[4];
    expect(stepCamera(last, emptyDataset())).toEqual({
      longitude: last.center[0],
      latitude: last.center[1],
      zoom: last.zoom,
      pitch: 45,
    });
    const region = {
      region: 'r',
      role: 't',
      label: 'R',
      lat_min: 1,
      lon_min: 2,
      lat_max: 3,
      lon_max: 4,
      area_km2: 1,
    } as Region;
    const v = stepCamera(last, { ...emptyDataset(), regions: [region] });
    expect(v.bounds).toEqual([
      [2, 1],
      [4, 3],
    ]);
  });

  it('every step camera is pitched', () => {
    for (const s of STEPS) expect(stepCamera(s, emptyDataset()).pitch).toBe(45);
  });

  it('captions are at most two sentences and never throw on an empty dataset', () => {
    for (const s of STEPS) {
      const c = stepCaption(s, emptyDataset(), '2026-03-08');
      expect(c.split(/(?<=[.!?])\s+(?=[A-Z])/).length).toBeLessThanOrEqual(2);
    }
  });
});
