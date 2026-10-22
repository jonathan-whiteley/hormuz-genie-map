import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ConflictEvent } from '../data/types';
import { DAY, fmtDate, monthTicks, toT } from '../explore/dates';
import { TEAL, rgbaCss } from '../map/colors';
import { SLIDER_HEIGHT, arrowFor, currentEvent, layoutEventLabels } from './eventLabels';
import { PlayButton } from './PlayButton';

interface Props {
  start: string;
  end: string;
  date: string;
  events: ConflictEvent[];
  onChange: (date: string) => void;
  playing: boolean;
  onTogglePlay: () => void;
}

/** Arrow and tick colour per effect: Lava for down, the "Shifted to alternative" teal for up, gray for context. */
function effectColor(effect: ConflictEvent['effect']): string {
  if (effect === 'down') return 'var(--lava-600)';
  if (effect === 'up') return rgbaCss(TEAL);
  return 'var(--gray-500)';
}

// Vertical layout inside the track area (px from its top).
const ROW_TOP = [20, 4] as const; // row 0 sits next to the track, row 1 above it
const ROW_H = 14;
const TRACK_TOP = 38;
const MONTHS_TOP = 58;
const TICK_TOP = ROW_TOP[0] + ROW_H;

/**
 * Day slider along the bottom of the map. War events sit above the track on two staggered rows,
 * each a short label with an arrow for the direction it pushed Hormuz traffic; the most recent event
 * on or before the selected date is emphasised. Month labels run below the track.
 */
export function DateSlider({ start, end, date, events, onChange, playing, onTogglePlay }: Props) {
  const t0 = toT(start);
  const days = Math.max(1, Math.round((toT(end) - t0) / DAY));
  const idx = Math.min(days, Math.max(0, Math.round((toT(date) - t0) / DAY)));
  const pos = (d: string) => `${(100 * Math.round((toT(d) - t0) / DAY)) / days}%`;
  const iso = (i: number) => new Date(t0 + i * DAY).toISOString().slice(0, 10);

  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const inRange = useMemo(
    () => events.filter((e) => e.event_date.slice(0, 10) >= start && e.event_date.slice(0, 10) <= end),
    [events, start, end]
  );
  const slots = useMemo(() => layoutEventLabels(inRange, start, end, width), [inRange, start, end, width]);
  const current = currentEvent(inRange, date);

  return (
    <section
      aria-label="Date"
      style={{
        height: SLIDER_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 20px',
        background: 'var(--white)',
        borderTop: '1px solid var(--gray-300)',
      }}
    >
      <PlayButton playing={playing} onToggle={onTogglePlay} label="the timeline" />
      <div style={{ fontWeight: 700, fontSize: '0.875rem', width: 104, flexShrink: 0 }}>{fmtDate(date)}</div>
      <div ref={track} style={{ position: 'relative', flex: 1, height: 74 }}>
        {width > 0 &&
          inRange.map((e, i) => {
            const slot = slots[i];
            const arrow = arrowFor(e.effect);
            const color = effectColor(e.effect);
            const isCurrent = e === current;
            const text = e.short_label ?? '';
            const anchor = arrow ? 4 : 0;
            const glyph = arrow && (
              <span aria-hidden style={{ color, fontSize: '0.625rem' }}>
                {arrow}
              </span>
            );
            const tip = `${fmtDate(e.event_date)}: ${e.event}`;
            return (
              <div key={`${e.event_date}-${e.event}`}>
                <button
                  type="button"
                  title={tip}
                  aria-label={tip}
                  onClick={() => onChange(e.event_date.slice(0, 10))}
                  // Not a tab stop: the range input already reaches every date by keyboard.
                  tabIndex={-1}
                  style={{
                    position: 'absolute',
                    // An event without a label (older table) keeps its hit area on the tick, as before.
                    top: text || arrow ? ROW_TOP[slot.row] : TICK_TOP,
                    left: slot.side === 'right' ? slot.x - anchor : slot.x + anchor,
                    transform: slot.side === 'right' ? undefined : 'translateX(-100%)',
                    height: ROW_H,
                    minWidth: 6,
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                    fontSize: '0.6875rem',
                    lineHeight: `${ROW_H}px`,
                    fontWeight: isCurrent ? 700 : 500,
                    color: e.effect === 'down' || e.effect === 'up' ? 'var(--navy-900)' : 'var(--gray-500)',
                    opacity: isCurrent ? 1 : 0.75,
                    cursor: 'pointer',
                    zIndex: 1,
                  }}
                >
                  {slot.side === 'right' && glyph}
                  {text}
                  {slot.side === 'left' && glyph}
                </button>
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    // A stub from under row 0 to the track, so a row 1 tick never strikes through a row 0 label.
                    top: TICK_TOP,
                    left: pos(e.event_date),
                    width: 2,
                    height: TRACK_TOP + 10 - TICK_TOP,
                    marginLeft: -1,
                    borderRadius: 1,
                    background: color,
                    opacity: isCurrent ? 1 : 0.55,
                    // Decoration only: drags and clicks on the track reach the range input.
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              </div>
            );
          })}
        <input
          type="range"
          aria-label="Selected date"
          min={0}
          max={days}
          step={1}
          value={idx}
          onChange={(e) => onChange(iso(Number(e.target.value)))}
          style={{
            position: 'absolute',
            top: TRACK_TOP,
            left: 0,
            right: 0,
            width: '100%',
            margin: 0,
            accentColor: 'var(--navy-900)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: MONTHS_TOP,
            left: 0,
            right: 0,
            fontSize: '0.66rem',
            color: 'var(--gray-500)',
          }}
        >
          {monthTicks(start, end).map((m) => (
            <span key={m} style={{ position: 'absolute', left: pos(m), transform: 'translateX(-50%)' }}>
              {new Date(toT(m)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
