import type { ConflictEvent } from '../data/types';
import { DAY, fmtDate, monthTicks, toT } from '../explore/dates';

interface Props {
  start: string;
  end: string;
  date: string;
  events: ConflictEvent[];
  onChange: (date: string) => void;
}

/** Slim day slider along the bottom of the map, with clickable war-event ticks and month labels. */
export function DateSlider({ start, end, date, events, onChange }: Props) {
  const t0 = toT(start);
  const days = Math.max(1, Math.round((toT(end) - t0) / DAY));
  const idx = Math.min(days, Math.max(0, Math.round((toT(date) - t0) / DAY)));
  const pos = (d: string) => `${(100 * Math.round((toT(d) - t0) / DAY)) / days}%`;
  const inRange = events.filter((e) => e.event_date.slice(0, 10) >= start && e.event_date.slice(0, 10) <= end);
  const iso = (i: number) => new Date(t0 + i * DAY).toISOString().slice(0, 10);

  return (
    <section
      aria-label="Date"
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 20px',
        background: 'var(--white)',
        borderTop: '1px solid var(--gray-300)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '0.875rem', width: 104, flexShrink: 0 }}>{fmtDate(date)}</div>
      <div style={{ position: 'relative', flex: 1, height: 34 }}>
        {inRange.map((e) => (
          <button
            key={`${e.event_date}-${e.event}`}
            type="button"
            title={`${fmtDate(e.event_date)}: ${e.event}`}
            aria-label={`${fmtDate(e.event_date)}: ${e.event}`}
            onClick={() => onChange(e.event_date.slice(0, 10))}
            // Not a tab stop: the range input already reaches every date by keyboard.
            tabIndex={-1}
            style={{
              position: 'absolute',
              top: 2,
              left: pos(e.event_date),
              width: 10,
              height: 11,
              padding: 0,
              border: 'none',
              background: 'transparent',
              display: 'flex',
              justifyContent: 'center',
              cursor: 'pointer',
              transform: 'translateX(-5px)',
              // Above the range input that follows, or its track would swallow the tick clicks.
              zIndex: 1,
            }}
          >
            <span
              aria-hidden
              style={{ width: 2, height: '100%', borderRadius: 1, background: 'var(--lava-600)', opacity: 0.8 }}
            />
          </button>
        ))}
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
            top: 2,
            left: 0,
            right: 0,
            width: '100%',
            margin: 0,
            accentColor: 'var(--navy-900)',
          }}
        />
        <div
          style={{ position: 'absolute', top: 20, left: 0, right: 0, fontSize: '0.66rem', color: 'var(--gray-500)' }}
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
