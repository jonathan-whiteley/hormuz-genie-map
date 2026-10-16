import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../data/loadAll';
import type { ChokepointDay, Dataset, LaneDay, PortDay } from '../../data/types';
import { GRAY, NAVY, pctColor } from '../colors';
import { ScatterplotLayer } from '@deck.gl/layers';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import type { GenieMapLayer } from '../../genie/genieLayer';
import { ALL_ON, buildLayers, portMetric, type MapDatum } from '../layers';

const port = (o: Partial<PortDay>): PortDay => ({
  date: '2026-03-01',
  port: 'Jebel Ali',
  country: 'UAE',
  lat: 25,
  lon: 55,
  portcalls_tanker_7d_avg: 4,
  portcalls_container_7d_avg: 9,
  portcalls_dry_bulk_7d_avg: 1,
  baseline_portcalls_tanker: 8,
  baseline_portcalls_container: 18,
  baseline_portcalls_dry_bulk: 2,
  pct_of_baseline_portcalls_tanker: 50,
  pct_of_baseline_portcalls_container: 50,
  pct_of_baseline_portcalls_dry_bulk: 50,
  ...o,
});

const choke = (o: Partial<ChokepointDay>): ChokepointDay => ({
  date: '2026-03-01',
  chokepoint: 'Strait of Hormuz',
  lat: 26.5,
  lon: 56.3,
  n_total: 10,
  n_tanker: 5,
  n_container: 3,
  n_dry_bulk: 2,
  n_total_7d_avg: 16,
  n_tanker_7d_avg: 8,
  n_container_7d_avg: 4,
  n_dry_bulk_7d_avg: 4,
  pct_of_baseline_total: 20,
  pct_of_baseline_tanker: 20,
  pct_of_baseline_container: 20,
  pct_of_baseline_dry_bulk: 20,
  ...o,
});

const lane = (o: Partial<LaneDay>): LaneDay => ({
  date: '2026-03-01',
  lane_id: 'L1',
  lane: 'Crude to refinery',
  commodity: 'Crude',
  vessel_type: 'tanker',
  primary_port: 'Ras Tanura',
  alternative_ports: ['Yanbu'],
  alternative_route: 'East-West pipeline',
  alt_exit: 'Bab el-Mandeb',
  annual_volume: 1000,
  volume_unit: 'tonnes',
  primary_lat: 26.6,
  primary_lon: 50.1,
  hormuz_lat: 26.5,
  hormuz_lon: 56.3,
  exit_lat: 12.6,
  exit_lon: 43.3,
  alt_ports: [{ port: 'Yanbu', lat: 24.1, lon: 38.1, pct: 140 }],
  hormuz_pct: 20,
  primary_pct: 30,
  alternative_pct: 140,
  status: 'Disrupted',
  volume_at_risk: 500,
  ...o,
});

function fixture(): Dataset {
  return {
    ...emptyDataset(),
    chokepoints: [choke({}), choke({ date: '2026-02-01', n_tanker_7d_avg: 40, pct_of_baseline_tanker: 100 })],
    ports: [
      port({}),
      port({ port: 'Empty', portcalls_tanker_7d_avg: null, pct_of_baseline_portcalls_tanker: null }),
      port({
        port: 'Tiny',
        baseline_portcalls_tanker: 0.4,
        portcalls_tanker_7d_avg: 2,
        pct_of_baseline_portcalls_tanker: 500,
      }),
    ],
    lanes: [lane({}), lane({ lane_id: 'L3', exit_lat: null, exit_lon: null, status: 'Normal' })],
    regions: [
      {
        region: 'gulf_hormuz',
        role: 'gulf',
        label: 'Gulf',
        lat_min: 24,
        lon_min: 50,
        lat_max: 27,
        lon_max: 57,
        area_km2: 1,
      },
    ],
    aisCells: [
      { region: 'gulf_hormuz', day: '2026-02-28', h3_res5_str: '85283473fffffff', unique_vessels: 10, positions: 30 },
      { region: 'gulf_hormuz', day: '2026-03-05', h3_res5_str: '85283477fffffff', unique_vessels: 3, positions: 9 },
    ],
  };
}

const ids = (ls: { id: string }[]) => ls.map((l) => l.id);
const dataOf = (ls: { id: string; props: unknown }[], id: string): MapDatum[] => {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`missing layer ${id}`);
  return (l.props as { data: MapDatum[] }).data;
};
const acc = <T>(ls: { id: string; props: unknown }[], id: string, name: string) => {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`missing layer ${id}`);
  return (l.props as Record<string, (d: MapDatum) => T>)[name];
};

describe('buildLayers', () => {
  const args = { dataset: fixture(), date: '2026-03-02', vessel: 'tanker' as const, visible: ALL_ON };

  it('emits the expected layer ids', () => {
    const got = ids(buildLayers(args));
    for (const id of ['chokepoints', 'ports', 'lanes-primary', 'lanes-alt', 'ais-cells', 'regions']) {
      expect(got).toContain(id);
    }
  });

  it('omits toggled-off layers', () => {
    const got = ids(
      buildLayers({ ...args, visible: { ...ALL_ON, ports: false, lanes: false, aisCells: false, regions: false } })
    );
    expect(got).toContain('chokepoints');
    for (const id of ['ports', 'lanes-primary', 'lanes-alt', 'ais-cells', 'regions']) expect(got).not.toContain(id);
  });

  it('a lane with null exit produces no alt path', () => {
    const alt = dataOf(buildLayers(args), 'lanes-alt');
    expect(alt.map((d) => d.laneId)).toEqual(['L1']);
    const primary = dataOf(buildLayers(args), 'lanes-primary');
    const l3 = primary.find((d) => d.laneId === 'L3');
    expect(l3?.path).toHaveLength(2);
  });

  it('uses the latest chokepoint row on or before the date', () => {
    const ls = buildLayers({ ...args, date: '2026-02-15' });
    expect(dataOf(ls, 'chokepoints')[0].value7d).toBe(40);
  });

  it('radius for a null value is 6, not NaN', () => {
    const ls = buildLayers(args);
    const empty = dataOf(ls, 'ports').find((d) => d.name === 'Empty');
    expect(empty).toBeDefined();
    expect(acc<number>(ls, 'ports', 'getRadius')(empty!)).toBe(6);
    const jebel = dataOf(ls, 'ports').find((d) => d.name === 'Jebel Ali');
    expect(acc<number>(ls, 'ports', 'getRadius')(jebel!)).toBeCloseTo(6 + 2.5 * 2);
  });

  it('low-baseline ports are gray, not colored by their inflated percent', () => {
    const ls = buildLayers(args);
    const tiny = dataOf(ls, 'ports').find((d) => d.name === 'Tiny');
    expect(tiny?.lowBaseline).toBe(true);
    expect(acc<number[]>(ls, 'ports', 'getFillColor')(tiny!)).toEqual(GRAY);
    const jebel = dataOf(ls, 'ports').find((d) => d.name === 'Jebel Ali');
    expect(acc<number[]>(ls, 'ports', 'getFillColor')(jebel!)).toEqual(pctColor(50));
  });

  it('skips ports and chokepoints without coordinates instead of drawing them at (0, 0)', () => {
    const ds = fixture();
    const ds2 = {
      ...ds,
      ports: [...ds.ports, port({ port: 'Nowhere', lat: null, lon: null })],
      chokepoints: [...ds.chokepoints, choke({ chokepoint: 'Lost', lat: null })],
    };
    const ls = buildLayers({ ...args, dataset: ds2 });
    expect(dataOf(ls, 'ports').map((d) => d.name)).not.toContain('Nowhere');
    expect(dataOf(ls, 'chokepoints').map((d) => d.name)).not.toContain('Lost');
    for (const d of [...dataOf(ls, 'ports'), ...dataOf(ls, 'chokepoints')]) expect(d.position).not.toEqual([0, 0]);
  });

  it('AIS cells draw in Navy with an alpha ramp', () => {
    const ls = buildLayers(args);
    const cell = dataOf(ls, 'ais-cells')[0];
    expect(acc<number[]>(ls, 'ais-cells', 'getFillColor')(cell).slice(0, 3)).toEqual([...NAVY]);
  });

  it('AIS cells use the latest day on or before the date', () => {
    expect(dataOf(buildLayers(args), 'ais-cells').map((d) => d.name)).toEqual(['85283473fffffff']);
    expect(dataOf(buildLayers({ ...args, date: '2026-03-09' }), 'ais-cells').map((d) => d.name)).toEqual([
      '85283477fffffff',
    ]);
  });
});

describe('buildLayers with Genie answers', () => {
  const args = { dataset: fixture(), date: '2026-03-02', vessel: 'tanker' as const, visible: ALL_ON };
  const pts: GenieMapLayer = {
    id: 'genie-1',
    title: 'Which ports?',
    spec: {
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      valueField: 'n',
      rows: [{ port: 'Salalah', lat: '16.9', lon: '54', n: '4' }],
    },
  };
  const hex: GenieMapLayer = {
    id: 'genie-2',
    title: 'Where is AIS?',
    spec: { kind: 'h3', hexField: 'h3', valueField: 'v', rows: [{ h3: '85283473fffffff', v: 2 }] },
  };
  const lanes: GenieMapLayer = { id: 'genie-3', title: 'Which lanes?', spec: { kind: 'lanes', laneIds: ['L3'] } };
  const genieLayers = [lanes, hex, pts];

  it('renders points and h3 specs under their own stable ids', () => {
    const ls = buildLayers({ ...args, genieLayers });
    expect(ids(ls)).toEqual(expect.arrayContaining(['genie-1', 'genie-2']));
    expect(ids(ls)).not.toContain('genie-3');
    expect(dataOf(ls, 'genie-1')[0].position).toEqual([54, 16.9]);
    expect(dataOf(ls, 'genie-2')[0].hexagon).toBe('85283473fffffff');
  });

  it('adding an answer of another kind leaves the first layer id and class unchanged', () => {
    const before = buildLayers({ ...args, genieLayers: [pts] }).find((l) => l.id === 'genie-1');
    const after = buildLayers({ ...args, genieLayers: [hex, pts] }).find((l) => l.id === 'genie-1');
    expect(before?.constructor).toBe(ScatterplotLayer);
    expect(after?.constructor).toBe(ScatterplotLayer);
    const h = buildLayers({ ...args, genieLayers: [hex, pts] }).find((l) => l.id === 'genie-2');
    expect(h?.constructor).toBe(H3HexagonLayer);
  });

  it('names Genie map objects after the question', () => {
    const d = dataOf(buildLayers({ ...args, genieLayers }), 'genie-1')[0];
    expect(d.name).toBe('Which ports?');
    expect(d.label).toBe('Salalah: n 4');
    expect(dataOf(buildLayers({ ...args, genieLayers }), 'genie-2')[0].name).toBe('Where is AIS?');
  });

  it('lanes specs join the highlight set alongside scene highlights', () => {
    const primary = dataOf(buildLayers({ ...args, genieLayers, highlightLaneIds: ['L1'] }), 'lanes-primary');
    expect(primary.filter((d) => d.highlighted).map((d) => d.laneId)).toEqual(['L1', 'L3']);
  });

  it('with the lanes toggle off, draws only the Genie lanes, highlighted', () => {
    const ls = buildLayers({ ...args, genieLayers, highlightLaneIds: ['L1'], visible: { ...ALL_ON, lanes: false } });
    const primary = dataOf(ls, 'lanes-primary');
    expect(primary.map((d) => d.laneId)).toEqual(['L3']);
    expect(primary.every((d) => d.highlighted)).toBe(true);
    expect(dataOf(ls, 'lanes-alt')).toEqual([]);
  });

  it('with the lanes toggle off and no Genie lanes, draws no lanes', () => {
    const ls = buildLayers({ ...args, genieLayers: [pts], visible: { ...ALL_ON, lanes: false } });
    expect(ids(ls)).not.toContain('lanes-primary');
  });

  it('the genie toggle hides every Genie layer and its lane highlights', () => {
    const ls = buildLayers({ ...args, genieLayers, visible: { ...ALL_ON, genie: false } });
    expect(ids(ls).filter((id) => id.startsWith('genie-'))).toEqual([]);
    expect(dataOf(ls, 'lanes-primary').some((d) => d.highlighted)).toBe(false);
  });
});

describe('portMetric', () => {
  it('total sums the vessel types', () => {
    const m = portMetric(port({}), 'total');
    expect(m.value7d).toBe(14);
    expect(m.baseline).toBe(28);
    expect(m.pct).toBe(50);
    expect(m.lowBaseline).toBe(false);
  });
  it('flags a baseline under 1 call per day', () => {
    expect(portMetric(port({ baseline_portcalls_dry_bulk: 0.9 }), 'dry_bulk').lowBaseline).toBe(true);
    expect(portMetric(port({ baseline_portcalls_dry_bulk: 1 }), 'dry_bulk').lowBaseline).toBe(false);
  });
});
