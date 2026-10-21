import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { TABLE_ROWS, cellText, mapRowsCaption } from '../genie/genieLayer';
import { useChat } from './chatStore';
import type { GenieMsg } from './thread';

const th: CSSProperties = {
  textAlign: 'left',
  fontWeight: 700,
  padding: '4px 8px',
  borderBottom: '1px solid var(--gray-300)',
  whiteSpace: 'nowrap',
};
const td: CSSProperties = { padding: '4px 8px', borderBottom: '1px solid var(--gray-100)', whiteSpace: 'nowrap' };

/** The collapsed result table. When this reply is on the map, rows and marks highlight each other. */
export function AnswerTable({ msg, active }: { msg: GenieMsg; active: boolean }) {
  const { hoverRow, setHoverRow, focusRow } = useChat();
  const [open, setOpen] = useState(false);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const answer = msg.answer;

  // A mark clicked on the map (a new focusRow key) opens this table, but only while this reply is
  // active. Activation alone never opens it, and a key seen before mount is ignored.
  const [seenFocusKey, setSeenFocusKey] = useState(focusRow?.key);
  const [scrollTarget, setScrollTarget] = useState<typeof focusRow>(null);
  if (focusRow?.key !== seenFocusKey) {
    setSeenFocusKey(focusRow?.key);
    if (active && focusRow) {
      setOpen(true);
      setScrollTarget(focusRow);
    }
  }
  // Scroll the picked row into view once the open table is on screen.
  useEffect(() => {
    if (!scrollTarget) return;
    const frame = requestAnimationFrame(() =>
      rowRefs.current.get(scrollTarget.row)?.scrollIntoView({ block: 'nearest' })
    );
    return () => cancelAnimationFrame(frame);
  }, [scrollTarget]);

  if (!answer || answer.columns.length === 0) return null;
  const columns = answer.columns.filter((c) => !c.startsWith('__'));
  const rows = answer.rows.slice(0, TABLE_ROWS);
  const caption = mapRowsCaption(msg.spec, answer.totalRows);

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} style={{ minWidth: 0 }}>
      <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
        Table ({answer.totalRows.toLocaleString('en-US')} {answer.totalRows === 1 ? 'row' : 'rows'})
      </summary>
      <div
        style={{
          width: '100%',
          overflowX: 'auto',
          maxHeight: 260,
          marginTop: 6,
          border: '1px solid var(--gray-300)',
          borderRadius: 8,
        }}
      >
        <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', width: '100%' }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} style={th}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                // The index is the row's identity: it is AnswerFeature.rowIndex, shared with the map.
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                ref={(el) => {
                  if (el) rowRefs.current.set(i, el);
                  else rowRefs.current.delete(i);
                }}
                onMouseEnter={() => active && setHoverRow(i)}
                onMouseLeave={() => active && setHoverRow(null)}
                style={{ background: active && hoverRow === i ? '#FFF1EE' : undefined }}
              >
                {columns.map((c) => (
                  <td key={c} style={{ ...td, color: cellText(r[c]) === 'no data' ? 'var(--gray-500)' : undefined }}>
                    {cellText(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(caption || answer.totalRows > TABLE_ROWS) && (
        <div style={{ fontSize: '0.75rem', color: 'var(--gray-700)', marginTop: 4 }}>
          {answer.totalRows > TABLE_ROWS
            ? `Showing ${TABLE_ROWS} of ${answer.totalRows.toLocaleString('en-US')} rows. `
            : ''}
          {caption ?? ''}
        </div>
      )}
    </details>
  );
}
