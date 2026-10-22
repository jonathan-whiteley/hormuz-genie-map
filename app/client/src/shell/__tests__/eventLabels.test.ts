import { describe, expect, it } from 'vitest';
import type { ConflictEvent } from '../../data/types';
import { arrowFor, currentEvent, layoutEventLabels, type LabelSlot } from '../eventLabels';

const ev = (event_date: string, short_label: string | null, effect: ConflictEvent['effect']): ConflictEvent => ({
  event_date,
  event: `${short_label ?? 'event'} (full text)`,
  source_url: 'https://example.com/',
  effect,
  short_label,
});

/** The nine approved events from ref_conflict_events. */
const EVENTS: ConflictEvent[] = [
  ev('2026-02-28', 'War starts', 'down'),
  ev('2026-03-04', 'Strait closed', 'down'),
  ev('2026-03-08', 'Brent over $100', 'context'),
  ev('2026-04-08', 'Ceasefire', 'up'),
  ev('2026-04-17', 'Partial reopening', 'up'),
  ev('2026-06-17', 'Peace memo', 'up'),
  ev('2026-06-20', 'Strait reclosed', 'down'),
  ev('2026-07-08', 'Ceasefire collapses', 'down'),
  ev('2026-09-22', 'Pipeline to Yanbu', 'context'),
];
const START = '2026-01-01';
const END = '2026-10-20';
const WIDTH = 820;

const overlaps = (a: LabelSlot, b: LabelSlot) => a.row === b.row && a.left < b.right && b.left < a.right;
const at = (slots: LabelSlot[], date: string) => slots[EVENTS.findIndex((e) => e.event_date === date)];

describe('layoutEventLabels', () => {
  const slots = layoutEventLabels(EVENTS, START, END, WIDTH);

  it('places every event in row 0 or 1, in input order', () => {
    expect(slots).toHaveLength(EVENTS.length);
    for (const s of slots) expect([0, 1]).toContain(s.row);
    expect(slots.map((s) => s.x)).toEqual([...slots.map((s) => s.x)].sort((a, b) => a - b));
  });

  it('keeps Feb 28, Mar 4 and Mar 8 off a row with an overlapping neighbor', () => {
    const cluster = ['2026-02-28', '2026-03-04', '2026-03-08'].map((d) => at(slots, d));
    for (const a of cluster) for (const b of cluster) if (a !== b) expect(overlaps(a, b)).toBe(false);
    expect(at(slots, '2026-03-04').row).not.toBe(at(slots, '2026-02-28').row);
    expect(at(slots, '2026-03-04').row).not.toBe(at(slots, '2026-03-08').row);
  });

  it('staggers Apr 8 / Apr 17 and Jun 17 / Jun 20', () => {
    expect(at(slots, '2026-04-08').row).not.toBe(at(slots, '2026-04-17').row);
    expect(at(slots, '2026-06-17').row).not.toBe(at(slots, '2026-06-20').row);
  });

  it('has no overlapping labels at all for the real events', () => {
    for (let i = 0; i < slots.length; i++)
      for (let j = i + 1; j < slots.length; j++) expect(overlaps(slots[i], slots[j])).toBe(false);
  });

  it('keeps every label on its tick and inside the track', () => {
    for (const s of slots) {
      expect(s.left).toBeLessThanOrEqual(s.x);
      expect(s.right).toBeGreaterThanOrEqual(s.x);
      expect(s.left).toBeGreaterThanOrEqual(0);
      expect(s.right).toBeLessThanOrEqual(WIDTH);
    }
  });

  it('prefers the first row and the right side when there is room', () => {
    const lone = layoutEventLabels([ev('2026-05-01', 'Alone', 'up')], START, END, WIDTH);
    expect(lone[0].row).toBe(0);
    expect(lone[0].side).toBe('right');
  });

  it('never drops an event when both rows collide', () => {
    const pile = [1, 2, 3, 4, 5].map((i) => ev('2026-05-01', `Pile ${i}`, 'down'));
    const out = layoutEventLabels(pile, START, END, WIDTH);
    expect(out).toHaveLength(5);
    for (const s of out) expect([0, 1]).toContain(s.row);
  });

  it('does not depend on input order', () => {
    const reversed = layoutEventLabels([...EVENTS].reverse(), START, END, WIDTH).reverse();
    expect(reversed).toEqual(slots);
  });

  it('sizes labels from the character width plus the arrow', () => {
    const [down] = layoutEventLabels([ev('2026-05-01', 'Ten chars!', 'down')], START, END, WIDTH, 6.5);
    const [ctx] = layoutEventLabels([ev('2026-05-01', 'Ten chars!', 'context')], START, END, WIDTH, 6.5);
    expect(ctx.right - ctx.left).toBeCloseTo(65, 5);
    expect(down.right - down.left).toBeGreaterThan(65);
  });

  it('tolerates events without a short label (older table)', () => {
    const out = layoutEventLabels([ev('2026-05-01', null, null)], START, END, WIDTH);
    expect(out).toHaveLength(1);
    expect(out[0].left).toBeLessThanOrEqual(out[0].x);
  });
});

describe('arrowFor', () => {
  it('uses text-style arrows for down and up, none for context', () => {
    expect(arrowFor('down')).toBe('▼︎');
    expect(arrowFor('up')).toBe('▲︎');
    expect(arrowFor('context')).toBe('');
    expect(arrowFor(null)).toBe('');
  });
});

describe('currentEvent', () => {
  it('is null before the first event', () => {
    expect(currentEvent(EVENTS, '2026-02-27')).toBeNull();
  });

  it('matches an event on its exact date', () => {
    expect(currentEvent(EVENTS, '2026-03-04')?.short_label).toBe('Strait closed');
  });

  it('is the most recent event between two events', () => {
    expect(currentEvent(EVENTS, '2026-04-12')?.short_label).toBe('Ceasefire');
    expect(currentEvent(EVENTS, '2026-12-31')?.short_label).toBe('Pipeline to Yanbu');
  });

  it('ignores input order and timestamp suffixes', () => {
    const mixed = [...EVENTS].reverse().map((e) => ({ ...e, event_date: `${e.event_date}T00:00:00.000Z` }));
    expect(currentEvent(mixed, '2026-06-19')?.short_label).toBe('Peace memo');
  });
});
