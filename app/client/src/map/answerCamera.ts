import type { ViewState } from './MapView';

type Bounds = [[number, number], [number, number]];

const ANSWER_PADDING = { top: 130, bottom: 80, left: 230, right: 200 };
const ANSWER_MAX_ZOOM = 7;

/** The answer whose camera was last applied, and the reader's view from before the first answer. */
export interface AnswerCamera {
  shownId: string | null;
  saved: ViewState | null;
}

export const ANSWER_CAMERA_START: AnswerCamera = { shownId: null, saved: null };

/**
 * What the camera does when the answer on the map changes. A new answer fits its bounds and saves
 * the reader's view (only the first time, so a second answer still flies back to where the reader
 * was); clearing flies back to the saved view. `next` is the view to set, or null to leave it.
 */
export function answerCamera(
  s: AnswerCamera,
  active: { id: string; bounds: Bounds | null } | null,
  view: ViewState
): { state: AnswerCamera; next: ViewState | null } {
  const id = active?.id ?? null;
  if (id === s.shownId) return { state: s, next: null };
  if (active) {
    if (!active.bounds) return { state: { ...s, shownId: id }, next: null };
    return {
      state: { shownId: id, saved: s.saved ?? view },
      next: { ...view, bounds: active.bounds, boundsPadding: ANSWER_PADDING, maxZoom: ANSWER_MAX_ZOOM },
    };
  }
  // A fresh object, so MapView refits even when the saved view equals the current one.
  return { state: { shownId: null, saved: null }, next: s.saved ? { ...s.saved } : null };
}

/** A tour step (or entering and leaving the tour) sets its own camera, so an earlier saved view is stale. */
export const tourReset = (s: AnswerCamera): AnswerCamera => (s.saved ? { ...s, saved: null } : s);
