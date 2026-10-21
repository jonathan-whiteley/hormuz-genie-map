import type { Padding, ViewState } from './MapView';

export interface FitOptions {
  padding: Padding;
  duration: number;
  maxZoom?: number;
}

const NO_PADDING: Padding = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * MapLibre fitBounds options for a view, or null when no fit should be issued: the view has no
 * bounds, the container has no size, or the map padding plus the bounds padding leave no room.
 * maxZoom is only set when the view has one: MapLibre copies an own undefined key over its
 * default, and Math.min(zoom, undefined) is NaN, which throws "Invalid LngLat object: (NaN, NaN)".
 */
export function fitOptions(
  view: ViewState,
  size: { w: number; h: number },
  mapPadding: Padding,
  duration: number
): FitOptions | null {
  if (!view.bounds) return null;
  const padding = { ...NO_PADDING, ...view.boundsPadding };
  const roomW = size.w - mapPadding.left - mapPadding.right - padding.left - padding.right;
  const roomH = size.h - mapPadding.top - mapPadding.bottom - padding.top - padding.bottom;
  if (!(roomW > 0 && roomH > 0)) return null;
  return view.maxZoom == null ? { padding, duration } : { padding, duration, maxZoom: view.maxZoom };
}
