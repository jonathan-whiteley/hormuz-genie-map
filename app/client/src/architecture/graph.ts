export type ArchLayer = 'source' | 'jobs' | 'sdp' | 'spatial' | 'uc' | 'genie' | 'dbsql' | 'app' | 'aifn';
export type ArchColumn = 1 | 2 | 3 | 4 | 5 | 6;

export interface ArchNode {
  id: string;
  column: ArchColumn;
  title: string;
  sub: string;
  layer: ArchLayer;
  detail: { resources: string[]; talk: string };
}

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  dashed?: boolean;
}

export const COLUMN_LABELS: Record<ArchColumn, string> = {
  1: '1 Sources',
  2: '2 Ingest',
  3: '3 Process',
  4: '4 Govern',
  5: '5 Intelligence',
  6: '6 Serve',
};

/** Layer colors derived from the Databricks tokens (Navy 900, Lava 600) plus a teal/violet/amber/green accent set. */
export const LAYERS: Record<ArchLayer, { label: string; fg: string }> = {
  source: { label: 'Sources', fg: '#64748B' },
  jobs: { label: 'Lakeflow Jobs', fg: '#0B2026' },
  sdp: { label: 'Lakeflow SDP', fg: '#1B5162' },
  spatial: { label: 'Spatial SQL', fg: '#1B8A8F' },
  uc: { label: 'Unity Catalog', fg: '#7C4DFF' },
  genie: { label: 'Genie', fg: '#FF3621' },
  dbsql: { label: 'Databricks SQL', fg: '#F5A623' },
  app: { label: 'Databricks App', fg: '#00A972' },
  aifn: { label: 'AI Functions', fg: '#5A2D82' },
};

export const NODES: ArchNode[] = [
  {
    id: 'portwatch',
    column: 1,
    title: 'IMF PortWatch',
    sub: 'daily chokepoint and port activity (REST)',
    layer: 'source',
    detail: {
      resources: ['bronze_portwatch_chokepoints_daily', 'bronze_portwatch_ports_daily'],
      talk: 'Public daily counts of ships through chokepoints and ports, with no key and no cost.',
    },
  },
  {
    id: 'aisstream',
    column: 1,
    title: 'aisstream.io',
    sub: 'live AIS positions (websocket, free key)',
    layer: 'source',
    detail: {
      resources: ['bronze_ais_samples'],
      talk: 'A free live feed of ship positions, sampled for five minutes each hour to show what AIS can and cannot see.',
    },
  },
  {
    id: 'naturalearth',
    column: 1,
    title: 'Natural Earth',
    sub: 'land polygons',
    layer: 'source',
    detail: {
      resources: ['ref_land_region'],
      talk: 'Public land outlines let us tell sea cells from land cells when we measure how much of the Gulf we can see.',
    },
  },
  {
    id: 'demolanes',
    column: 1,
    title: 'Demo lanes',
    sub: 'synthetic supply lanes (editable)',
    layer: 'source',
    detail: {
      resources: ['ref_demo_lanes'],
      talk: 'Six invented supply lanes stand in for a customer and can be edited in one table to fit any story.',
    },
  },
  {
    id: 'jobs',
    column: 2,
    title: 'Lakeflow Jobs',
    sub: 'hourly 5-minute AIS sampler, daily refresh',
    layer: 'jobs',
    detail: {
      resources: ['hormuz_reference_daily', 'hormuz_ais_sampler'],
      talk: 'Two scheduled jobs keep the data fresh: a daily reference refresh and an hourly five-minute AIS sampler.',
    },
  },
  {
    id: 'sdp_py',
    column: 2,
    title: 'Lakeflow SDP (Python)',
    sub: 'PortWatch and Natural Earth pulls',
    layer: 'sdp',
    detail: {
      resources: ['hormuz_reference'],
      talk: 'A Python pipeline pulls the public PortWatch and Natural Earth data straight into Delta tables.',
    },
  },
  {
    id: 'sdp',
    column: 3,
    title: 'Lakeflow SDP',
    sub: 'bronze, silver, gold materialized views',
    layer: 'sdp',
    detail: {
      resources: ['hormuz_reference', 'hormuz_ais'],
      talk: 'Declarative pipelines turn raw pulls into clean bronze, silver and gold tables without manual orchestration.',
    },
  },
  {
    id: 'spatial',
    column: 3,
    title: 'Spatial SQL',
    sub: 'H3 res 5 and 7, ST functions',
    layer: 'spatial',
    detail: {
      resources: ['h3_longlatash3', 'st_intersection', 'gold_ais_h3_daily'],
      talk: 'Built-in H3 and ST functions bin ship positions into hexagons and clip them to sea, all in plain SQL.',
    },
  },
  {
    id: 'uc',
    column: 4,
    title: 'Unity Catalog',
    sub: 'Delta tables, lineage, on-behalf-of-user access',
    layer: 'uc',
    detail: {
      // Replaced at render time by the app's own catalog.schema (see nodeResources).
      resources: ['<catalog>.<schema>'],
      talk: 'Every table lives in one governed schema with lineage, and the app reads it with the signed in viewer permissions.',
    },
  },
  {
    id: 'ai_decide',
    column: 5,
    title: 'AI Functions',
    sub: 'ai_decide lane recommendations',
    layer: 'aifn',
    detail: {
      resources: ['gold_lane_recommendation', 'hormuz_decisions'],
      talk: 'A decision model reads a plain-language description of each lane and returns calibrated probabilities; our SQL turns them into Recommended, Review, or Analyst.',
    },
  },
  {
    id: 'genie',
    column: 5,
    title: 'AI/BI Genie',
    sub: 'Hormuz Chokepoint Monitor space',
    layer: 'genie',
    detail: {
      resources: ['Hormuz Chokepoint Monitor'],
      talk: 'Ask a question in plain English and Genie writes the SQL, then the answer lands on the map as a layer.',
    },
  },
  {
    id: 'dbsql',
    column: 5,
    title: 'Databricks SQL',
    sub: 'serverless warehouse',
    layer: 'dbsql',
    detail: {
      resources: ['serverless SQL warehouse'],
      talk: 'One serverless warehouse runs both the map queries and the SQL that Genie generates.',
    },
  },
  {
    id: 'app',
    column: 6,
    title: 'Databricks App',
    sub: 'AppKit + React + deck.gl map',
    layer: 'app',
    detail: {
      resources: ['hormuz-map'],
      talk: 'This app serves the map and the Genie chat from one place, with no data copied out of Databricks.',
    },
  },
];

export const EDGES: ArchEdge[] = [
  { id: 'portwatch->sdp_py', source: 'portwatch', target: 'sdp_py', label: 'REST, daily' },
  { id: 'naturalearth->sdp_py', source: 'naturalearth', target: 'sdp_py', label: 'REST, daily' },
  { id: 'aisstream->jobs', source: 'aisstream', target: 'jobs', label: 'websocket, 5 min each hour' },
  { id: 'demolanes->sdp', source: 'demolanes', target: 'sdp', label: 'synthetic', dashed: true },
  { id: 'jobs->sdp', source: 'jobs', target: 'sdp' },
  { id: 'sdp_py->sdp', source: 'sdp_py', target: 'sdp' },
  { id: 'jobs->spatial', source: 'jobs', target: 'spatial' },
  { id: 'sdp->uc', source: 'sdp', target: 'uc' },
  { id: 'spatial->uc', source: 'spatial', target: 'uc' },
  { id: 'uc->genie', source: 'uc', target: 'genie' },
  { id: 'uc->dbsql', source: 'uc', target: 'dbsql' },
  { id: 'uc->ai_decide', source: 'uc', target: 'ai_decide' },
  { id: 'ai_decide->genie', source: 'ai_decide', target: 'genie', label: 'recommendations' },
  { id: 'genie->app', source: 'genie', target: 'app', label: 'answers' },
  { id: 'dbsql->app', source: 'dbsql', target: 'app', label: 'map queries' },
];

/** A node's resource lines; the Unity Catalog node shows the schema this app actually reads. */
export function nodeResources(node: ArchNode, cfg: { catalog: string; schema: string } | null): string[] {
  if (node.id === 'uc' && cfg) return [`${cfg.catalog}.${cfg.schema}`];
  return node.detail.resources;
}
