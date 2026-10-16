import type { RecPoint } from './series';
import { tierColor } from './series';

const W = 260;
const H = 60;
const PAD = 6;
const BAND = 4;

const t = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** P(top action) by weekly snapshot, tier-colored dots, a tier band along the bottom and a line at the selected date. */
export function Sparkline({
  series,
  start,
  end,
  date,
}: {
  series: RecPoint[];
  start: string;
  end: string;
  date: string;
}) {
  if (series.length === 0)
    return <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gray-700)' }}>No recommendation history</p>;
  const t0 = t(start);
  const t1 = Math.max(t(end), t0 + 1);
  const x = (d: string) => PAD + ((W - 2 * PAD) * (t(d) - t0)) / (t1 - t0);
  const plotH = H - 2 * PAD - BAND - 2;
  const y = (p: number) => PAD + plotH * (1 - Math.min(1, Math.max(0, p)));
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(s.date).toFixed(1)},${y(s.p).toFixed(1)}`).join(' ');
  const xd = x(date);
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`P(top action) for ${series.length} weekly snapshots`}
    >
      <line x1={PAD} x2={W - PAD} y1={y(0.5)} y2={y(0.5)} stroke="var(--gray-300)" strokeDasharray="2 3" />
      {series.map((s, i) => {
        const next = series[i + 1];
        const x0 = x(s.date);
        const x1 = next ? x(next.date) : W - PAD;
        return (
          <rect
            key={`b${s.date}`}
            x={x0}
            y={H - PAD - BAND}
            width={Math.max(0, x1 - x0)}
            height={BAND}
            fill={tierColor(s.tier)}
          />
        );
      })}
      <path d={line} fill="none" stroke="var(--gray-500)" strokeWidth={1.25} />
      {series.map((s) => (
        <circle key={s.date} cx={x(s.date)} cy={y(s.p)} r={2.75} fill={tierColor(s.tier)}>
          <title>{`${s.date}: ${s.tier}, p ${s.p.toFixed(2)}`}</title>
        </circle>
      ))}
      {xd >= PAD && xd <= W - PAD && (
        <line x1={xd} x2={xd} y1={2} y2={H - 2} stroke="var(--navy-900)" strokeWidth={1.5} />
      )}
    </svg>
  );
}
