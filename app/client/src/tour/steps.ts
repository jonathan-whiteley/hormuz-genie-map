import type { ConflictEvent, Dataset } from '../data/types';
import type { Toggles } from '../map/baseLayers';
import type { ViewState } from '../map/MapView';
import {
  QUESTIONS,
  body1,
  body2,
  body3,
  body4,
  body5,
  eventOn,
  firstSentences,
  regionsBounds,
  type SceneDate,
} from './copy';

export interface TourStep {
  id: 1 | 2 | 3 | 4 | 5;
  title: string;
  date: SceneDate;
  toggles: Toggles;
  center: [number, number];
  zoom: number;
  /** Fit the camera to every AIS sampling region (falls back to center and zoom without regions). */
  fitRegions?: boolean;
  /** Sent to Genie by "Ask Genie this". */
  question: string;
  body: (ds: Dataset, date: string) => string;
  event?: (ds: Dataset, date: string) => ConflictEvent | undefined;
}

const on = (o: Partial<Toggles>): Toggles => ({ chokepoints: false, ports: false, lanes: false, ais: false, ...o });

export const STEPS: TourStep[] = [
  {
    id: 1,
    title: 'Your exposure',
    date: '2026-02-15',
    toggles: on({ chokepoints: true, lanes: true }),
    center: [54.5, 25.5],
    zoom: 5.0,
    question: QUESTIONS[0],
    body: body1,
  },
  {
    id: 2,
    title: 'The strait closes',
    date: '2026-03-08',
    toggles: on({ chokepoints: true }),
    center: [56.4, 26.3],
    zoom: 6.6,
    question: QUESTIONS[4],
    body: body2,
    event: eventOn,
  },
  {
    id: 3,
    title: 'Where traffic went',
    date: 'latest',
    toggles: on({ ports: true, lanes: true }),
    center: [50.0, 22.0],
    zoom: 4.2,
    question: QUESTIONS[1],
    body: body3,
  },
  {
    id: 4,
    title: 'Lanes with no way around',
    date: 'latest',
    toggles: on({ chokepoints: true, lanes: true }),
    center: [51.5, 26.5],
    zoom: 5.6,
    question: QUESTIONS[3],
    body: body4,
  },
  {
    id: 5,
    title: 'What you cannot see',
    date: 'latest-ais',
    toggles: on({ chokepoints: true, ais: true }),
    center: [50.0, 30.0],
    zoom: 2.2,
    fitRegions: true,
    question: QUESTIONS[5],
    body: body5,
  },
];

/** Room under the camera for the tour caption bar at the bottom of the map. */
export const TOUR_PADDING_BOTTOM = 190;

export function stepCamera(step: TourStep, ds: Dataset): ViewState {
  const base: ViewState = { longitude: step.center[0], latitude: step.center[1], zoom: step.zoom };
  if (!step.fitRegions) return base;
  const bounds = regionsBounds(ds.regions);
  return bounds ? { ...base, bounds, boundsPadding: { top: 24, bottom: 24, left: 24, right: 24 } } : base;
}

/** The step's data-driven copy, cut to two sentences for the caption bar. */
export const stepCaption = (step: TourStep, ds: Dataset, date: string): string =>
  firstSentences(step.body(ds, date), 2);
