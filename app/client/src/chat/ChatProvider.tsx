import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { useData } from '../data/DataContext';
import { genieStatus, useAppConfig } from '../lib/appConfig';
import { lanesOnIdx } from '../data/dataIndex';
import { answerFeatures, mapChipText, mappableSpec } from '../genie/answerFeatures';
import { ask } from '../genie/genieClient';
import { gazetteerOf } from '../genie/places';
import { timeSeriesOf } from '../genie/timeSeries';
import { ChatContext, type ActiveAnswer, type ChatApi } from './chatStore';
import { EMPTY_THREAD, activeOf, canSend, pendingOf, threadReducer } from './thread';

/** A date past every row, so lanesOnIdx returns the latest row per lane. */
const LATEST = '9999-12-31';

/** Holds the chat thread and runs each pending question through Genie, one at a time. Mount inside DataProvider. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { dataset } = useData();
  const config = useAppConfig();
  const genieOff = genieStatus(config) === 'off';
  const [thread, dispatch] = useReducer(threadReducer, EMPTY_THREAD);
  const places = useMemo(() => gazetteerOf(dataset), [dataset]);
  const lanes = useMemo(() => lanesOnIdx(dataset, LATEST), [dataset]);
  const pendingMsg = pendingOf(thread);
  // The id being asked, so a re-render cannot ask twice; the generation drops replies after New chat.
  const inFlight = useRef<string | null>(null);
  const generation = useRef(0);
  // Read when a reply lands, so a question asked while the data loads is judged against loaded data.
  const geo = useRef({ places, lanes });
  useEffect(() => {
    geo.current = { places, lanes };
  }, [places, lanes]);

  useEffect(() => {
    if (!pendingMsg || inFlight.current === pendingMsg.id) return;
    const id = pendingMsg.id;
    const gen = generation.current;
    inFlight.current = id;
    void ask(pendingMsg.question, thread.conversationId, {
      onStatus: (text) => {
        if (gen === generation.current) dispatch({ type: 'status', id, text });
      },
    })
      .then((answer) => {
        if (gen !== generation.current) return;
        inFlight.current = null;
        // A spec that draws nothing is null, so the reply cannot take over the map (spec 5.3).
        const spec = answer.error ? null : mappableSpec(answer, geo.current.places, geo.current.lanes);
        dispatch({ type: 'reply', id, answer, spec });
      })
      .catch((err: unknown) => {
        // ask() is built not to reject; if it ever does, fail the message so the chat does not lock.
        if (gen !== generation.current) return;
        inFlight.current = null;
        dispatch({
          type: 'fail',
          id,
          error: err instanceof Error ? err.message : 'Connection error. Please try again.',
        });
      });
  }, [pendingMsg, thread.conversationId]);

  const pending = pendingMsg !== undefined;
  const send = useCallback(
    (q: string) => {
      if (canSend(genieOff, pending, q)) dispatch({ type: 'send', question: q });
    },
    [genieOff, pending]
  );
  const retry = useCallback((id: string) => dispatch({ type: 'retry', id }), []);
  const show = useCallback((id: string) => dispatch({ type: 'show', id }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);
  const newChat = useCallback(() => {
    generation.current += 1;
    inFlight.current = null;
    dispatch({ type: 'reset' });
  }, []);

  const [draft, setDraftState] = useState<{ text: string; key: number } | undefined>(undefined);
  const setDraft = useCallback((text: string) => setDraftState((d) => ({ text, key: (d?.key ?? 0) + 1 })), []);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [focusRow, setFocusRowState] = useState<{ row: number; key: number } | null>(null);
  const setFocusRow = useCallback((row: number) => setFocusRowState((f) => ({ row, key: (f?.key ?? 0) + 1 })), []);

  const activeMsg = activeOf(thread);
  const active = useMemo<ActiveAnswer | null>(() => {
    if (!activeMsg?.spec) return null;
    const features = answerFeatures(activeMsg.spec, lanes);
    if (features.length === 0) return null;
    return {
      id: activeMsg.id,
      question: activeMsg.question,
      spec: activeMsg.spec,
      features,
      chip: mapChipText(activeMsg.spec, features),
      series: timeSeriesOf(activeMsg.spec),
    };
  }, [activeMsg, lanes]);

  const value = useMemo<ChatApi>(
    () => ({
      thread,
      pending,
      genieOff,
      lanes,
      active,
      send,
      retry,
      show,
      clear,
      newChat,
      draft,
      setDraft,
      hoverRow,
      setHoverRow,
      focusRow,
      setFocusRow,
    }),
    [
      thread,
      pending,
      genieOff,
      lanes,
      active,
      send,
      retry,
      show,
      clear,
      newChat,
      draft,
      setDraft,
      hoverRow,
      focusRow,
      setFocusRow,
    ]
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
