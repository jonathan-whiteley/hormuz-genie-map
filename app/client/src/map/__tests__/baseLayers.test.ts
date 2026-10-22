import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../data/loadAll';
import type { ChokepointDay, Dataset, LaneDay, PortDay, Region } from '../../data/types';
import {
  DIM_OPACITY,
  RESTING,
  buildBaseLayers,
  curve,
  laneSegments,
  regionShort,
  shortName,
  visiblePorts,
  worstStatus,
  type MapDatum,
} from '../baseLayers';

const ds = (o: Partial<Dataset>): Dataset => ({ ...emptyDataset(), ...o });
const port = (o: Partial<PortDay>): PortDay =>
  ({
    date: '2026-10-01',
    port: 'Jebel Ali',
    country: 'UAE',
    lat: 25,
    lon: 55,
    portcalls_tanker_7d_avg: 1,
    portcalls_container_7d_avg: 1,
    portcalls_dry_bulk_7d_avg: 0,
    baseline_portcalls_tanker: 2,
    baseline_portcalls_container: 2,
    baseline_portcalls_dry_bulk: 0,
    ...o,
  }) as PortDay;
const choke = (o: Partial<ChokepointDay>): ChokepointDay =>
  ({
    date: '2026-10-01',
    chokepoint: 'Strait of Hormuz',
    lat: 26.3,
    lon: 56.9,
    n_total_7d_avg: 4,
    pct_of_baseline_total: 6,
    ...o,
  }) as ChokepointDay;
const lane = (o: Partial<LaneDay>): LaneDay =>
  ({
    date: '2026-10-01',
    lane_id: 'L1',
    lane: 'Crude',
    status: 'Disrupted',
    primary_lat: 26.6,
    primary_lon: 50.2,
    hormuz_lat: 26.3,
    hormuz_lon: 56.9,
    exit_lat: 24,
    exit_lon: 60,
    alt_ports: [],
    ...o,
  }) as LaneDay;
const region = (o: Partial<Region>): Region =>
  ({
    region: 'gulf_hormuz',
    role: 'target',
    label: 'Persian Gulf, Strait of Hormuz',
    lat_min: 22,
    lon_min: 47,
    lat_max: 30,
    lon_max: 60,
    area_km2: 1,
    ...o,
  }) as Region;

const ids = (layers: { id: string }[]) => layers.map((l) => l.id);

describe('shortName and regionShort', () => {
  it('shortens the long chokepoint and region names', () => {
    expect(shortName('Strait of Hormuz')).toBe('Hormuz');
    expect(shortName('Bab el-Mandeb Strait')).toBe('Bab el-Mandeb');
    expect(shortName('Suez Canal')).toBe('Suez');
    expect(shortName('Cape of Good Hope')).toBe('Cape of Good Hope');
    expect(regionShort(region({}))).toBe('Gulf');
    expect(regionShort(region({ region: 'other', label: 'Somewhere, Else' }))).toBe('Somewhere');
  });
});

describe('visiblePorts', () => {
  it('drops ports under 1 call a day of baseline and ports without coordinates', () => {
    const d = ds({
      ports: [
        port({ port: 'A' }),
        port({ port: 'B', baseline_portcalls_tanker: 0.3, baseline_portcalls_container: 0.2 }),
        port({ port: 'C', lat: null }),
        port({ port: 'D', baseline_portcalls_tanker: 0.5, baseline_portcalls_container: 0.5 }),
      ],
    });
    expect(
      visiblePorts(d, '2026-10-01')
        .map((p) => p.name)
        .sort()
    ).toEqual(['A', 'D']);
    expect(visiblePorts(d, '2026-10-01').find((p) => p.name === 'A')?.pct).toBe(50);
  });
});

describe('laneSegments', () => {
  it('draws a shared stretch once, with every lane on it and the worst status', () => {
    const segs = laneSegments([
      lane({ lane_id: 'L1', lane: 'Crude', status: 'Normal' }),
      lane({ lane_id: 'L2', lane: 'Jet fuel', status: 'Disrupted', primary_lat: 25, primary_lon: 55 }),
    ]);
    const trunk = segs.find((s) => s.laneIds.length === 2);
    expect(trunk?.from).toEqual([56.9, 26.3]);
    expect(trunk?.to).toEqual([60, 24]);
    expect(trunk?.status).toBe('Disrupted');
    expect(trunk?.names).toEqual(['Crude', 'Jet fuel']);
    expect(segs).toHaveLength(3);
  });

  it('adds alternative routes and skips missing points', () => {
    const segs = laneSegments([
      lane({ exit_lat: null, exit_lon: null, alt_ports: [{ port: 'Fujairah', lat: 25.1, lon: 56.3, pct: 90 }] }),
    ]);
    expect(segs).toHaveLength(1);
  });
});

describe('worstStatus and curve', () => {
  it('ranks Disrupted over Shifted over Degraded over Normal over No data', () => {
    expect(worstStatus(['Normal', 'Shifted to alternative', 'Degraded'])).toBe('Shifted to alternative');
    expect(worstStatus([])).toBe('No data');
  });

  it('curves between the two end points', () => {
    const c = curve([0, 0], [10, 0], 8);
    expect(c[0]).toEqual([0, 0]);
    expect(c[c.length - 1]).toEqual([10, 0]);
    expect(c).toHaveLength(9);
    expect(c[4][1]).not.toBe(0);
  });
});

describe('buildBaseLayers', () => {
  const d = ds({ chokepoints: [choke({})], ports: [port({})], lanes: [lane({})], regions: [region({})] });
  const build = (o: Partial<Parameters<typeof buildBaseLayers>[0]>) =>
    buildBaseLayers({ dataset: d, date: '2026-10-01', visible: RESTING, zoom: 4, dimmed: false, ...o });

  it('shows only labeled chokepoints at rest', () => {
    expect(ids(build({}))).toEqual(['chokepoints', 'chokepoint-labels']);
  });

  it('adds AIS cells only from zoom 5 and port labels only from zoom 6', () => {
    const all = { chokepoints: true, ports: true, lanes: true, ais: true };
    expect(ids(build({ visible: all, zoom: 4 }))).toEqual([
      'ais-regions',
      'ais-region-labels',
      'lanes',
      'ports',
      'chokepoints',
      'chokepoint-labels',
    ]);
    expect(ids(build({ visible: all, zoom: 5 }))).toContain('ais-cells');
    expect(ids(build({ visible: all, zoom: 6 }))).toContain('port-labels');
  });

  it('dims every base layer while an answer is on the map', () => {
    for (const l of build({ dimmed: true })) expect(l.props.opacity).toBe(DIM_OPACITY);
  });

  it('draws chokepoints as extruded columns with labels at the column top', async () => {
    const { ColumnLayer } = await import('@deck.gl/layers');
    const layers = build({});
    const cols = layers.find((l) => l.id === 'chokepoints');
    expect(cols).toBeInstanceOf(ColumnLayer);
    expect((cols?.props as unknown as { extruded: boolean }).extruded).toBe(true);
    const labels = layers.find((l) => l.id === 'chokepoint-labels')?.props as unknown as {
      data: unknown[];
      getPosition: (d: unknown) => number[];
    };
    const pos = labels.getPosition(labels.data[0]);
    expect(pos).toHaveLength(3);
    expect(pos[2]).toBeGreaterThan(0);
  });
});

describe('buildBaseLayers while an answer is on the map', () => {
  const hormuz = choke({});
  const suez = choke({ chokepoint: 'Suez Canal', lat: 30.6, lon: 32.3, n_total_7d_avg: 41, pct_of_baseline_total: 104 });
  const jebel = port({});
  const d = ds({ chokepoints: [hormuz, suez], ports: [jebel] });
  const all = { chokepoints: true, ports: true, lanes: false, ais: false };
  const build = (o: Partial<Parameters<typeof buildBaseLayers>[0]>) =>
    buildBaseLayers({ dataset: d, date: '2026-10-01', visible: all, zoom: 6, dimmed: true, ...o });
  const names = (layers: { id: string; props: { data: unknown } }[], id: string) =>
    (layers.find((l) => l.id === id)?.props.data as MapDatum[]).map((x) => x.name);

  it('hides the base labels but keeps the dimmed columns', () => {
    const layers = build({ hideLabels: true });
    expect(ids(layers)).toEqual(['ports', 'chokepoints']);
    for (const l of layers) expect(l.props.opacity).toBe(DIM_OPACITY);
    expect(ids(build({}))).toEqual(['ports', 'port-labels', 'chokepoints', 'chokepoint-labels']);
  });

  it('leaves out base columns and labels at places a series answer covers', () => {
    // Within 0.05 degrees counts as the same place; Suez stays.
    const layers = build({ hidePlaces: [[56.93, 26.27]] });
    expect(names(layers, 'chokepoints')).toEqual(['Suez Canal']);
    expect(names(layers, 'chokepoint-labels')).toEqual(['Suez Canal']);
    expect(names(layers, 'ports')).toEqual(['Jebel Ali']);
    expect(names(build({ hidePlaces: [[55.02, 25.01]] }), 'ports')).toEqual([]);
    expect(names(build({ hidePlaces: [[57.0, 26.3]] }), 'chokepoints')).toEqual(['Strait of Hormuz', 'Suez Canal']);
  });

  it('draws every base label on top of the columns', async () => {
    const { LABEL_ON_TOP } = await import('../columns');
    const layers = build({ visible: { ...all, ais: true } });
    const labels = layers.filter((l) => l.id.endsWith('labels'));
    expect(labels.map((l) => l.id)).toEqual(['ais-region-labels', 'port-labels', 'chokepoint-labels']);
    for (const l of labels) expect(l.props.parameters).toEqual(LABEL_ON_TOP);
  });
});

describe('buildBaseLayers zoom inputs', () => {
  const d = ds({ chokepoints: [choke({})], ports: [port({})], regions: [region({})] });
  const all = { chokepoints: true, ports: true, lanes: false, ais: true };
  type P = { elevationScale: number; data: unknown[]; getPosition: (x: unknown) => number[] };
  const props = (layers: { id: string; props: unknown }[], id: string) => layers.find((l) => l.id === id)?.props as P;

  it('scales columns and label altitude by the column zoom; thresholds use the integer zoom', async () => {
    const { elevationScaleFor, labelZ } = await import('../columns');
    const layers = buildBaseLayers({ dataset: d, date: '2026-10-01', visible: all, zoom: 5, columnZoom: 5.75, dimmed: false });
    expect(props(layers, 'chokepoints').elevationScale).toBe(elevationScaleFor(5.75));
    expect(props(layers, 'ports').elevationScale).toBe(elevationScaleFor(5.75));
    const lab = props(layers, 'chokepoint-labels');
    expect(lab.getPosition(lab.data[0])[2]).toBe(labelZ(4, 5.75));
    // Integer zoom 5: AIS cells on, port labels (zoom 6) still off, even though the column zoom is near 6.
    expect(ids(layers)).toContain('ais-cells');
    expect(ids(layers)).not.toContain('port-labels');
  });

  it('defaults the column zoom to the zoom', async () => {
    const { elevationScaleFor } = await import('../columns');
    const layers = buildBaseLayers({ dataset: d, date: '2026-10-01', visible: RESTING, zoom: 3, dimmed: false });
    expect(props(layers, 'chokepoints').elevationScale).toBe(elevationScaleFor(3));
  });
});

describe('chokepoint baseline', () => {
  /** Baseline of the first chokepoint drawn on the date (the popover shows it). */
  const baselineOn = (d: Dataset, date: string) => {
    const layers = buildBaseLayers({ dataset: d, date, visible: RESTING, zoom: 4, dimmed: false });
    const cols = layers.find((l) => l.id === 'chokepoints')!.props as unknown as { data: MapDatum[] };
    return cols.data[0].baseline;
  };

  it('carries the pre-war baseline, so a shut chokepoint keeps its pre-war reference', () => {
    const d = ds({
      chokepoints: [
        choke({ date: '2026-01-15', n_total_7d_avg: 100, pct_of_baseline_total: 100 }),
        choke({ date: '2026-02-15', n_total_7d_avg: 100, pct_of_baseline_total: 100 }),
        choke({ date: '2026-10-01', n_total_7d_avg: 0, pct_of_baseline_total: 0 }),
      ],
    });
    expect(baselineOn(d, '2026-02-15')).toBe(100);
    expect(baselineOn(d, '2026-10-01')).toBe(100);
  });

  it('falls back to value7d / pct when a chokepoint has no pre-war rows', () => {
    const d = ds({ chokepoints: [choke({ date: '2026-10-01', n_total_7d_avg: 4, pct_of_baseline_total: 25 })] });
    expect(baselineOn(d, '2026-10-01')).toBe(16);
  });
});
