import { useState } from 'react';
import { GRAY, NAVY, pctColor, rgbaCss, statusColor } from './colors';

const STATUSES = ['Normal', 'Degraded', 'Shifted to alternative', 'Disrupted', 'No data'];

const swatchLine = (status: string) => (
  <span
    style={{ display: 'inline-block', width: 18, height: 3, borderRadius: 2, background: rgbaCss(statusColor(status)) }}
  />
);

/** Collapsible map key: percent ramp, lane status, gray meaning, marker size and AIS cells. */
export function Legend({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const ramp = `linear-gradient(to right, ${rgbaCss(pctColor(0))}, ${rgbaCss(pctColor(50))}, ${rgbaCss(pctColor(100))})`;
  const row = { display: 'flex', alignItems: 'center', gap: 8 };
  return (
    <div
      aria-label="Map legend"
      style={{
        position: 'absolute',
        right: 12,
        bottom: 40,
        zIndex: 3,
        background: 'var(--white)',
        border: '1px solid var(--gray-300)',
        borderRadius: 8,
        padding: open ? '8px 10px' : '4px 8px',
        fontSize: '0.75rem',
        lineHeight: 1.35,
        color: 'var(--navy-900)',
        width: open ? 236 : 'auto',
        boxShadow: '0 2px 8px rgba(11, 32, 38, 0.08)',
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          fontWeight: 700,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          width: '100%',
        }}
      >
        <span>Legend</span>
        <span aria-hidden>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          <div>
            <div style={{ color: 'var(--gray-700)' }}>Ports and chokepoints: percent of pre-war baseline</div>
            <div style={{ height: 8, borderRadius: 4, background: ramp, marginTop: 3 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--gray-700)' }}>
              <span>0%</span>
              <span>50%</span>
              <span>100% or more</span>
            </div>
          </div>
          <div style={row}>
            <span
              style={{ width: 10, height: 10, borderRadius: 999, background: rgbaCss(GRAY), display: 'inline-block' }}
            />
            Gray: no data or small baseline
          </div>
          <div style={row}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {[6, 10, 14].map((s) => (
                <span
                  key={s}
                  style={{
                    width: s,
                    height: s,
                    borderRadius: 999,
                    border: '1.5px solid var(--navy-900)',
                    display: 'inline-block',
                  }}
                />
              ))}
            </span>
            Marker size: 7-day visible calls
          </div>
          <div style={{ display: 'grid', gap: 2 }}>
            <div style={{ color: 'var(--gray-700)' }}>Lane status</div>
            {STATUSES.map((s) => (
              <div key={s} style={row}>
                {swatchLine(s)}
                {s}
              </div>
            ))}
          </div>
          <div style={row}>
            <span
              style={{
                width: 12,
                height: 10,
                background: rgbaCss([...NAVY, 150]),
                display: 'inline-block',
                clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)',
              }}
            />
            AIS cells: vessels heard (AIS visibility)
          </div>
          <div style={row}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: 'var(--navy-900)',
                border: '2px solid var(--lava-600)',
                display: 'inline-block',
              }}
            />
            Genie answer: points or outlined cells
          </div>
          <div style={{ color: 'var(--gray-700)', fontStyle: 'italic' }}>Routes are schematic, not sailing paths.</div>
        </div>
      )}
    </div>
  );
}
