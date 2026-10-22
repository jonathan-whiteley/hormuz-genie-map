import { useMemo } from 'react';
import genieIcon from '../assets/genie-icon-full-color.svg';
import { answerFeatures, mapChipText } from '../genie/answerFeatures';
import { AnswerTable } from './AnswerTable';
import { followChip } from './chatStyles';
import { useChat } from './chatStore';
import { Markdown } from './MarkdownView';
import { statusLabel, type GenieMsg } from './thread';

const who = (
  <div
    style={{
      fontSize: '0.75rem',
      fontWeight: 700,
      color: 'var(--gray-500)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}
  >
    <img src={genieIcon} alt="" aria-hidden width={18} height={18} style={{ display: 'block', flexShrink: 0 }} />
    Genie
  </div>
);

interface Props {
  msg: GenieMsg;
  /** Suggestions shown only under the latest finished reply. */
  followUps: string[];
  onFollowUp: (q: string) => void;
}

export function GenieReply({ msg, followUps, onFollowUp }: Props) {
  const chat = useChat();
  const features = useMemo(() => (msg.spec ? answerFeatures(msg.spec, chat.lanes) : []), [msg.spec, chat.lanes]);
  const chip = msg.spec ? mapChipText(msg.spec, features) : null;
  const active = chat.thread.activeId === msg.id;

  return (
    // minmax(0, 1fr): an implicit auto column grows to the open table's width and pushes the thread sideways.
    <div
      style={{
        alignSelf: 'flex-start',
        width: '100%',
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 10,
      }}
    >
      {who}
      {msg.status === 'pending' && (
        <div
          role="status"
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gray-700)', fontSize: '0.875rem' }}
        >
          <span className="typing" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {statusLabel(msg.statusText)}
        </div>
      )}
      {msg.status === 'error' && (
        <div role="alert" style={{ fontSize: '0.875rem' }}>
          <p style={{ margin: '0 0 8px' }}>{msg.error ?? 'Genie could not answer this question.'}</p>
          <button type="button" onClick={() => chat.retry(msg.id)} disabled={chat.pending} style={followChip}>
            Retry
          </button>
        </div>
      )}
      {msg.status === 'done' && (
        <>
          {msg.answer?.text && <Markdown text={msg.answer.text} />}
          {chip && (
            <button
              type="button"
              onClick={() => (active ? chat.clear() : chat.show(msg.id))}
              aria-pressed={active}
              style={{
                justifySelf: 'start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                font: 'inherit',
                fontSize: '0.8125rem',
                fontWeight: 500,
                padding: '6px 11px',
                borderRadius: 999,
                border: `1px solid ${active ? 'var(--lava-600)' : 'var(--gray-300)'}`,
                background: active ? '#FFF4F2' : 'var(--white)',
                color: 'var(--navy-900)',
                cursor: 'pointer',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: active ? 'var(--lava-600)' : 'var(--gray-500)',
                }}
              />
              {chip}
            </button>
          )}
          <AnswerTable msg={msg} active={active} />
          {msg.answer?.sql && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
                Show query
              </summary>
              <pre
                style={{
                  fontSize: '0.75rem',
                  whiteSpace: 'pre-wrap',
                  background: 'var(--light)',
                  border: '1px solid var(--gray-300)',
                  borderRadius: 8,
                  padding: 8,
                  margin: '6px 0 0',
                }}
              >
                {msg.answer.sql}
              </pre>
            </details>
          )}
          {followUps.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Follow up</div>
              {followUps.slice(0, 3).map((q) => (
                <button key={q} type="button" onClick={() => onFollowUp(q)} disabled={chat.pending} style={followChip}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
