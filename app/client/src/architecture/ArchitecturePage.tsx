import { useCallback, useState } from 'react';
import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  getNodesBounds,
  getViewportForBounds,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng, toSvg } from 'html-to-image';
import {
  Bot,
  Brain,
  CalendarClock,
  Database,
  Globe,
  LayoutDashboard,
  MapPinned,
  MessageSquareText,
  Radio,
  ServerCog,
  Ship,
  Sparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useAppConfig } from '../lib/appConfig';
import {
  COLUMN_LABELS,
  EDGES,
  LAYERS,
  NODES,
  nodeResources,
  type ArchColumn,
  type ArchLayer,
  type ArchNode,
} from './graph';

const COL_WIDTH = 320;
/** Extra room between Sources and Ingest so 'websocket, 5 min each hour' fits on its edge. */
const SOURCES_GAP = 80;
const FIT_PADDING = 0.04;
/** Margin around the nodes in an exported image, in pixels. */
const EXPORT_MARGIN = 32;
const ROW_HEIGHT = 112;
const CARD_WIDTH = 210;
const HEADER_Y = -40;
const PAGE_BG = '#F9F7F4'; // tokens --light

const ICONS: Record<string, LucideIcon> = {
  portwatch: Ship,
  aisstream: Radio,
  naturalearth: Globe,
  demolanes: MapPinned,
  jobs: CalendarClock,
  sdp_py: Workflow,
  sdp: Workflow,
  spatial: Sparkles,
  uc: Database,
  ai_decide: Brain,
  genie: MessageSquareText,
  dbsql: ServerCog,
  app: LayoutDashboard,
};

function tone(layer: ArchLayer) {
  const fg = LAYERS[layer].fg;
  return { fg, ring: `${fg}66`, tint: `${fg}1A` };
}

interface CardData extends Record<string, unknown> {
  node: ArchNode;
}

const hiddenHandle: React.CSSProperties = { background: 'transparent', border: 0, width: 1, height: 1, pointerEvents: 'none' };

function CardNode({ data }: NodeProps) {
  const { node } = data as CardData;
  const t = tone(node.layer);
  const Icon = ICONS[node.id] ?? Bot;
  return (
    <div
      style={{
        background: 'var(--white)',
        border: `1.5px solid ${t.ring}`,
        borderRadius: 10,
        padding: '12px 14px',
        width: CARD_WIDTH,
        boxShadow: '0 1px 3px rgba(11,32,38,0.06), 0 4px 12px rgba(11,32,38,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
      }}
    >
      <div
        style={{ width: 32, height: 32, borderRadius: 8, background: t.tint, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <Icon size={16} strokeWidth={2} aria-hidden />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.fg, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{node.title}</div>
        <div style={{ fontSize: 11, color: 'var(--gray-700)', marginTop: 3, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{node.sub}</div>
      </div>
      <Handle type="target" position={Position.Left} isConnectable={false} style={hiddenHandle} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={hiddenHandle} />
      <Handle id="bottom-source" type="source" position={Position.Bottom} isConnectable={false} style={hiddenHandle} />
      <Handle id="top-target" type="target" position={Position.Top} isConnectable={false} style={hiddenHandle} />
    </div>
  );
}

function HeaderNode({ data }: NodeProps) {
  const { label } = data as { label: string };
  return (
    <div
      style={{
        width: CARD_WIDTH,
        textAlign: 'center',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--gray-500)',
        padding: '8px 0 10px',
        borderBottom: '1.5px solid var(--gray-300)',
      }}
    >
      {label}
    </div>
  );
}

const nodeTypes = { card: CardNode, header: HeaderNode };

/** Vertically center each column's nodes around a shared midline. */
function layout(): Node[] {
  const byColumn = new Map<ArchColumn, ArchNode[]>();
  for (const n of NODES) byColumn.set(n.column, [...(byColumn.get(n.column) ?? []), n]);
  const maxRows = Math.max(...[...byColumn.values()].map((l) => l.length));
  const mid = ((maxRows - 1) * ROW_HEIGHT) / 2;
  const out: Node[] = [];
  for (const col of [1, 2, 3, 4, 5, 6] as ArchColumn[]) {
    const x = (col - 1) * COL_WIDTH + (col > 1 ? SOURCES_GAP : 0);
    out.push({
      id: `hdr-${col}`,
      type: 'header',
      position: { x, y: HEADER_Y },
      data: { label: COLUMN_LABELS[col] },
      draggable: false,
      selectable: false,
    });
    const list = byColumn.get(col) ?? [];
    list.forEach((node, i) => {
      out.push({
        id: node.id,
        type: 'card',
        position: { x, y: mid + (i - (list.length - 1) / 2) * ROW_HEIGHT },
        data: { node } satisfies CardData,
      });
    });
  }
  return out;
}

/** Synthetic inputs (the demo lanes) draw in a light gray so they read differently from real data flows. */
const SYNTHETIC_STROKE = '#A3AAB5';

function buildEdges(): Edge[] {
  const col = new Map(NODES.map((n) => [n.id, n]));
  return EDGES.map((e) => {
    const color = e.dashed ? SYNTHETIC_STROKE : LAYERS[col.get(e.source)!.layer].fg;
    const sameColumn = col.get(e.source)!.column === col.get(e.target)!.column;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: sameColumn ? 'bottom-source' : undefined,
      targetHandle: sameColumn ? 'top-target' : undefined,
      type: 'smoothstep',
      // Static edges: animated dashes read as 'synthetic', which only the demo lanes edge is.
      animated: false,
      label: e.label,
      labelStyle: { fontSize: 10, fill: 'var(--gray-700)', fontFamily: 'var(--font-sans)' },
      labelShowBg: true,
      labelBgStyle: { fill: '#FFFFFF' },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
      style: { stroke: color, strokeWidth: 1.5, strokeDasharray: e.dashed ? '5 5' : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
    } satisfies Edge;
  });
}

const INITIAL_NODES = layout();
const INITIAL_EDGES = buildEdges();

function ToolBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        height: 28,
        padding: '0 10px',
        border: 0,
        background: 'transparent',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--navy-900)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--gray-100)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

function Toolbar() {
  const flow = useReactFlow();
  const onExport = useCallback(
    async (kind: 'png' | 'svg') => {
      // React Flow's download recipe: render only the viewport, framed on the nodes' bounds, so the
      // image is tight around the diagram whatever the on-screen zoom or pan.
      const el = document.querySelector<HTMLElement>('.arch-canvas .react-flow__viewport');
      if (!el) return;
      const bounds = getNodesBounds(flow.getNodes());
      const width = Math.ceil(bounds.width + 2 * EXPORT_MARGIN);
      const height = Math.ceil(bounds.height + 2 * EXPORT_MARGIN);
      const vp = getViewportForBounds(bounds, width, height, 0.5, 2, 0);
      const exporter = kind === 'png' ? toPng : toSvg;
      const url = await exporter(el, {
        backgroundColor: PAGE_BG,
        cacheBust: true,
        pixelRatio: 2,
        width,
        height,
        style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `hormuz-architecture.${kind}`;
      a.click();
    },
    [flow],
  );
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        display: 'flex',
        gap: 6,
        background: 'rgba(255,255,255,0.96)',
        padding: 6,
        borderRadius: 10,
        border: '1px solid var(--gray-300)',
        boxShadow: '0 2px 8px rgba(11,32,38,0.08)',
      }}
    >
      <ToolBtn onClick={() => void flow.zoomIn({ duration: 200 })}>Zoom In</ToolBtn>
      <ToolBtn onClick={() => void flow.zoomOut({ duration: 200 })}>Zoom Out</ToolBtn>
      <ToolBtn onClick={() => void flow.fitView({ padding: FIT_PADDING, duration: 250 })}>Fit</ToolBtn>
      <span style={{ width: 1, background: 'var(--gray-300)', margin: '4px 2px' }} />
      <ToolBtn onClick={() => void onExport('png')} label="Export PNG">PNG</ToolBtn>
      <ToolBtn onClick={() => void onExport('svg')} label="Export SVG">SVG</ToolBtn>
    </div>
  );
}

interface Popover {
  node: ArchNode;
  x: number;
  y: number;
}

function NodePopover({ pop, onClose }: { pop: Popover; onClose: () => void }) {
  const t = tone(pop.node.layer);
  const resources = nodeResources(pop.node, useAppConfig());
  return (
    <div
      role="dialog"
      aria-label={`${pop.node.title} details`}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      style={{
        position: 'absolute',
        left: pop.x,
        top: pop.y,
        zIndex: 20,
        width: 280,
        background: 'var(--white)',
        border: `1.5px solid ${t.ring}`,
        borderRadius: 10,
        padding: 'var(--space-2)',
        boxShadow: '0 6px 20px rgba(11,32,38,0.18)',
        fontSize: 12.5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ color: t.fg, fontSize: 13.5 }}>{pop.node.title}</strong>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="Close details"
          style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--gray-700)' }}
        >
          &times;
        </button>
      </div>
      <ul style={{ margin: '8px 0', paddingLeft: 18, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5 }}>
        {resources.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p style={{ margin: 0, color: 'var(--gray-700)', lineHeight: 1.4 }}>{pop.node.detail.talk}</p>
    </div>
  );
}

function FlowInner() {
  const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, , onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [pop, setPop] = useState<Popover | null>(null);

  const onNodeClick: NodeMouseHandler = useCallback((event, n) => {
    const node = (n.data as Partial<CardData>).node;
    if (!node) return;
    const box = document.querySelector('.arch-canvas')?.getBoundingClientRect();
    if (!box) return;
    const x = Math.max(8, Math.min(event.clientX - box.left + 12, box.width - 296));
    const y = Math.max(8, Math.min(event.clientY - box.top + 12, box.height - 200));
    setPop({ node, x, y });
  }, []);

  return (
    <div className="arch-canvas" style={{ position: 'relative', height: 'clamp(440px, calc(100vh - 340px), 560px)', background: PAGE_BG }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={() => setPop(null)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: FIT_PADDING }}
        minZoom={0.3}
        maxZoom={1.6}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background gap={24} size={1} color="#E4E1DA" />
      </ReactFlow>
      <Toolbar />
      {pop && <NodePopover pop={pop} onClose={() => setPop(null)} />}
    </div>
  );
}

function Legend() {
  return (
    <div
      style={{
        borderTop: '1px solid var(--gray-300)',
        background: 'var(--white)',
        padding: '12px 16px',
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        alignItems: 'center',
        fontSize: 12,
      }}
    >
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray-500)' }}>Layers</span>
      {(Object.keys(LAYERS) as ArchLayer[]).map((k) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: LAYERS[k].fg, display: 'block' }} />
          {LAYERS[k].label}
        </span>
      ))}
    </div>
  );
}

export default function ArchitecturePage() {
  return (
    <main style={{ padding: 'var(--space-3)', maxWidth: 1500, margin: '0 auto' }}>
      <header style={{ marginBottom: 'var(--space-3)' }}>
        <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lava-600)' }}>
          Architecture
        </p>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>System Architecture</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--gray-700)' }}>
          From public shipping signals to a map you can question, all governed by Unity Catalog. Drag nodes, scroll to zoom, export to PNG or SVG.
        </p>
      </header>
      <div style={{ border: '1px solid var(--gray-300)', borderRadius: 12, overflow: 'hidden', background: 'var(--white)' }}>
        <ReactFlowProvider>
          <FlowInner />
        </ReactFlowProvider>
        <Legend />
      </div>
    </main>
  );
}
