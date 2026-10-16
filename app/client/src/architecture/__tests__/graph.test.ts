import { describe, expect, it } from 'vitest';
import { COLUMN_LABELS, EDGES, LAYERS, NODES, nodeResources } from '../graph';

describe('architecture graph', () => {
  const ids = new Set(NODES.map((n) => n.id));

  it('has unique node ids', () => {
    expect(ids.size).toBe(NODES.length);
  });

  it('every edge connects existing nodes', () => {
    for (const e of EDGES) {
      expect(ids.has(e.source), `${e.id} source`).toBe(true);
      expect(ids.has(e.target), `${e.id} target`).toBe(true);
    }
  });

  it('every node column is 1 to 6', () => {
    for (const n of NODES) expect([1, 2, 3, 4, 5, 6]).toContain(n.column);
  });

  it('has exactly 6 distinct column labels', () => {
    expect(new Set(Object.values(COLUMN_LABELS)).size).toBe(6);
    expect(COLUMN_LABELS[1]).toBe('1 Sources');
    expect(COLUMN_LABELS[6]).toBe('6 Serve');
  });

  it('has no em or en dashes in copy', () => {
    for (const n of NODES) {
      for (const s of [n.title, n.sub, n.detail.talk, ...n.detail.resources]) {
        expect(s).not.toMatch(/[\u2014\u2013]/);
      }
    }
    for (const e of EDGES) expect(e.label ?? '').not.toMatch(/[\u2014\u2013]/);
  });

  it('every node has at least one resource and a defined layer', () => {
    for (const n of NODES) {
      expect(n.detail.resources.length).toBeGreaterThan(0);
      expect(LAYERS[n.layer]).toBeDefined();
    }
  });

  it('includes the ai_decide node wired from Unity Catalog to Genie', () => {
    const n = NODES.find((x) => x.id === 'ai_decide');
    expect(n?.layer).toBe('aifn');
    expect(n?.column).toBe(5);
    expect(LAYERS.aifn).toEqual({ label: 'AI Functions', fg: '#5A2D82' });
    expect(EDGES.some((e) => e.source === 'uc' && e.target === 'ai_decide')).toBe(true);
    expect(EDGES.some((e) => e.source === 'ai_decide' && e.target === 'genie' && e.label === 'recommendations')).toBe(true);
  });

  it('the Unity Catalog node shows the configured schema, never a hardcoded catalog', () => {
    const uc = NODES.find((n) => n.id === 'uc')!;
    expect(nodeResources(uc, { catalog: 'main', schema: 'hormuz' })).toEqual(['main.hormuz']);
    expect(JSON.stringify(NODES)).not.toContain('jdub_demo');
    const app = NODES.find((n) => n.id === 'app')!;
    expect(nodeResources(app, { catalog: 'main', schema: 'hormuz' })).toEqual(['hormuz-map']);
  });

  it('the demo lanes edge is labeled synthetic', () => {
    expect(EDGES.find((e) => e.id === 'demolanes->sdp')?.label).toBe('synthetic');
  });
});
