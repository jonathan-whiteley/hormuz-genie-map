import type { CSSProperties } from 'react';

/** Shared chip style for follow-ups, starters and Retry (its own file so GenieReply exports only components). */
export const followChip: CSSProperties = {
  font: 'inherit',
  fontSize: '0.8125rem',
  lineHeight: 1.35,
  textAlign: 'left',
  padding: '7px 10px',
  borderRadius: 10,
  border: '1px solid var(--gray-300)',
  background: 'var(--white)',
  color: 'var(--navy-900)',
  cursor: 'pointer',
};
