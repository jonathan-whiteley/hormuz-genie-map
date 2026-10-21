import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../markdown';

describe('parseMarkdown', () => {
  it('splits paragraphs and bullet lists and finds bold spans', () => {
    const md =
      'Based on the data, **2 ports** are up.\n\n- **Salalah**: 135%\n- Khor Fakkan: 1160%\n\nTreat it **cautiously**.';
    expect(parseMarkdown(md)).toEqual([
      {
        kind: 'p',
        parts: [
          { text: 'Based on the data, ', bold: false },
          { text: '2 ports', bold: true },
          { text: ' are up.', bold: false },
        ],
      },
      {
        kind: 'ul',
        items: [
          [
            { text: 'Salalah', bold: true },
            { text: ': 135%', bold: false },
          ],
          [{ text: 'Khor Fakkan: 1160%', bold: false }],
        ],
      },
      {
        kind: 'p',
        parts: [
          { text: 'Treat it ', bold: false },
          { text: 'cautiously', bold: true },
          { text: '.', bold: false },
        ],
      },
    ]);
  });

  it('joins wrapped lines into one paragraph, accepts * bullets and returns [] for blank input', () => {
    expect(parseMarkdown('one\ntwo')).toEqual([{ kind: 'p', parts: [{ text: 'one two', bold: false }] }]);
    expect(parseMarkdown('* a')).toEqual([{ kind: 'ul', items: [[{ text: 'a', bold: false }]] }]);
    expect(parseMarkdown('   ')).toEqual([]);
  });

  it('parses numbered lists into an ol and keeps inline bold', () => {
    expect(parseMarkdown('Top ports:\n1. **Salalah**: 135%\n2) Sohar: 98%')).toEqual([
      { kind: 'p', parts: [{ text: 'Top ports:', bold: false }] },
      {
        kind: 'ol',
        items: [
          [
            { text: 'Salalah', bold: true },
            { text: ': 135%', bold: false },
          ],
          [{ text: 'Sohar: 98%', bold: false }],
        ],
      },
    ]);
  });

  it('splits a bullet list followed directly by a numbered list into two blocks', () => {
    expect(parseMarkdown('- a\n- b\n1. c\n2. d')).toEqual([
      { kind: 'ul', items: [[{ text: 'a', bold: false }], [{ text: 'b', bold: false }]] },
      { kind: 'ol', items: [[{ text: 'c', bold: false }], [{ text: 'd', bold: false }]] },
    ]);
  });
});
