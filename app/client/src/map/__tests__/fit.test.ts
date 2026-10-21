import { describe, expect, it } from 'vitest';
import { fitOptions } from '../fit';
import type { ViewState } from '../MapView';
import { RESTING_VIEW } from '../views';

const NONE = { top: 0, bottom: 0, left: 0, right: 0 };
const SIZE = { w: 1040, h: 520 };

describe('fitOptions', () => {
  it('omits maxZoom when the view has none, so MapLibre keeps its own default', () => {
    // MapLibre copies an own maxZoom key even when it is undefined, and Math.min(zoom, undefined) is NaN.
    const o = fitOptions(RESTING_VIEW, SIZE, NONE, 0);
    expect(o).not.toBeNull();
    expect(o && 'maxZoom' in o).toBe(false);
  });

  it('passes maxZoom, duration and the full bounds padding through', () => {
    const v: ViewState = { ...RESTING_VIEW, boundsPadding: { left: 230 }, maxZoom: 7 };
    expect(fitOptions(v, SIZE, NONE, 1200)).toEqual({
      padding: { top: 0, bottom: 0, left: 230, right: 0 },
      duration: 1200,
      maxZoom: 7,
    });
  });

  it('returns null without bounds', () => {
    expect(fitOptions({ longitude: 46, latitude: 22, zoom: 4 }, SIZE, NONE, 0)).toBeNull();
  });

  it('returns null when the container has no size', () => {
    expect(fitOptions(RESTING_VIEW, { w: 0, h: 0 }, NONE, 0)).toBeNull();
    expect(fitOptions(RESTING_VIEW, { w: 1040, h: 0 }, NONE, 0)).toBeNull();
  });

  it('returns null when map and bounds padding leave no room', () => {
    // RESTING_VIEW pads 370 px across and 120 px down.
    expect(fitOptions(RESTING_VIEW, { w: 370, h: 520 }, NONE, 0)).toBeNull();
    expect(fitOptions(RESTING_VIEW, { w: 1040, h: 310 }, { ...NONE, bottom: 190 }, 0)).toBeNull();
    expect(fitOptions(RESTING_VIEW, { w: 1040, h: 311 }, { ...NONE, bottom: 190 }, 0)).not.toBeNull();
  });

  it('keeps the resting framing fit at the 1440 by 900 map size', () => {
    expect(fitOptions(RESTING_VIEW, SIZE, NONE, 0)).toEqual({
      padding: { top: 60, bottom: 60, left: 250, right: 120 },
      duration: 0,
    });
  });
});
