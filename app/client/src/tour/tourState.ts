import type { Toggles } from '../map/baseLayers';
import type { ViewState } from '../map/MapView';
import { STEPS } from './steps';

/** What the map looked like before the tour, restored on exit. */
export interface TourSnapshot {
  toggles: Toggles;
  date: string | null;
  view: ViewState;
}

export interface TourState {
  step: number;
  snapshot: TourSnapshot;
}

export const startTour = (s: TourSnapshot): TourState => ({
  step: 0,
  snapshot: { toggles: { ...s.toggles }, date: s.date, view: { ...s.view } },
});

/** The next step, or null after the last one (the caller then exits and restores the snapshot). */
export const nextStep = (t: TourState): TourState | null =>
  t.step + 1 < STEPS.length ? { ...t, step: t.step + 1 } : null;

export const prevStep = (t: TourState): TourState => ({ ...t, step: Math.max(0, t.step - 1) });
