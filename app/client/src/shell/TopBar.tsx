import type { ReactNode } from 'react';
import logo from '../assets/databricks-logo.svg';
import { FreshnessBadge } from './FreshnessBadge';

export type Tab = 'story' | 'explore' | 'architecture';

const TABS: { id: Tab; label: string }[] = [
  { id: 'story', label: 'Story' },
  { id: 'explore', label: 'Explore' },
  { id: 'architecture', label: 'Architecture' },
];

export function TopBar({ tab, onTab, slot }: { tab: Tab; onTab: (t: Tab) => void; slot?: ReactNode }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '0 var(--space-3)',
        height: 64,
        borderBottom: '1px solid var(--gray-300)',
        background: 'var(--white)',
      }}
    >
      <img src={logo} alt="Databricks" style={{ display: 'block', height: 22, width: 'auto', flexShrink: 0 }} />
      <h1 style={{ fontSize: '1.125rem', fontWeight: 500, margin: 0, flex: 1 }}>
        The Invisible Strait: Hormuz supply lane monitor
      </h1>
      {slot}
      <nav role="tablist" style={{ display: 'flex', gap: 'var(--space-1)', alignSelf: 'stretch' }}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onTab(t.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: `3px solid ${active ? 'var(--lava-600)' : 'transparent'}`,
                padding: '0 var(--space-2)',
                fontSize: '1rem',
                fontWeight: active ? 700 : 500,
                color: 'var(--navy-900)',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      <FreshnessBadge />
    </header>
  );
}
