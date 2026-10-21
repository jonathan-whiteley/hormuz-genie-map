/* Parsed blocks have no identity beyond their position, so index keys are correct here. */
/* eslint-disable react/no-array-index-key */
import { parseMarkdown, type Inline } from './markdown';

const spans = (parts: Inline[]) =>
  parts.map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>));

const list = { margin: '0 0 8px', paddingLeft: 18 };

const items = (rows: Inline[][]) =>
  rows.map((it, j) => (
    <li key={j} style={{ marginBottom: 4 }}>
      {spans(it)}
    </li>
  ));

/** Genie text rendered from parsed blocks (React elements only, never raw HTML). */
export function Markdown({ text }: { text: string }) {
  return (
    <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
      {parseMarkdown(text).map((b, i) =>
        b.kind === 'p' ? (
          <p key={i} style={{ margin: '0 0 8px' }}>
            {spans(b.parts)}
          </p>
        ) : b.kind === 'ul' ? (
          <ul key={i} style={list}>
            {items(b.items)}
          </ul>
        ) : (
          <ol key={i} style={list}>
            {items(b.items)}
          </ol>
        )
      )}
    </div>
  );
}
