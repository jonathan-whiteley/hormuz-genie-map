/**
 * The slider date around a series answer. When a series answer comes on, the reader's date from
 * just before its autoplay is saved; when it leaves (cleared, New chat, or replaced by a non-series
 * answer), that date comes back, even if the reader dragged the slider meanwhile. A series that
 * replaces a series keeps the first saved date. `null` is the latest day.
 */
export interface SeriesDate {
  /** The series answer on the map, or null. */
  id: string | null;
  /** The date from before that answer's autoplay. */
  saved: string | null;
}

export const SERIES_DATE_START: SeriesDate = { id: null, saved: null };

export function seriesDate(
  s: SeriesDate,
  active: { id: string; series: boolean } | null,
  date: string | null
): { state: SeriesDate; restore: { date: string | null } | null } {
  const seriesId = active?.series ? active.id : null;
  if (seriesId === s.id) return { state: s, restore: null };
  if (seriesId) return { state: { id: seriesId, saved: s.id ? s.saved : date }, restore: null };
  return { state: SERIES_DATE_START, restore: { date: s.saved } };
}
