const GAP = 12;
const EDGE = 4;

/**
 * Tooltip top-left for a cursor at (x, y) inside a w x h container: below-right of the cursor, flipped
 * to the left or above when it would overflow, and kept inside the container.
 */
export function tooltipPos(
  x: number,
  y: number,
  container: { w: number; h: number },
  tip: { w: number; h: number }
): { left: number; top: number } {
  let left = x + GAP;
  if (left + tip.w > container.w - EDGE) left = x - GAP - tip.w;
  let top = y + GAP;
  if (top + tip.h > container.h - EDGE) top = y - GAP - tip.h;
  return {
    left: Math.max(EDGE, Math.min(left, container.w - EDGE - tip.w)),
    top: Math.max(EDGE, Math.min(top, container.h - EDGE - tip.h)),
  };
}
