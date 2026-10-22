/**
 * 3D column sizing. Heights are meters at REF_ZOOM and are rescaled by zoom (elevationScale), so a
 * column keeps about the same screen height whether the camera fits the whole region or one port.
 */
export const REF_ZOOM = 4;

/** Elevation in meters per vessel a day at REF_ZOOM: Hormuz before the war (about 68) is the tallest column. */
export const METERS_PER_VESSEL = 14000;

/** A closed strait still reads as a place: a short stub, never nothing. */
export const MIN_ELEVATION_VESSELS = 1.5;

/** Column radius in screen pixels. */
export const COLUMN_RADIUS_PX = { chokepoint: 9, port: 5 } as const;

/** Length of one height or color transition in ms, about one playback frame. */
const TRANSITION_MS = 120;

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

export function elevationOf(v: number | null | undefined): number {
  return Math.max(ok(v) ? v : 0, MIN_ELEVATION_VESSELS) * METERS_PER_VESSEL;
}

/** Column heights follow the camera zoom in steps of this size, so a camera flight rebuilds them a few times, not per frame. */
export const ZOOM_STEP = 0.25;

/** The camera zoom rounded to ZOOM_STEP. */
export const roundZoom = (zoom: number): number => Math.round(zoom / ZOOM_STEP) * ZOOM_STEP;

/** Cap on the zoom multiplier, so columns do not stretch across continents at world zoom. */
export const MAX_ELEVATION_SCALE = 2;

export const elevationScaleFor = (zoom: number): number => Math.min(MAX_ELEVATION_SCALE, 2 ** (REF_ZOOM - zoom));

/** Altitude of the column top in meters at this zoom, for a label that sits on the column. */
export const labelZ = (v: number | null | undefined, zoom: number): number => elevationOf(v) * elevationScaleFor(zoom);

/** GPU parameters for labels: drawn over every column, never hidden by depth, never hiding anything. */
export const LABEL_ON_TOP = { depthCompare: 'always', depthWriteEnabled: false } as const;

export function columnTransitions(reduced: boolean): { getElevation: number; getFillColor: number } | undefined {
  return reduced ? undefined : { getElevation: TRANSITION_MS, getFillColor: TRANSITION_MS };
}
