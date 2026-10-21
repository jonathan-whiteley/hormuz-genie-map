import { pctColor, rgbaCss, statusColor } from './colors';
import type { Toggles } from './baseLayers';
import { legendItems } from './legendItems';

const ramp = `linear-gradient(to right, ${rgbaCss(pctColor(0))}, ${rgbaCss(pctColor(50))}, ${rgbaCss(pctColor(100))})`;
const STATUSES = ['Disrupted', 'Shifted to alternative', 'Degraded', 'Normal'];

/** Bottom-right key listing only the layers that are on (one line at rest). */
export function MapLegend({ toggles, answerOn }: { toggles: Toggles; answerOn: boolean }) {
  const items = legendItems(toggles, answerOn);
  if (items.length === 0) return null;
  return (
    <div
      aria-label="Map legend"
      style={{
        position: 'absolute',
        right: 14,
        bottom: 34,
        zIndex: 3,
        display: 'grid',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--white)',
        border: '1px solid var(--gray-300)',
        borderRadius: 10,
        fontSize: '0.75rem',
        color: 'var(--gray-700)',
        boxShadow: '0 2px 10px rgba(11, 32, 38, 0.08)',
      }}
    >
      {items.includes('ramp') && (
        <div>
          <div>Traffic vs pre-war normal</div>
          <div style={{ width: 150, height: 6, borderRadius: 3, background: ramp, margin: '4px 0 2px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 150, fontSize: '0.6875rem' }}>
            <span>0%</span>
            <span>50%</span>
            <span>100%+</span>
          </div>
        </div>
      )}
      {items.includes('lanes') && (
        <div style={{ display: 'grid', gap: 3 }}>
          {STATUSES.map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 3, borderRadius: 2, background: rgbaCss(statusColor(s)) }} />
              {s}
            </div>
          ))}
        </div>
      )}
      {items.includes('ais') && <div>AIS: share of a busy lane&apos;s visible vessels</div>}
      {items.includes('answer') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--lava-600)',
              boxShadow: '0 0 0 2px var(--white), 0 0 0 3px var(--lava-600)',
            }}
          />
          Genie answer
        </div>
      )}
    </div>
  );
}
