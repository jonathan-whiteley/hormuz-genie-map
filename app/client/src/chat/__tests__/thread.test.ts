import { describe, expect, it } from 'vitest';
import type { GenieAnswer } from '../../genie/genieClient';
import { mappableSpec } from '../../genie/answerFeatures';
import type { GenieLayerSpec } from '../../genie/genieLayer';
import {
  EMPTY_THREAD,
  activeOf,
  canSend,
  followUps,
  pendingOf,
  statusLabel,
  threadReducer as r,
  type GenieMsg,
  type ThreadState,
} from '../thread';

const ok = (o: Partial<GenieAnswer> = {}): GenieAnswer => ({
  columns: [],
  rows: [],
  totalRows: 0,
  conversationId: 'c1',
  text: 'Two ports.',
  ...o,
});
const spec: GenieLayerSpec = { kind: 'lanes', laneIds: ['L1'] };
const genie = (s: ThreadState, id: string) => s.messages.find((m) => m.id === id) as GenieMsg;

describe('threadReducer', () => {
  it('send adds a user bubble and a pending reply, and ignores empty text', () => {
    const s = r(EMPTY_THREAD, { type: 'send', question: '  Which ports?  ' });
    expect(s.messages.map((m) => [m.id, m.role])).toEqual([
      ['u-1', 'user'],
      ['g-1', 'genie'],
    ]);
    expect(genie(s, 'g-1')).toMatchObject({ question: 'Which ports?', status: 'pending', spec: null });
    expect(r(EMPTY_THREAD, { type: 'send', question: '   ' })).toBe(EMPTY_THREAD);
  });

  it('send is a no-op while a reply is pending', () => {
    const s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    expect(r(s, { type: 'send', question: 'b' })).toBe(s);
  });

  it('reply completes the message, keeps the conversation and shows a mappable answer', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'status', id: 'g-1', text: 'EXECUTING_QUERY' });
    expect(genie(s, 'g-1').statusText).toBe('EXECUTING_QUERY');
    s = r(s, { type: 'reply', id: 'g-1', answer: ok(), spec });
    expect(genie(s, 'g-1')).toMatchObject({ status: 'done', spec });
    expect(s.conversationId).toBe('c1');
    expect(s.activeId).toBe('g-1');
    expect(pendingOf(s)).toBeUndefined();
    expect(activeOf(s)?.id).toBe('g-1');
  });

  it('a reply with nothing mappable leaves the current answer on the map', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'reply', id: 'g-1', answer: ok(), spec });
    s = r(s, { type: 'send', question: 'b' });
    s = r(s, { type: 'reply', id: 'g-2', answer: ok(), spec: null });
    expect(s.activeId).toBe('g-1');
  });

  it('a reply carrying an error becomes an error message; retry re-sends without a new user bubble', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'reply', id: 'g-1', answer: ok({ error: 'boom' }), spec: null });
    expect(genie(s, 'g-1')).toMatchObject({ status: 'error', error: 'boom' });
    s = r(s, { type: 'retry', id: 'g-1' });
    expect(s.messages).toHaveLength(2);
    expect(genie(s, 'g-1')).toMatchObject({ status: 'pending', error: undefined });
    expect(pendingOf(s)?.id).toBe('g-1');
  });

  it('fail marks the message as an error', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'fail', id: 'g-1', error: 'Connection error' });
    expect(genie(s, 'g-1')).toMatchObject({ status: 'error', error: 'Connection error' });
  });

  it('show puts an older mappable reply back on the map; clear removes it', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'reply', id: 'g-1', answer: ok(), spec });
    s = r(s, { type: 'send', question: 'b' });
    s = r(s, { type: 'reply', id: 'g-2', answer: ok(), spec });
    s = r(s, { type: 'show', id: 'g-1' });
    expect(s.activeId).toBe('g-1');
    s = r(s, { type: 'clear' });
    expect(s.activeId).toBeNull();
    expect(r(s, { type: 'show', id: 'u-1' }).activeId).toBeNull();
  });

  it('ignores a reply for a message that no longer exists (New chat while pending)', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'reset' });
    expect(s).toEqual(EMPTY_THREAD);
    const after = r(s, { type: 'reply', id: 'g-1', answer: ok(), spec });
    expect(after).toBe(s);
    expect(r(s, { type: 'status', id: 'g-1', text: 'x' })).toBe(s);
  });
});

describe('followUps', () => {
  it('returns suggestions of the latest finished reply only', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'reply', id: 'g-1', answer: ok({ suggested: ['x'] }), spec });
    expect(followUps(s)).toEqual({ id: 'g-1', items: ['x'] });
    s = r(s, { type: 'send', question: 'b' });
    expect(followUps(s)).toBeNull();
    s = r(s, { type: 'reply', id: 'g-2', answer: ok(), spec: null });
    expect(followUps(s)).toEqual({ id: 'g-2', items: [] });
  });
});

describe('statusLabel', () => {
  it('maps Genie status codes to short phrases', () => {
    expect(statusLabel('ASKING_AI')).toBe('Writing SQL');
    expect(statusLabel('EXECUTING_QUERY')).toBe('Running the query');
    expect(statusLabel('FETCHING_METADATA')).toBe('Reading the tables');
    expect(statusLabel(undefined)).toBe('Thinking');
    expect(statusLabel('SOMETHING_NEW')).toBe('Thinking');
  });
});

describe('canSend', () => {
  it('needs Genie on, nothing pending and non-blank text', () => {
    expect(canSend(false, false, 'Which ports?')).toBe(true);
    expect(canSend(true, false, 'Which ports?')).toBe(false);
    expect(canSend(false, true, 'Which ports?')).toBe(false);
    expect(canSend(false, false, '   ')).toBe(false);
  });
});

describe('a reply whose coordinates are all null', () => {
  it('leaves the answer already on the map in place', () => {
    const blank = ok({ columns: ['port', 'lat', 'lon'], rows: [{ port: 'x', lat: null, lon: null }], totalRows: 1 });
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'reply', id: 'g-1', answer: ok(), spec });
    s = r(s, { type: 'send', question: 'b' });
    s = r(s, { type: 'reply', id: 'g-2', answer: blank, spec: mappableSpec(blank, undefined, []) });
    expect(genie(s, 'g-2')).toMatchObject({ status: 'done', spec: null });
    expect(s.activeId).toBe('g-1');
  });
});
