/**
 * eventData for every camera call MapView makes itself. MapLibre copies it into that call's moveend,
 * including the moveend stop() fires when a later call interrupts it, so each event says where it came from.
 */
export const PROGRAMMATIC = { programmatic: true } as const;

/**
 * Whether a moveend should be reported as the reader's camera. User gestures carry an originalEvent;
 * MapView's own calls carry PROGRAMMATIC and must not be reported, or the viewState effect would fly
 * back to an intermediate camera. A single shared flag failed here: an interrupted fit consumed it,
 * and the padding jumpTo that interrupted it was reported instead.
 */
export const reportsCamera = (e: { originalEvent?: unknown; programmatic?: boolean }): boolean =>
  !!e.originalEvent || !e.programmatic;
