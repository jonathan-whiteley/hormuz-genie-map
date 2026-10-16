import type { CSSProperties } from 'react';
import { TABLE_ROWS, cellText, mapRowsCaption, type GenieEntry, type GenieLayerSpec } from './genieLayer';

/** Genie text with its **bold** markers shown as bold; nothing else is changed. */
function GenieText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
      {/* Odd parts are the captured bold spans; the split output is fixed per answer. */}
      {/* eslint-disable-next-line react/no-array-index-key */}
      {parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : p))}
    </p>
  );
}

const KIND_LABEL: Record<GenieLayerSpec['kind'], string> = {
  h3: 'H3 cells',
  points: 'Points',
  lanes: 'Lanes highlighted',
};

const card: CSSProperties = {
  background: 'var(--white)',
  border: '1px solid var(--gray-300)',
  borderRadius: 8,
  padding: '10px 12px',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 8,
  minWidth: 0,
};

const th: CSSProperties = {
  textAlign: 'left',
  fontWeight: 700,
  padding: '4px 6px',
  borderBottom: '1px solid var(--gray-300)',
  position: 'sticky',
  top: 0,
  background: 'var(--white)',
  whiteSpace: 'nowrap',
};
const td: CSSProperties = { padding: '3px 6px', borderBottom: '1px solid var(--gray-100)', whiteSpace: 'nowrap' };

export function AnswerCard({ entry, onToggle }: { entry: GenieEntry; onToggle: () => void }) {
  const { question, loading, answer, spec, on } = entry;
  const shown = answer ? answer.rows.slice(0, TABLE_ROWS) : [];
  const total = answer?.totalRows ?? 0;
  const mapCaption = mapRowsCaption(spec, total);

  return (
    <article style={card} aria-busy={loading}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'start', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.3 }}>{question}</h3>
        {spec && (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={on}
            title={on ? 'Hide this answer on the map' : 'Show this answer on the map'}
            style={{
              flex: 'none',
              font: 'inherit',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 999,
              cursor: 'pointer',
              border: `1px solid ${on ? 'var(--navy-900)' : 'var(--gray-300)'}`,
              background: on ? 'var(--navy-900)' : 'var(--white)',
              color: on ? 'var(--white)' : 'var(--gray-700)',
            }}
          >
            {on ? 'On map' : 'Off'}
          </button>
        )}
      </div>

      {loading && (
        <div role="status" style={{ fontSize: '0.875rem', color: 'var(--gray-700)' }}>
          Genie is writing and running a query
        </div>
      )}

      {answer?.error && (
        <div
          role="alert"
          style={{
            fontSize: '0.875rem',
            color: 'var(--navy-900)',
            borderLeft: '3px solid var(--lava-600)',
            paddingLeft: 8,
          }}
        >
          Genie could not answer: {answer.error}
        </div>
      )}

      {answer?.text && <GenieText text={answer.text} />}

      {answer?.sql && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
            SQL Genie ran
          </summary>
          <pre
            style={{
              margin: '6px 0 0',
              padding: 8,
              background: 'var(--light)',
              border: '1px solid var(--gray-100)',
              borderRadius: 6,
              fontSize: '0.75rem',
              lineHeight: 1.4,
              overflowX: 'auto',
              whiteSpace: 'pre',
            }}
          >
            {answer.sql}
          </pre>
        </details>
      )}

      {answer && !loading && !answer.error && answer.columns.length > 0 && (
        <>
          {shown.length > 0 ? (
            <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--gray-100)', borderRadius: 6 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', width: '100%' }}>
                <thead>
                  <tr>
                    {answer.columns.map((c) => (
                      <th key={c} style={th} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    // Result rows have no id; the list is static per answer.
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={i}>
                      {answer.columns.map((c) => (
                        <td
                          key={c}
                          style={{ ...td, color: cellText(r[c]) === 'no data' ? 'var(--gray-500)' : undefined }}
                        >
                          {cellText(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: '0.8125rem', color: 'var(--gray-700)' }}>The query returned no rows.</div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: '0.75rem',
              color: 'var(--gray-500)',
            }}
          >
            <span>
              {total > shown.length
                ? `Showing ${shown.length.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} rows`
                : `${total.toLocaleString('en-US')} ${total === 1 ? 'row' : 'rows'}`}
            </span>
            <span>{spec ? KIND_LABEL[spec.kind] : 'Table only'}</span>
          </div>
          {mapCaption && <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{mapCaption}</div>}
        </>
      )}

      {answer && !loading && !answer.error && answer.columns.length === 0 && !answer.text && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-700)' }}>Genie returned no text or table.</div>
      )}
    </article>
  );
}
