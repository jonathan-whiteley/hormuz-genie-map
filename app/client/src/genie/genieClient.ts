import { connectSSE } from '@databricks/appkit-ui/js';

/**
 * Event shapes from AppKit's GenieStreamEvent union
 * (node_modules/@databricks/appkit-ui/dist/shared/src/genie.d.ts). Only the fields this client reads.
 */
interface GenieAttachment {
  attachmentId?: string;
  query?: { title?: string; description?: string; query?: string; statementId?: string };
  text?: { content?: string };
  suggestedQuestions?: string[];
}
interface GenieMessage {
  messageId: string;
  conversationId: string;
  status: string;
  content: string;
  attachments?: GenieAttachment[];
  error?: string;
}
interface GenieStatement {
  manifest?: { schema?: { columns?: { name: string; type_name: string }[] }; total_row_count?: number };
  result?: { data_array?: (string | null)[][] };
}
type GenieEvent =
  | { type: 'message_start'; conversationId: string; messageId: string; spaceId: string }
  | { type: 'status'; status: string }
  | { type: 'message_result'; message: GenieMessage }
  | { type: 'query_result'; attachmentId: string; statementId: string; data: GenieStatement }
  | { type: 'error'; error: string };

export interface GenieAnswer {
  text?: string;
  sql?: string;
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  suggested?: string[];
  conversationId?: string;
  error?: string;
}

export const GENIE_MESSAGES_URL = '/api/genie/default/messages';

/** Reduces one SSE stream into a GenieAnswer, the way AppKit's useGenieChat reads the same events. */
function reducer() {
  const answer: GenieAnswer = { columns: [], rows: [], totalRows: 0 };
  let queryAttachmentId: string | undefined;
  const pending = new Map<string, GenieStatement>();

  const applyStatement = (data: GenieStatement) => {
    const columns = (data.manifest?.schema?.columns ?? []).map((c) => c.name);
    const dataArray = data.result?.data_array ?? [];
    // Cells stay as returned strings: BIGINT h3 ids would lose precision as JS numbers.
    answer.columns = columns;
    answer.rows = dataArray.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i] ?? null])));
    answer.totalRows = data.manifest?.total_row_count ?? dataArray.length;
  };

  const onEvent = (e: GenieEvent) => {
    switch (e.type) {
      case 'message_start':
        answer.conversationId = e.conversationId;
        break;
      case 'message_result': {
        const m = e.message;
        answer.conversationId = m.conversationId || answer.conversationId;
        const atts = m.attachments ?? [];
        // Same as useGenieChat extractAssistantContent: text attachments, else the message content.
        const texts = atts.map((a) => a.text?.content).filter((t): t is string => !!t);
        answer.text = texts.length > 0 ? texts.join('\n\n') : m.content || undefined;
        const q = atts.find((a) => a.query);
        answer.sql = q?.query?.query;
        queryAttachmentId = q?.attachmentId;
        const suggested = atts.flatMap((a) => a.suggestedQuestions ?? []);
        answer.suggested = suggested.length ? suggested : undefined;
        if (m.error || m.status === 'FAILED') answer.error = m.error ?? 'Genie could not answer this question.';
        const early = queryAttachmentId ? pending.get(queryAttachmentId) : undefined;
        if (early) applyStatement(early);
        break;
      }
      case 'query_result':
        if (queryAttachmentId === undefined) pending.set(e.attachmentId, e.data);
        else if (e.attachmentId === queryAttachmentId) applyStatement(e.data);
        break;
      case 'error':
        answer.error = e.error;
        break;
      default:
        break;
    }
  };
  return { answer, onEvent };
}

export interface AskOptions {
  /** Called with each Genie status code (for example 'ASKING_AI', 'EXECUTING_QUERY') while the answer streams. */
  onStatus?: (status: string) => void;
}

async function attempt(question: string, conversationId: string | undefined, opts: AskOptions): Promise<GenieAnswer> {
  const { answer, onEvent } = reducer();
  let connectionError: string | undefined;
  try {
    await connectSSE({
      url: `${GENIE_MESSAGES_URL}?requestId=${encodeURIComponent(crypto.randomUUID())}`,
      payload: { content: question, conversationId },
      // ask() owns the single retry, so connectSSE must not retry on its own.
      maxRetries: 0,
      onMessage: (message) => {
        try {
          const e = JSON.parse(message.data) as GenieEvent;
          if (e.type === 'status') opts.onStatus?.(e.status);
          onEvent(e);
        } catch {
          // Ignore malformed events, as useGenieChat does.
        }
        return Promise.resolve();
      },
      onError: (err) => {
        connectionError = err instanceof Error ? err.message : 'Connection error. Please try again.';
      },
    });
  } catch (err) {
    connectionError = err instanceof Error ? err.message : 'Connection error. Please try again.';
  }
  if (!answer.error && connectionError) answer.error = connectionError;
  return answer;
}

/** Asks the default Genie space a question. Retries once on an error event or a connection failure. */
export async function ask(question: string, conversationId?: string, opts: AskOptions = {}): Promise<GenieAnswer> {
  const first = await attempt(question, conversationId, opts);
  if (!first.error) return first;
  return attempt(question, conversationId, opts);
}

export const genieClient = { ask };
