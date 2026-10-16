import { createContext, useContext } from 'react';
import type { GenieEntry } from './genieLayer';

/** Genie answers shared by Story and Explore, so they survive tab switches. */
export interface GenieState {
  /** Newest first. */
  entries: GenieEntry[];
  busy: boolean;
  /** Bumps whenever an answer goes onto the map, so a page can switch its Genie toggle back on. */
  revealKey: number;
  ask: (question: string) => void;
  toggle: (id: string) => void;
  clearAll: () => void;
}

export const GenieContext = createContext<GenieState | null>(null);

export function useGenie(): GenieState {
  const ctx = useContext(GenieContext);
  if (!ctx) throw new Error('useGenie must be used inside GenieProvider');
  return ctx;
}
