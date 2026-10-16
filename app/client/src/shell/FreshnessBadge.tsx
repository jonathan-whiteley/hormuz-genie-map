import { useData } from '../data/DataContext';
import { fmtShort } from '../explore/dates';
import { isStale, relativeTime } from './freshness';

const chip = {
  fontSize: '0.8125rem',
  padding: '2px 8px',
  borderRadius: 999,
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
};
const quiet = { background: 'var(--gray-100)', color: 'var(--gray-700)' };

/** Top-bar badge: latest PortWatch day and AIS sample age; amber when either is stale (spec 7). */
export function FreshnessBadge({ now = Date.now() }: { now?: number }) {
  const { dataset, loading } = useData();
  const f = dataset.freshness;
  if (loading) return <span style={{ ...chip, ...quiet }}>Checking data freshness</span>;
  if (!f) return <span style={{ ...chip, ...quiet }}>Freshness unavailable</span>;
  const stale = isStale(f.portwatch_chokepoints_max, f.ais_latest_sample, now);
  const pw = f.portwatch_chokepoints_max ? fmtShort(f.portwatch_chokepoints_max) : 'no data';
  const ais = f.ais_latest_sample ? relativeTime(f.ais_latest_sample, now) : 'no data';
  return (
    <span
      title={stale ? 'Data is stale: PortWatch over 7 days old or the last AIS sample over 3 hours old' : undefined}
      style={{ ...chip, ...(stale ? { background: '#FFF1D6', color: '#7A4B00' } : quiet) }}
    >
      PortWatch through {pw} · AIS sampled {ais}
    </span>
  );
}
