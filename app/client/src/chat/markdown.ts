export type Inline = { text: string; bold: boolean };
export type Block =
  | { kind: 'p'; parts: Inline[] }
  | { kind: 'ul'; items: Inline[][] }
  | { kind: 'ol'; items: Inline[][] };

const BULLET = /^\s*[-*]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

/** **bold** spans; everything else is plain text. */
function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), bold: false });
  return out;
}

/** The small Markdown subset Genie writes: paragraphs, "-" or "*" bullets, "1." or "1)" numbered lists and **bold**. No HTML. */
export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let listKind: 'ul' | 'ol' = 'ul';
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', parts: inline(para.join(' ')) });
    if (list.length) blocks.push({ kind: listKind, items: list.map(inline) });
    para = [];
    list = [];
  };
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    const marker = BULLET.test(raw) ? BULLET : NUMBERED.test(raw) ? NUMBERED : null;
    if (!line) {
      flush();
    } else if (marker) {
      const kind = marker === BULLET ? 'ul' : 'ol';
      if (para.length || (list.length && kind !== listKind)) flush();
      listKind = kind;
      list.push(raw.replace(marker, '').trim());
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}
