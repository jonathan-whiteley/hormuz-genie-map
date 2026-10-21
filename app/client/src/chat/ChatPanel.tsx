import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { GENIE_OFF_MESSAGE } from '../lib/appConfig';
import { useChat } from './chatStore';
import { followChip } from './chatStyles';
import { GenieReply } from './GenieReply';
import { STARTERS } from './starters';
import { canSend, followUps } from './thread';

/** The right-hand chat: thread top to bottom, input pinned at the bottom, starters in an empty chat. */
export function ChatPanel() {
  const chat = useChat();
  const { thread, pending, genieOff, draft } = chat;
  const [input, setInput] = useState('');
  const [seenDraft, setSeenDraft] = useState(draft?.key);
  if (draft && draft.key !== seenDraft) {
    setSeenDraft(draft.key);
    setInput(draft.text);
  }
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // A new draft ("Ask about" on the map) focuses the input with the cursor at the end, so Enter sends it.
  const mountDraft = useRef(seenDraft);
  useEffect(() => {
    const el = inputRef.current;
    if (seenDraft === mountDraft.current || !el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [seenDraft]);
  // The textarea is disabled while Genie answers, which drops focus; give it back when the answer lands.
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending && !genieOff) inputRef.current?.focus({ preventScroll: true });
    wasPending.current = pending;
  }, [pending, genieOff]);
  const last = thread.messages[thread.messages.length - 1];
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.messages.length, last]);

  const fu = followUps(thread);
  const submit = (text: string) => {
    if (!canSend(genieOff, pending, text)) return;
    chat.send(text);
    setInput('');
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  return (
    <aside
      aria-label="Ask the map"
      style={{
        display: 'grid',
        gridTemplateRows: '54px 1fr auto',
        minHeight: 0,
        background: 'var(--white)',
        borderLeft: '1px solid var(--gray-300)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid var(--gray-300)',
        }}
      >
        <strong style={{ fontSize: '0.95rem' }}>Ask the map</strong>
        <button
          type="button"
          onClick={chat.newChat}
          disabled={thread.messages.length === 0}
          style={{
            font: 'inherit',
            fontSize: '0.8125rem',
            background: 'none',
            border: 'none',
            color: 'var(--navy-900)',
            cursor: 'pointer',
            opacity: thread.messages.length === 0 ? 0.4 : 1,
          }}
        >
          New chat
        </button>
      </header>

      <div
        role="log"
        aria-live="polite"
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '18px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 0,
        }}
      >
        {genieOff ? (
          <p role="note" style={{ marginTop: 'auto', color: 'var(--gray-700)', fontSize: '0.875rem' }}>
            {GENIE_OFF_MESSAGE}
          </p>
        ) : thread.messages.length === 0 ? (
          <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Ask the map</h2>
            <p style={{ margin: 0, color: 'var(--gray-700)', fontSize: '0.9rem', lineHeight: 1.45 }}>
              Ask about chokepoints, ports, our six supply lanes or AIS visibility. Most answers land on the map.
            </p>
            {STARTERS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => submit(q)}
                style={{ ...followChip, fontSize: '0.875rem', padding: '10px 12px', background: 'var(--light)' }}
              >
                {q}
              </button>
            ))}
          </div>
        ) : (
          thread.messages.map((m) =>
            m.role === 'user' ? (
              <div
                key={m.id}
                style={{
                  alignSelf: 'flex-end',
                  maxWidth: '85%',
                  background: 'var(--navy-900)',
                  color: 'var(--white)',
                  padding: '10px 13px',
                  borderRadius: '14px 14px 4px 14px',
                  fontSize: '0.9rem',
                  lineHeight: 1.4,
                }}
              >
                {m.text}
              </div>
            ) : (
              <GenieReply key={m.id} msg={m} followUps={fu?.id === m.id ? fu.items : []} onFollowUp={submit} />
            )
          )
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} style={{ borderTop: '1px solid var(--gray-300)', padding: '12px 14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            border: '1px solid var(--gray-300)',
            borderRadius: 12,
            padding: '6px 6px 6px 12px',
          }}
        >
          <textarea
            ref={inputRef}
            aria-label="Ask a question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={genieOff || pending}
            rows={1}
            placeholder={
              genieOff
                ? 'Genie is not configured'
                : pending
                  ? 'Genie is answering'
                  : 'Ask about ports, chokepoints or lanes'
            }
            style={{
              flex: 1,
              resize: 'none',
              border: 'none',
              outline: 'none',
              font: 'inherit',
              fontSize: '0.9rem',
              padding: '6px 0',
              background: 'transparent',
              maxHeight: 120,
            }}
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSend(genieOff, pending, input)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              border: 'none',
              background: canSend(genieOff, pending, input) ? 'var(--lava-600)' : 'var(--gray-300)',
              color: 'var(--white)',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ➤
          </button>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)', marginTop: 6 }}>
          Enter to send. Shift+Enter for a new line.
        </div>
      </form>
    </aside>
  );
}
