import type { ConflictEvent, EventEffect } from '../data/types';
import { DAY, toT } from '../explore/dates';

/** Where one event label sits above the slider track, in px from the track's left edge. */
export interface LabelSlot {
  /** 0 is the row next to the track, 1 the row above it. */
  row: 0 | 1;
  /** right: the label starts at its tick and runs right; left: it ends at its tick. */
  side: 'right' | 'left';
  /** The tick position. */
  x: number;
  /** Estimated label box, always containing x. */
  left: number;
  right: number;
}

/** Text-style arrows (U+FE0E keeps them from rendering as emoji). */
export function arrowFor(effect: EventEffect | null | undefined): string {
  if (effect === 'down') return '▼︎';
  if (effect === 'up') return '▲︎';
  return '';
}

/** Room for the arrow glyph and its space. */
export const ARROW_PX = 10;
/** The arrow's centre sits on the tick, so the box starts this far before it. */
const ANCHOR_PX = 4;
/** Minimum space between two labels in one row. */
const GAP_PX = 6;
/** Consecutive events closer than this are staggered onto different rows when possible. */
const CLOSE_PX = 48;

const OVERLAP_COST = 100; // per px of overlap or of label outside the track
const LEFT_COST = 3;
const ROW1_COST = 1;
const SAME_ROW_CLOSE_COST = 4;

const OPTIONS: { row: 0 | 1; side: 'right' | 'left' }[] = [
  { row: 0, side: 'right' },
  { row: 1, side: 'right' },
  { row: 0, side: 'left' },
  { row: 1, side: 'left' },
];

/** Estimated label width: characters times charPx, plus the arrow; a bare tick when there is no label. */
export function labelWidth(e: ConflictEvent, charPx: number): number {
  const chars = (e.short_label ?? '').length;
  const arrow = arrowFor(e.effect) ? ARROW_PX : 0;
  return chars === 0 && arrow === 0 ? GAP_PX : chars * charPx + arrow;
}

interface Best {
  cost: number;
  picks: number[];
}

/**
 * Two staggered label rows above the track. Each label sits on its tick, starting there (preferred)
 * or ending there, in row 0 (preferred) or row 1. The placement minimises overlap first, then
 * left-side labels, row 1 labels and close neighbours sharing a row. Every event gets a slot: when
 * nothing fits, labels overlap as little as possible. Returned in input order.
 */
export function layoutEventLabels(
  events: ConflictEvent[],
  start: string,
  end: string,
  widthPx: number,
  charPx = 6.5
): LabelSlot[] {
  const t0 = toT(start);
  const days = Math.max(1, Math.round((toT(end) - t0) / DAY));
  const items = events
    .map((e, i) => ({
      i,
      x: (widthPx * Math.round((toT(e.event_date) - t0) / DAY)) / days,
      w: labelWidth(e, charPx),
      anchor: arrowFor(e.effect) ? ANCHOR_PX : 0,
    }))
    .sort((a, b) => a.x - b.x || a.i - b.i);

  const box = (k: number, side: 'right' | 'left') => {
    const { x, w, anchor } = items[k];
    const left = side === 'right' ? x - anchor : x + anchor - w;
    return { left, right: left + w };
  };

  const memo = new Map<string, Best>();
  const solve = (k: number, end0: number, end1: number, prevRow: number): Best => {
    if (k === items.length) return { cost: 0, picks: [] };
    const key = `${k}|${end0}|${end1}|${prevRow}`;
    const hit = memo.get(key);
    if (hit) return hit;
    let best: Best | null = null;
    OPTIONS.forEach((o, n) => {
      const { left, right } = box(k, o.side);
      const rowEnd = o.row === 0 ? end0 : end1;
      const overlap = Math.max(0, rowEnd + GAP_PX - left);
      const outside = Math.max(0, -left) + Math.max(0, right - widthPx);
      const close = k > 0 && o.row === prevRow && items[k].x - items[k - 1].x < CLOSE_PX;
      const here =
        OVERLAP_COST * (overlap + outside) +
        (o.side === 'left' ? LEFT_COST : 0) +
        (o.row === 1 ? ROW1_COST : 0) +
        (close ? SAME_ROW_CLOSE_COST : 0);
      if (best && here >= best.cost) return;
      const rest = solve(
        k + 1,
        o.row === 0 ? Math.max(end0, right) : end0,
        o.row === 1 ? Math.max(end1, right) : end1,
        o.row
      );
      const cost = here + rest.cost;
      if (!best || cost < best.cost) best = { cost, picks: [n, ...rest.picks] };
    });
    memo.set(key, best!);
    return best!;
  };

  const { picks } = solve(0, -Infinity, -Infinity, -1);
  const out: LabelSlot[] = [];
  items.forEach((it, k) => {
    const o = OPTIONS[picks[k]];
    out[it.i] = { row: o.row, side: o.side, x: it.x, ...box(k, o.side) };
  });
  return out;
}

/** The most recent event on or before date (YYYY-MM-DD), or null before the first event. */
export function currentEvent(events: ConflictEvent[], date: string): ConflictEvent | null {
  const day = date.slice(0, 10);
  let best: ConflictEvent | null = null;
  for (const e of events) {
    const d = e.event_date.slice(0, 10);
    if (d <= day && (!best || d > best.event_date.slice(0, 10))) best = e;
  }
  return best;
}

/** Height of the date bar: two label rows, the track and the month labels (MapScreen's grid row uses it). */
export const SLIDER_HEIGHT = 84;
