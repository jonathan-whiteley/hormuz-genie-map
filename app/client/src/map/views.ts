import type { ViewState } from './MapView';

/** Suez, Bab el-Mandeb and Hormuz in frame, clear of the layers card on the left. */
export const RESTING_VIEW: ViewState = {
  longitude: 46,
  latitude: 22,
  zoom: 4,
  bounds: [
    [32.4, 12.5],
    [57.2, 30.8],
  ],
  boundsPadding: { top: 60, bottom: 60, left: 250, right: 120 },
};
