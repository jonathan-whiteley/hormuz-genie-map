import { describe, expect, it } from 'vitest';
import {
  LABEL_ON_TOP,
  MAX_ELEVATION_SCALE,
  METERS_PER_VESSEL,
  MIN_ELEVATION_VESSELS,
  REF_ZOOM,
  ZOOM_STEP,
  columnTransitions,
  elevationOf,
  elevationScaleFor,
  labelZ,
  roundZoom,
} from '../columns';

describe('elevationOf', () => {
  it('is proportional to vessels a day', () => {
    expect(elevationOf(10)).toBe(10 * METERS_PER_VESSEL);
    expect(elevationOf(68)).toBe(68 * METERS_PER_VESSEL);
  });

  it('a zero or missing count still draws the minimum stub', () => {
    const stub = MIN_ELEVATION_VESSELS * METERS_PER_VESSEL;
    expect(elevationOf(0)).toBe(stub);
    expect(elevationOf(null)).toBe(stub);
    expect(elevationOf(undefined)).toBe(stub);
    expect(elevationOf(Number.NaN)).toBe(stub);
    expect(elevationOf(-3)).toBe(stub);
  });
});

describe('zoom scaling', () => {
  it('elevation scale and radius keep about the same screen size across zoom', () => {
    expect(elevationScaleFor(REF_ZOOM)).toBe(1);
    expect(elevationScaleFor(REF_ZOOM + 3)).toBeCloseTo(1 / 8);
    expect(elevationScaleFor(REF_ZOOM - 1)).toBeCloseTo(2);
  });

  it('labelZ is the column top at that zoom', () => {
    expect(labelZ(10, REF_ZOOM)).toBe(elevationOf(10));
    expect(labelZ(10, REF_ZOOM + 1)).toBeCloseTo(elevationOf(10) / 2);
  });
});

describe('world zoom', () => {
  it('clamps the elevation scale at 2 below the reference zoom', () => {
    expect(MAX_ELEVATION_SCALE).toBe(2);
    expect(elevationScaleFor(REF_ZOOM - 2)).toBe(2);
    expect(elevationScaleFor(0)).toBe(2);
    expect(labelZ(10, 0)).toBe(elevationOf(10) * 2);
  });
});

describe('roundZoom', () => {
  it('rounds the camera zoom to quarter steps', () => {
    expect(ZOOM_STEP).toBe(0.25);
    expect(roundZoom(4)).toBe(4);
    expect(roundZoom(3.83)).toBe(3.75);
    expect(roundZoom(6.9)).toBe(7);
    expect(roundZoom(6.12)).toBe(6);
    expect(roundZoom(6.13)).toBe(6.25);
  });
});

describe('LABEL_ON_TOP', () => {
  it('draws labels over columns and never writes depth', () => {
    expect(LABEL_ON_TOP).toEqual({ depthCompare: 'always', depthWriteEnabled: false });
  });
});

describe('columnTransitions', () => {
  it('animates elevation and color unless motion is reduced', () => {
    expect(columnTransitions(false)).toEqual({ getElevation: 120, getFillColor: 120 });
  });

  it('transitions off when reduced', () => {
    expect(columnTransitions(true)).toBeUndefined();
  });
});
