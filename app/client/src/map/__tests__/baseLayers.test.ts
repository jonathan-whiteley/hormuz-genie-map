import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../data/loadAll';
import type { ChokepointDay, Dataset, LaneDay, PortDay, Region } from '../../data/types';
import {
  DIM_OPACITY,
  RESTING,
  buildBaseLayers,
  chokepointRadius,
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
});

describe('chokepoint sizing', () => {
  type Accessor<T> = (d: MapDatum) => T;
  /** Radius and label x offset of the first chokepoint drawn on the date. */
  const sizeOn = (d: Dataset, date: string) => {
    const layers = buildBaseLayers({ dataset: d, date, visible: RESTING, zoom: 4, dimmed: false });
    const circles = layers.find((l) => l.id === 'chokepoints')!.props as unknown as {
      data: MapDatum[];
      getRadius: Accessor<number>;
    };
    const labels = layers.find((l) => l.id === 'chokepoint-labels')!.props as unknown as {
      data: MapDatum[];
      getPixelOffset: Accessor<[number, number]>;
    };
    return { radius: circles.getRadius(circles.data[0]), offset: labels.getPixelOffset(labels.data[0])[0] };
  };

  it('sizes by the pre-war baseline, so a shut chokepoint keeps its pre-war size', () => {
    const d = ds({
      chokepoints: [
        choke({ date: '2026-01-15', n_total_7d_avg: 100, pct_of_baseline_total: 100 }),
        choke({ date: '2026-02-15', n_total_7d_avg: 100, pct_of_baseline_total: 100 }),
        choke({ date: '2026-10-01', n_total_7d_avg: 0, pct_of_baseline_total: 0 }),
      ],
    });
    const before = sizeOn(d, '2026-02-15');
    const after = sizeOn(d, '2026-10-01');
    expect(before.radius).toBe(chokepointRadius(100));
    expect(after.radius).toBe(before.radius);
    expect(after.offset).toBe(after.radius + 6);
  });

  it('falls back to value7d / pct when a chokepoint has no pre-war rows', () => {
    const d = ds({ chokepoints: [choke({ date: '2026-10-01', n_total_7d_avg: 4, pct_of_baseline_total: 25 })] });
    const s = sizeOn(d, '2026-10-01');
    expect(s.radius).toBe(chokepointRadius(16));
    expect(s.offset).toBe(s.radius + 6);
  });

  it('uses 8 px plus 1.5 times the square root of the baseline, 8 px when missing', () => {
    expect(chokepointRadius(16)).toBe(14);
    expect(chokepointRadius(null)).toBe(8);
    expect(chokepointRadius(undefined)).toBe(8);
  });
});
