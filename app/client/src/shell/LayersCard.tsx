import type { Toggles } from '../map/baseLayers';

const ROWS: { key: keyof Toggles; label: string }[] = [
  { key: 'chokepoints', label: 'Chokepoints' },
  { key: 'ports', label: 'Ports' },
  { key: 'lanes', label: 'Supply lanes' },
  { key: 'vessels', label: 'Vessels' },
];

/** Floating top-left card with one switch per base layer. */
export function LayersCard({ toggles, onChange }: { toggles: Toggles; onChange: (t: Toggles) => void }) {
  return (
    <div
      role="group"
      aria-label="Layers"
      style={{
        position: 'absolute',
        top: 14,
        left: 14,
        zIndex: 3,
        width: 186,
        padding: '10px 12px',
        background: 'var(--white)',
        border: '1px solid var(--gray-300)',
        borderRadius: 10,
        boxShadow: '0 2px 10px rgba(11, 32, 38, 0.08)',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--gray-500)',
          marginBottom: 6,
        }}
      >
        Layers
      </div>
      {ROWS.map(({ key, label }) => {
        const on = toggles[key];
        return (
          <button
            key={key}
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => onChange({ ...toggles, [key]: !on })}
            className="layer-switch"
            // Explicit resets, not `all: unset`: an inline outline reset would beat the focus-visible rule.
            style={{
              border: 'none',
              background: 'none',
              color: 'inherit',
              font: 'inherit',
              textAlign: 'left',
              boxSizing: 'border-box',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 0',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            {label}
            <span
              aria-hidden
              style={{
                width: 30,
                height: 18,
                borderRadius: 999,
                background: on ? 'var(--navy-900)' : 'var(--gray-300)',
                position: 'relative',
                transition: 'background 0.15s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: on ? 14 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'var(--white)',
                  transition: 'left 0.15s',
                }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
