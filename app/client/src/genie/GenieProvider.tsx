import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ask as askGenie } from './genieClient';
import { detect, turnOn, type GenieEntry } from './genieLayer';
import { GenieContext, type GenieState } from './genieStore';

/** Holds Genie answers, the conversation id and layer on/off state above the pages (mounted once in App). */
export function GenieProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<GenieEntry[]>([]);
  const [revealKey, setRevealKey] = useState(0);
  const conversationId = useRef<string | undefined>(undefined);
  const seq = useRef(0);
  // Set synchronously before any state update, so two asks in one tick (a click plus Enter) cannot both
  // start: the render-time `busy` flag would still read false for the second one.
  const inFlight = useRef(false);
  const busy = entries.some((e) => e.loading);

  const ask = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q || inFlight.current) return;
      inFlight.current = true;
      seq.current += 1;
      // The entry id doubles as the deck layer id, so it must never change.
      const id = `genie-${seq.current}`;
      setEntries((prev) => [{ id, question: q, loading: true, spec: null, on: false }, ...prev]);
      void askGenie(q, conversationId.current).then((answer) => {
        inFlight.current = false;
        if (answer.conversationId) conversationId.current = answer.conversationId;
        const spec = answer.error ? null : detect(answer);
        setEntries((prev) => {
          const next = prev.map((e) => (e.id === id ? { ...e, loading: false, answer, spec } : e));
          return spec ? turnOn(next, id) : next;
        });
        if (spec) setRevealKey((k) => k + 1);
      });
    },
    []
  );

  const toggle = useCallback(
    (id: string) => {
      const target = entries.find((e) => e.id === id);
      if (!target?.spec) return;
      if (target.on) {
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, on: false } : e)));
      } else {
        setEntries((prev) => turnOn(prev, id));
        setRevealKey((k) => k + 1);
      }
    },
    [entries]
  );

  const clearAll = useCallback(() => setEntries((prev) => prev.map((e) => ({ ...e, on: false }))), []);

  const value = useMemo<GenieState>(
    () => ({ entries, busy, revealKey, ask, toggle, clearAll }),
    [entries, busy, revealKey, ask, toggle, clearAll]
  );
  return <GenieContext.Provider value={value}>{children}</GenieContext.Provider>;
}
