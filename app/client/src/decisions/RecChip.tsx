import type { LaneRec } from '../data/types';
import { REC_TITLE, tierColor, topProb } from './series';

const DARK_TEXT_TIERS = new Set(['Review', 'Analyst']);

/** Tier badge, action, top probability and a 5-segment probability bar for one lane recommendation. */
export function RecChip({ rec }: { rec: LaneRec | undefined }) {
  if (!rec) return <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gray-700)' }}>No recommendation yet</p>;
  const p = topProb(rec);
  const filled = Math.round(p * 5);
  const color = tierColor(rec.tier);
  return (
    <div
      title={REC_TITLE}
      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.875rem' }}
    >
      <span
        style={{
          background: color,
          color: DARK_TEXT_TIERS.has(rec.tier) ? 'var(--navy-900)' : 'var(--white)',
          borderRadius: 999,
          padding: '2px 8px',
          fontWeight: 700,
          fontSize: '0.75rem',
        }}
      >
        {rec.tier}
      </span>
      <span style={{ fontWeight: 500 }}>{rec.action}</span>
      <span style={{ fontFamily: 'DM Mono, ui-monospace, monospace', color: 'var(--gray-700)' }}>p {p.toFixed(2)}</span>
      <span aria-label={`probability ${p.toFixed(2)}`} style={{ display: 'inline-flex', gap: 2 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            style={{
              width: 10,
              height: 8,
              borderRadius: 2,
              background: i < filled ? color : 'var(--gray-300)',
            }}
          />
        ))}
      </span>
    </div>
  );
}
