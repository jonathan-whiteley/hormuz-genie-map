import { useCallback, useState } from 'react';
import { useData } from '../data/DataContext';
import { resolveSceneDate } from '../tour/copy';
import { STEPS, stepCamera } from '../tour/steps';
import { nextStep, prevStep, startTour, type TourState } from '../tour/tourState';
import { RESTING, type Toggles } from './baseLayers';
import type { ViewState } from './MapView';
import { RESTING_VIEW } from './views';

/** Map toggles, date, camera and the tour, owned by App so the top bar can start and stop the tour. */
export function useMapState() {
  const { dataset } = useData();
  const [toggles, setToggles] = useState<Toggles>(RESTING);
  /** null means "latest". */
  const [date, setDate] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>(RESTING_VIEW);
  const [tour, setTour] = useState<TourState | null>(null);

  const apply = useCallback(
    (step: number) => {
      const s = STEPS[step];
      setToggles(s.toggles);
      setDate(resolveSceneDate(s.date, dataset));
      setView(stepCamera(s, dataset));
    },
    [dataset]
  );

  const exitTour = useCallback(() => {
    if (!tour) return;
    // Fresh objects, so MapView refits even when the saved view is the same as before.
    setToggles({ ...tour.snapshot.toggles });
    setDate(tour.snapshot.date);
    setView({ ...tour.snapshot.view });
    setTour(null);
  }, [tour]);

  const beginTour = useCallback(() => {
    setTour(startTour({ toggles, date, view }));
    apply(0);
  }, [toggles, date, view, apply]);

  const next = useCallback(() => {
    if (!tour) return;
    const t = nextStep(tour);
    if (!t) return exitTour();
    setTour(t);
    apply(t.step);
  }, [tour, apply, exitTour]);

  const back = useCallback(() => {
    if (!tour) return;
    const t = prevStep(tour);
    setTour(t);
    apply(t.step);
  }, [tour, apply]);

  return { toggles, setToggles, date, setDate, view, setView, tour, beginTour, nextStep: next, prevStep: back, exitTour };
}

export type MapState = ReturnType<typeof useMapState>;
