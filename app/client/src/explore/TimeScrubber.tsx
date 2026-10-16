import { useState } from 'react';
import type { ConflictEvent } from '../data/types';

import { DAY, fmtDate, monthTicks, toISO, toT } from './dates';

interface Props {
  start?: string;
  end: string;
  date: string;
  onChange: (date: string) => void;
  events: ConflictEvent[];
  /** Small chip under the selected date, e.g. the latest PortWatch day. */
  note?: string;
}

/** Day-step range input from start to end with clickable conflict-event ticks. */
export function TimeScrubber({ start = '2026-01-01', end, date, onChange, events, note }: Props) {
  const t0 = toT(start);
  const days = Math.max(1, Math.round((toT(end) - t0) / DAY));
  const idx = Math.min(days, Math.max(0, Math.round((toT(date) - t0) / DAY)));
  const [active, setActive] = useState<ConflictEvent | null>(null);
  const pos = (d: string) => `${(100 * Math.round((toT(d) - t0) / DAY)) / days}%`;
  const inRange = events.filter((e) => e.event_date.slice(0, 10) >= start && e.event_date.slice(0, 10) <= end);
  const months = monthTicks(start, end);

  return (
    <section
      aria-label="Time scrubber"
      style={{
        background: 'var(--light)',
        borderTop: '1px solid var(--gray-300)',
        padding: '10px var(--space-3) 12px',
        display: 'grid',
        gridTemplateColumns: '132px 1fr',
        columnGap: 'var(--space-2)',
        alignItems: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--gray-700)' }}>Selected date</div>
        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmtDate(date)}</div>
        {note && (
          <span
            style={{
              display: 'inline-block',
              marginTop: 4,
              fontSize: '0.6875rem',
              padding: '1px 6px',
              borderRadius: 999,
              background: 'var(--gray-100)',
              color: 'var(--gray-700)',
            }}
          >
            {note}
          </span>
        )}
      </div>
      <div style={{ position: 'relative', paddingTop: 18 }}>
        <div style={{ position: 'absolute', top: 0, left: 8, right: 8, height: 16 }}>
          {inRange.map((e) => {
            const on = active?.event === e.event && active?.event_date === e.event_date;
            return (
              <button
                key={`${e.event_date}-${e.event}`}
                type="button"
                title={`${e.event_date.slice(0, 10)}: ${e.event}`}
                aria-label={`${e.event_date.slice(0, 10)}: ${e.event}`}
                onClick={() => {
                  setActive(e);
                  onChange(e.event_date.slice(0, 10));
                }}
                style={{
                  position: 'absolute',
                  left: pos(e.event_date),
                  transform: 'translateX(-50%)',
                  top: 0,
                  width: 14,
                  height: 16,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    margin: '0 auto',
                    width: on ? 4 : 2,
                    height: 16,
                    borderRadius: 1,
                    background: 'var(--lava-600)',
                  }}
                />
              </button>
            );
          })}
        </div>
        <input
          type="range"
          aria-label="Date"
          min={0}
          max={days}
          step={1}
          value={idx}
          onChange={(ev) => {
            setActive(null);
            onChange(toISO(t0 + Number(ev.target.value) * DAY));
          }}
          style={{ width: '100%', accentColor: 'var(--navy-900)', margin: 0 }}
        />
        <div
          style={{ position: 'relative', height: 14, margin: '0 8px', fontSize: '0.6875rem', color: 'var(--gray-700)' }}
        >
          {months.map((m) => (
            <span key={m} style={{ position: 'absolute', left: pos(m), transform: 'translateX(-50%)' }}>
              {new Date(toT(m)).toLocaleDateString('en-US', {
                month: 'short',
                ...(m.endsWith('-01-01') && m > start ? { year: 'numeric' } : null),
                timeZone: 'UTC',
              })}
            </span>
          ))}
        </div>
        {active && (
          <p role="status" style={{ margin: '6px 0 0', fontSize: '0.875rem' }}>
            <strong>{fmtDate(active.event_date)}:</strong> {active.event}{' '}
            {active.source_url && (
              <a href={active.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--navy-900)' }}>
                Source
              </a>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
