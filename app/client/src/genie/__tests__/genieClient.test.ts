import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectSSEOptions } from '@databricks/appkit-ui/js';

const connectSSE = vi.fn<(o: Opts) => Promise<void>>();
vi.mock('@databricks/appkit-ui/js', () => ({ connectSSE: (o: Opts) => connectSSE(o) }));

type Opts = ConnectSSEOptions<{ content: string; conversationId?: string }>;

const { ask } = await import('../genieClient');

const emit = (o: Opts, ...events: unknown[]) => {
  for (const e of events) void o.onMessage({ id: '', data: JSON.stringify(e) });
};

const START = { type: 'message_start', conversationId: 'conv-1', messageId: 'msg-1', spaceId: 'space' };
const RESULT = {
  type: 'message_result',
  message: {
    messageId: 'msg-1',
    conversationId: 'conv-1',
    spaceId: 'space',
    status: 'COMPLETED',
    content: 'Which ports?',
    attachments: [
      { attachmentId: 'att-t', text: { content: 'Two ports are above baseline.' } },
      {
        attachmentId: 'att-q',
        query: { title: 'Ports', query: 'SELECT port, pct FROM t', statementId: 'st-1' },
        suggestedQuestions: ['What about tankers?'],
      },
    ],
  },
};
const QUERY = {
  type: 'query_result',
  attachmentId: 'att-q',
  statementId: 'st-1',
  data: {
    manifest: {
      schema: {
        columns: [
          { name: 'port', type_name: 'STRING' },
          { name: 'pct', type_name: 'DOUBLE' },
        ],
      },
    },
    result: {
      data_array: [
        ['Salalah', '130.5'],
        ['Duqm', null],
      ],
    },
  },
};

const happy = (o: Opts) => {
  emit(o, START, { type: 'status', status: 'EXECUTING_QUERY' }, RESULT, QUERY);
  return Promise.resolve();
};
const fail = (o: Opts) => {
  o.onError?.(new Error('HTTP 502'));
  return Promise.resolve();
};

beforeEach(() => {
  connectSSE.mockReset();
});

describe('ask', () => {
  it('posts the question and reduces events into a GenieAnswer', async () => {
    connectSSE.mockImplementation(happy);
    const a = await ask('Which ports?', 'conv-0');
    expect(connectSSE).toHaveBeenCalledTimes(1);
    const o = connectSSE.mock.calls[0][0];
    expect(o.url).toMatch(/^\/api\/genie\/default\/messages\?requestId=/);
    expect(o.payload).toEqual({ content: 'Which ports?', conversationId: 'conv-0' });
    expect(a).toEqual({
      text: 'Two ports are above baseline.',
      sql: 'SELECT port, pct FROM t',
      columns: ['port', 'pct'],
      rows: [
        { port: 'Salalah', pct: '130.5' },
        { port: 'Duqm', pct: null },
      ],
      totalRows: 2,
      suggested: ['What about tankers?'],
      conversationId: 'conv-1',
    });
  });

  it('retries once after a connection failure', async () => {
    connectSSE.mockImplementationOnce(fail).mockImplementationOnce(happy);
    const a = await ask('Which ports?');
    expect(connectSSE).toHaveBeenCalledTimes(2);
    expect(a.error).toBeUndefined();
    expect(a.conversationId).toBe('conv-1');
    expect(a.rows).toHaveLength(2);
  });

  it('retries once after an error event, then returns the error', async () => {
    connectSSE.mockImplementation((o: Opts) => {
      emit(o, START, { type: 'error', error: 'Genie is unavailable' });
      return Promise.resolve();
    });
    const a = await ask('Which ports?');
    expect(connectSSE).toHaveBeenCalledTimes(2);
    expect(a.error).toBe('Genie is unavailable');
    expect(a.rows).toEqual([]);
  });

  it('returns an error after two connection failures', async () => {
    connectSSE.mockImplementation(fail);
    const a = await ask('Which ports?');
    expect(connectSSE).toHaveBeenCalledTimes(2);
    expect(a.error).toBe('HTTP 502');
    expect(a.columns).toEqual([]);
    expect(a.totalRows).toBe(0);
  });

  it('treats a FAILED message as an error', async () => {
    connectSSE.mockImplementation((o: Opts) => {
      emit(o, START, {
        type: 'message_result',
        message: { ...RESULT.message, status: 'FAILED', attachments: [], error: 'Query failed' },
      });
      return Promise.resolve();
    });
    const a = await ask('Which ports?');
    expect(connectSSE).toHaveBeenCalledTimes(2);
    expect(a.error).toBe('Query failed');
  });
});

describe('ask onStatus', () => {
  beforeEach(() => {
    connectSSE.mockReset();
  });

  it('reports each status event to the caller', async () => {
    connectSSE.mockImplementation((o: Opts) => {
      emit(
        o,
        START,
        { type: 'status', status: 'ASKING_AI' },
        { type: 'status', status: 'EXECUTING_QUERY' },
        RESULT,
        QUERY
      );
      return Promise.resolve();
    });
    const seen: string[] = [];
    const a = await ask('Which ports?', undefined, { onStatus: (s) => seen.push(s) });
    expect(seen).toEqual(['ASKING_AI', 'EXECUTING_QUERY']);
    expect(a.error).toBeUndefined();
  });
});
