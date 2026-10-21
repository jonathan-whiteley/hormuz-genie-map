import { describe, expect, it } from 'vitest';
import { PROGRAMMATIC, reportsCamera } from '../cameraEvents';

describe('reportsCamera', () => {
  it('ignores the moveend of a programmatic camera call, finished or interrupted', () => {
    // MapLibre copies a call's eventData into its moveend, including the one stop() fires on interruption.
    expect(reportsCamera({ ...PROGRAMMATIC })).toBe(false);
  });

  it('reports a user gesture, even one that interrupts a programmatic flight', () => {
    expect(reportsCamera({ originalEvent: {} })).toBe(true);
    expect(reportsCamera({ ...PROGRAMMATIC, originalEvent: {} })).toBe(true);
  });

  it('reports untagged moves such as a resize', () => {
    expect(reportsCamera({})).toBe(true);
  });

  it('decides per event, so an interrupted fit cannot let a later padding change through', () => {
    // Restore fit interrupted by the tour padding jumpTo: two moveends, both programmatic.
    const events = [{ ...PROGRAMMATIC }, { ...PROGRAMMATIC }];
    expect(events.map(reportsCamera)).toEqual([false, false]);
  });
});
