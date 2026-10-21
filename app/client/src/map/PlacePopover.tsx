import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fmtNum, fmtPct } from '../data/kpi';
import type { MapDatum } from './baseLayers';
import { tooltipPos } from './tooltip';

interface Props {
  datum: MapDatum;
  x: number;
  y: number;
  /** Map container size in pixels, so the card flips and clamps to stay inside it. */
  container: { w: number; h: number };
  /** Fills the chat input with a question about this place. */
  onAsk: (name: string) => void;
  onClose: () => void;
  /** False when Genie is not configured: the ask button is hidden. */
  canAsk: boolean;
}

/** Click card for a port or chokepoint: its numbers and an "Ask about" button. Esc closes it. */
export function PlacePopover({ datum, x, y, container, onAsk, onClose, canAsk }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Measured card size (starts at its fixed width), so it can flip away from the container edges.
  const [size, setSize] = useState({ w: 240, h: 150 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w !== size.w || h !== size.h) setSize({ w, h });
  }, [datum, canAsk, size]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const row = (k: string, v: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--gray-700)' }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={datum.name}
      style={{
        position: 'absolute',
        ...tooltipPos(x, y, container, size),
        zIndex: 4,
        width: 240,
        padding: '10px 12px',
        background: 'var(--white)',
        border: '1px solid var(--gray-300)',
        borderRadius: 10,
        fontSize: '0.8125rem',
        lineHeight: 1.45,
        boxShadow: '0 4px 14px rgba(11, 32, 38, 0.14)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
        <strong style={{ fontSize: '0.9rem' }}>
          {datum.name}
          {datum.country ? `, ${datum.country}` : ''}
        </strong>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray-700)' }}
        >
          ✕
        </button>
      </div>
      {row(datum.kind === 'chokepoint' ? 'Transits, 7-day avg' : 'Port calls, 7-day avg', fmtNum(datum.value7d, 1))}
      {row(datum.kind === 'chokepoint' ? 'Pre-war daily transits' : 'Pre-war baseline', fmtNum(datum.baseline, 1))}
      {row('Of pre-war normal', fmtPct(datum.pct))}
      {canAsk && (
        <button
          type="button"
          onClick={() => onAsk(datum.name)}
          style={{
            marginTop: 8,
            width: '100%',
            font: 'inherit',
            fontSize: '0.8125rem',
            fontWeight: 500,
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid var(--lava-600)',
            background: '#FFF4F2',
            color: 'var(--navy-900)',
            cursor: 'pointer',
          }}
        >
          Ask about {datum.name}
        </button>
      )}
    </div>
  );
}
