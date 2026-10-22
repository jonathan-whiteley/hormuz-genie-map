import type { ViewState } from './MapView';

/** The map is tilted so the vessel columns read as heights. */
export const DEFAULT_PITCH = 45;

/** Suez, Bab el-Mandeb and Hormuz in frame, clear of the layers card on the left; extra top room for the tilt. */
export const RESTING_VIEW: ViewState = {
  longitude: 46,
  latitude: 22,
  zoom: 4,
  pitch: DEFAULT_PITCH,
  bounds: [
    [32.4, 12.5],
    [57.2, 30.8],
  ],
  boundsPadding: { top: 110, bottom: 60, left: 250, right: 170 },
};
