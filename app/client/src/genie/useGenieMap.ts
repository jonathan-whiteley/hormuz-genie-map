import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { LayerToggles } from '../map/layers';
import { genieQuestionFor, mapLayersOf } from './genieLayer';
import { useGenie } from './genieStore';

/** Page-side Genie wiring: the shared answers as map layers, the toggle reveal, and the map-click prefill. */
export function useGenieMap(setToggles: Dispatch<SetStateAction<LayerToggles>>) {
  const { entries, revealKey } = useGenie();
  const genieLayers = useMemo(() => mapLayersOf(entries), [entries]);

  // An answer newly put on the map turns this page's Genie toggle back on. Starting from the current key
  // means remounting the page (a tab switch) does not override the reader's own toggle.
  const [seenKey, setSeenKey] = useState(revealKey);
  if (seenKey !== revealKey) {
    setSeenKey(revealKey);
    setToggles((t) => (t.genie ? t : { ...t, genie: true }));
  }

  const [prefill, setPrefill] = useState<{ text: string; key: number } | undefined>(undefined);
  const askAbout = useCallback(
    (name: string) => setPrefill((p) => ({ text: genieQuestionFor(name), key: (p?.key ?? 0) + 1 })),
    []
  );

  return { genieLayers, prefill, askAbout };
}
