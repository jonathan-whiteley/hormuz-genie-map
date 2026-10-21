import type { GenieAnswer } from '../genie/genieClient';
import type { GenieLayerSpec } from '../genie/genieLayer';

export interface UserMsg {
  id: string;
  role: 'user';
  text: string;
}

export interface GenieMsg {
  id: string;
  role: 'genie';
  question: string;
  status: 'pending' | 'done' | 'error';
  /** Raw Genie status code while pending (see statusLabel). */
  statusText?: string;
  answer?: GenieAnswer;
  spec: GenieLayerSpec | null;
  error?: string;
}

export type Msg = UserMsg | GenieMsg;

export interface ThreadState {
  messages: Msg[];
  seq: number;
  conversationId?: string;
  /** The reply whose answer is on the map, or null. */
  activeId: string | null;
}

export const EMPTY_THREAD: ThreadState = { messages: [], seq: 0, activeId: null };

export type ThreadAction =
  | { type: 'send'; question: string }
  | { type: 'status'; id: string; text: string }
  | { type: 'reply'; id: string; answer: GenieAnswer; spec: GenieLayerSpec | null }
  | { type: 'fail'; id: string; error: string }
  | { type: 'retry'; id: string }
  | { type: 'show'; id: string }
  | { type: 'clear' }
  | { type: 'reset' };

const isGenie = (m: Msg | undefined): m is GenieMsg => m?.role === 'genie';

export const pendingOf = (s: ThreadState): GenieMsg | undefined =>
  s.messages.find((m): m is GenieMsg => isGenie(m) && m.status === 'pending');

export const activeOf = (s: ThreadState): GenieMsg | undefined =>
  s.activeId ? s.messages.find((m): m is GenieMsg => isGenie(m) && m.id === s.activeId) : undefined;

/** Patches one Genie message; returns the same state when the id is unknown (a reply after New chat). */
function patch(s: ThreadState, id: string, fn: (m: GenieMsg) => GenieMsg | null): ThreadState {
  const i = s.messages.findIndex((m) => m.id === id);
  const m = s.messages[i];
  if (!isGenie(m)) return s;
  const next = fn(m);
  if (!next) return s;
  const messages = [...s.messages];
  messages[i] = next;
  return { ...s, messages };
}

export function threadReducer(s: ThreadState, a: ThreadAction): ThreadState {
  switch (a.type) {
    case 'send': {
      const q = a.question.trim();
      if (!q || pendingOf(s)) return s;
      const seq = s.seq + 1;
      return {
        ...s,
        seq,
        messages: [
          ...s.messages,
          { id: `u-${seq}`, role: 'user', text: q },
          { id: `g-${seq}`, role: 'genie', question: q, status: 'pending', spec: null },
        ],
      };
    }
    case 'status':
      return patch(s, a.id, (m) => (m.status === 'pending' ? { ...m, statusText: a.text } : null));
    case 'reply': {
      const next = patch(s, a.id, (m) =>
        m.status !== 'pending'
          ? null
          : a.answer.error
            ? { ...m, status: 'error', error: a.answer.error, answer: a.answer, spec: null }
            : { ...m, status: 'done', answer: a.answer, spec: a.spec, statusText: undefined }
      );
      if (next === s) return s;
      const mapped = !a.answer.error && a.spec !== null;
      return {
        ...next,
        conversationId: a.answer.conversationId ?? s.conversationId,
        activeId: mapped ? a.id : s.activeId,
      };
    }
    case 'fail':
      return patch(s, a.id, (m) => (m.status === 'pending' ? { ...m, status: 'error', error: a.error } : null));
    case 'retry':
      if (pendingOf(s)) return s;
      return patch(s, a.id, (m) =>
        m.status === 'error' ? { ...m, status: 'pending', error: undefined, statusText: undefined } : null
      );
    case 'show': {
      const m = s.messages.find((x) => x.id === a.id);
      return isGenie(m) && m.status === 'done' && m.spec ? { ...s, activeId: a.id } : s;
    }
    case 'clear':
      return s.activeId === null ? s : { ...s, activeId: null };
    case 'reset':
      return EMPTY_THREAD;
    default:
      return s;
  }
}

/** Follow-up suggestions of the latest Genie reply, only once it has finished; null while it is pending. */
export function followUps(s: ThreadState): { id: string; items: string[] } | null {
  const last = [...s.messages].reverse().find(isGenie);
  if (!last || last.status === 'pending') return null;
  return { id: last.id, items: last.status === 'done' ? (last.answer?.suggested ?? []) : [] };
}

const STATUS: Record<string, string> = {
  FETCHING_METADATA: 'Reading the tables',
  FILTERING_CONTEXT: 'Reading the tables',
  ASKING_AI: 'Writing SQL',
  PENDING_WAREHOUSE: 'Starting the warehouse',
  EXECUTING_QUERY: 'Running the query',
};

export const statusLabel = (raw: string | undefined): string => (raw && STATUS[raw]) || 'Thinking';

export const canSend = (genieOff: boolean, pending: boolean, text: string): boolean =>
  !genieOff && !pending && text.trim().length > 0;
