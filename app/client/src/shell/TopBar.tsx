import type { CSSProperties } from 'react';
import logo from '../assets/databricks-logo.svg';
import { useData } from '../data/DataContext';
import { FreshnessBadge } from './FreshnessBadge';
import { headline, headlineText } from './headline';

const btn: CSSProperties = { font: 'inherit', fontSize: '0.875rem', fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--gray-300)', background: 'var(--white)', color: 'var(--navy-900)', cursor: 'pointer', whiteSpace: 'nowrap' };

interface Props {
  tourOn: boolean;
  onTour: () => void;
  onHow: () => void;
}

export function TopBar({ tourOn, onTour, onHow }: Props) {
  const { dataset, loading } = useData();
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '0 20px', height: 60, borderBottom: '1px solid var(--gray-300)', background: 'var(--white)' }}>
      <img src={logo} alt="Databricks" style={{ display: 'block', height: 22, width: 'auto', flexShrink: 0 }} />
      <h1 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, whiteSpace: 'nowrap' }}>The Invisible Strait</h1>
      <span aria-hidden style={{ width: 1, height: 24, background: 'var(--gray-300)' }} />
      <span style={{ fontSize: '0.875rem', color: 'var(--gray-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {loading ? 'Loading' : headlineText(headline(dataset))}
      </span>
      <span style={{ flex: 1 }} />
      <FreshnessBadge />
      <button type="button" onClick={onTour} aria-pressed={tourOn} style={tourOn ? { ...btn, background: 'var(--navy-900)', border: '1px solid var(--navy-900)', color: 'var(--white)' } : btn}>
        {tourOn ? '✕ Exit tour' : '▶ Tour'}
      </button>
      <button type="button" onClick={onHow} style={{ ...btn, border: 'none', background: 'none' }}>
        How it works
      </button>
    </header>
  );
}
