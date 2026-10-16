import { useState, type CSSProperties, type FormEvent } from 'react';
import { GENIE_OFF_MESSAGE, genieStatus, useAppConfig } from '../lib/appConfig';
import { AnswerCard } from './AnswerCard';
import { useGenie } from './genieStore';

interface Props {
  suggested: string[];
  /** Text to place in the input (for example from a map click); a new key re-applies the same text. */
  prefill?: { text: string; key: number };
}

const chip: CSSProperties = {
  font: 'inherit',
  fontSize: '0.8125rem',
  textAlign: 'left',
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--gray-300)',
  background: 'var(--white)',
  color: 'var(--navy-900)',
  cursor: 'pointer',
};

const heading: CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  margin: 0,
  color: 'var(--gray-700)',
};

/** Genie input, suggested questions and answer cards. Answers live in GenieProvider and persist across tabs. */
export function GeniePanel({ suggested, prefill }: Props) {
  const config = useAppConfig();
  const off = genieStatus(config) === 'off';
  const { entries, busy, ask, toggle, clearAll } = useGenie();
  const [input, setInput] = useState('');

  const [prefilled, setPrefilled] = useState(prefill);
  if (prefill !== prefilled) {
    setPrefilled(prefill);
    if (prefill) setInput(prefill.text);
  }

  const submit = (question: string) => {
    if (!question.trim() || busy || off) return;
    setInput('');
    ask(question);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const anyOn = entries.some((e) => e.on);
  const title = config?.genieSpaceTitle ?? 'Genie';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 12,
        padding: 'var(--space-2)',
        alignContent: 'start',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={heading}>Ask {title}</h2>
        {anyOn && (
          <button
            type="button"
            onClick={clearAll}
            style={{ ...chip, padding: '2px 8px', fontSize: '0.75rem', color: 'var(--gray-700)' }}
            title="Remove every Genie answer from the map"
          >
            Clear all
          </button>
        )}
      </div>

      {off && (
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            lineHeight: 1.45,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--white)',
            border: '1px solid var(--gray-300)',
            borderLeft: '4px solid var(--navy-900)',
          }}
        >
          {GENIE_OFF_MESSAGE}
        </p>
      )}

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 6 }}>
        <textarea
          disabled={off}
          aria-label="Question for Genie"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          rows={2}
          placeholder={off ? 'Genie is not configured' : 'Ask a question about ports, lanes or AIS visibility'}
          style={{
            font: 'inherit',
            fontSize: '0.875rem',
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--gray-300)',
            background: 'var(--white)',
            color: 'var(--navy-900)',
            resize: 'vertical',
          }}
        />
        <button
          type="submit"
          disabled={busy || off || !input.trim()}
          style={{
            font: 'inherit',
            fontSize: '0.875rem',
            fontWeight: 700,
            padding: '7px 12px',
            borderRadius: 8,
            border: 'none',
            background: busy || off || !input.trim() ? 'var(--gray-300)' : 'var(--lava-600)',
            color: 'var(--white)',
            cursor: busy || off || !input.trim() ? 'not-allowed' : 'pointer',
            justifySelf: 'end',
          }}
        >
          {busy ? 'Asking' : 'Ask Genie'}
        </button>
      </form>

      {suggested.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {suggested.map((s) => (
            <button
              key={s}
              type="button"
              style={{ ...chip, ...(off ? { color: 'var(--gray-500)', cursor: 'not-allowed' } : null) }}
              disabled={busy || off}
              onClick={() => submit(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {off ? null : entries.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--gray-700)', lineHeight: 1.45 }}>
          Answers with coordinates, H3 cells or lane ids appear on the map. Click a port or chokepoint to start a
          question about it.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
          {entries.map((e) => (
            <AnswerCard key={e.id} entry={e} onToggle={() => toggle(e.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
