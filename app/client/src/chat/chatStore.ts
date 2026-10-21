import { createContext, useContext } from 'react';
import type { LaneDay } from '../data/types';
import type { AnswerFeature } from '../genie/answerFeatures';
import type { GenieLayerSpec } from '../genie/genieLayer';
import type { ThreadState } from './thread';

/** The reply whose answer is on the map. */
export interface ActiveAnswer {
  id: string;
  question: string;
  spec: GenieLayerSpec;
  features: AnswerFeature[];
  chip: string | null;
}

export interface ChatApi {
  thread: ThreadState;
  pending: boolean;
  /** True when the app has no Genie space id (genieEnabled false); nothing can be sent. */
  genieOff: boolean;
  /** Latest row per demo lane, for drawing lane answers. */
  lanes: LaneDay[];
  active: ActiveAnswer | null;
  send: (question: string) => void;
  retry: (id: string) => void;
  show: (id: string) => void;
  clear: () => void;
  newChat: () => void;
  /** Text for the chat input (from a map popover); a new key re-applies the same text. */
  draft: { text: string; key: number } | undefined;
  setDraft: (text: string) => void;
  /** Table row hovered in the chat or on the map, so both highlight it. */
  hoverRow: number | null;
  setHoverRow: (i: number | null) => void;
  /** Row picked on the map: the table opens and scrolls to it. */
  focusRow: { row: number; key: number } | null;
  setFocusRow: (row: number) => void;
}

export const ChatContext = createContext<ChatApi | null>(null);

export function useChat(): ChatApi {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside ChatProvider');
  return ctx;
}
