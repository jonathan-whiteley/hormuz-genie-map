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

  it('passes maxZoom, pitch, duration and the full bounds padding through', () => {
    const v: ViewState = { ...RESTING_VIEW, boundsPadding: { left: 230 }, maxZoom: 7 };
    expect(fitOptions(v, SIZE, NONE, 1200)).toEqual({
      padding: { top: 0, bottom: 0, left: 230, right: 0 },
      duration: 1200,
      maxZoom: 7,
      pitch: 45,
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
    // The boundary comes from RESTING_VIEW.boundsPadding so it cannot drift when the padding changes.
    const p = { top: 0, bottom: 0, left: 0, right: 0, ...RESTING_VIEW.boundsPadding };
    const across = p.left + p.right;
    const tour = 190;
    const down = p.top + p.bottom + tour;
    expect(fitOptions(RESTING_VIEW, { w: across, h: 520 }, NONE, 0)).toBeNull();
    expect(fitOptions(RESTING_VIEW, { w: 1040, h: down }, { ...NONE, bottom: tour }, 0)).toBeNull();
    expect(fitOptions(RESTING_VIEW, { w: 1040, h: down + 1 }, { ...NONE, bottom: tour }, 0)).not.toBeNull();
  });

  it('keeps the resting framing fit at the 1440 by 900 map size', () => {
    expect(fitOptions(RESTING_VIEW, SIZE, NONE, 0)).toEqual({
      padding: { top: 110, bottom: 60, left: 250, right: 170 },
      duration: 0,
      pitch: 45,
    });
  });

  it('passes the view pitch through, and never an undefined pitch key', () => {
    const size = { w: 1040, h: 784 };
    const none = { top: 0, bottom: 0, left: 0, right: 0 };
    const withPitch = fitOptions({ ...RESTING_VIEW, pitch: 45 }, size, none, 0);
    expect(withPitch?.pitch).toBe(45);
    const without = fitOptions({ longitude: 0, latitude: 0, zoom: 3, bounds: [[0, 0], [1, 1]] }, size, none, 0);
    expect(without && 'pitch' in without).toBe(false);
  });

  it('the resting view is pitched with extra room at the top', () => {
    expect(RESTING_VIEW.pitch).toBe(45);
    expect(RESTING_VIEW.boundsPadding?.top).toBe(110);
  });
});
