import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../data/loadAll';
import type { AltPort, ChokepointDay, Dataset, LaneDay, PortDay, Region, VisibilityPoint } from '../../data/types';
import {
  QUESTIONS,
  REGIONS_FIT_PADDING,
  SCENES,
  countWord,
  eventOn,
  regionsBounds,
  resolveSceneDate,
  sceneView,
} from '../scenes';

const SPEC_QUESTIONS = [
  'Which of our lanes are disrupted today, and how much volume is at risk?',
  'Which alternative ports are running above their pre-war baseline?',
  'When did our container lane shift away from Jebel Ali?',
  'Which lanes have no alternative route?',
  'How do visible tanker transits through Hormuz compare with the pre-war baseline by month?',
  'How much of the Gulf can we see on AIS compared with normal shipping lanes?',
];

const hz = (date: string, o: Partial<ChokepointDay>): ChokepointDay =>
  ({
    date,
    chokepoint: 'Strait of Hormuz',
    n_total_7d_avg: 76.4,
    n_tanker_7d_avg: 30,
    pct_of_baseline_tanker: 40,
    ...o,
  }) as ChokepointDay;

const alt = (port: string, pct: number | null, baseline: number | null): AltPort =>
  ({ port, lat: 0, lon: 0, pct, baseline }) as AltPort;

const lane = (id: string, date: string, o: Partial<LaneDay>): LaneDay =>
  ({
    date,
    lane_id: id,
    lane: `Lane ${id}`,
    status: 'Disrupted',
    volume_unit: 'tonnes',
    volume_at_risk: 1000,
    alternative_ports: [],
    alt_ports: [],
    alternative_pct: null,
    ...o,
  }) as LaneDay;

const port = (name: string, date: string, tanker: number): PortDay =>
  ({ date, port: name, portcalls_tanker_7d_avg: tanker }) as PortDay;

const vis = (v: number | null): VisibilityPoint =>
  ({ region: 'gulf_hormuz', sample_hour: '2026-10-13T20:00:00Z', visibility_vs_control: v }) as VisibilityPoint;

const full = (): Dataset => ({
  ...emptyDataset(),
  chokepoints: [hz('2026-02-15', {}), hz('2026-03-08', {}), hz('2026-10-04', {})],
  ports: [port('Yanbu (King Fahd Port)', '2026-10-02', 3.4)],
  lanes: (['2026-02-15', '2026-03-08', '2026-10-02'] as const)
    .flatMap((d) => [
      lane('L1', d, { status: 'Normal', alternative_ports: ['Yanbu'] }),
      lane('L2', d, {
        alternative_ports: ['Fujairah', 'Khor Fakkan', 'Tiny'],
        alternative_pct: 150,
        alt_ports: [alt('Fujairah', 120, 5), alt('Khor Fakkan', 180, 3), alt('Tiny', 900, 0.4)],
      }),
      lane('L3', d, { lane: 'Crude to India', alternative_ports: [], volume_at_risk: 500 }),
      lane('L4', d, {
        alternative_ports: ['Salalah'],
        alternative_pct: 60,
        alt_ports: [alt('Salalah', 60, 4)],
      }),
      lane('L6', d, { lane: 'Fertilizer', alternative_ports: [], volume_at_risk: 250 }),
    ])
    .map((l) => (l.date < '2026-03' && l.lane_id !== 'L6' ? { ...l, status: 'Normal' as const } : l)),
  events: [
    { event_date: '2026-03-01', event: 'Strikes begin', source_url: '' },
    { event_date: '2026-04-08', event: 'Ceasefire', source_url: '' },
  ],
  visibility: [vis(0.2)],
  aisCells: [{ region: 'gulf_hormuz', day: '2026-10-13', h3_res5_str: 'x', unique_vessels: 1, positions: 1 }],
});

describe('SCENES', () => {
  it('has five scenes with ids 1 to 5', () => {
    expect(SCENES.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
  });
  it('every question is from the spec list, in the briefed order', () => {
    for (const s of SCENES) for (const q of s.questions) expect(SPEC_QUESTIONS).toContain(q);
    expect(QUESTIONS).toEqual(SPEC_QUESTIONS);
    expect(SCENES.map((s) => s.questions)).toEqual([
      [SPEC_QUESTIONS[0], SPEC_QUESTIONS[3]],
      [SPEC_QUESTIONS[4], SPEC_QUESTIONS[0]],
      [SPEC_QUESTIONS[1], SPEC_QUESTIONS[2]],
      [SPEC_QUESTIONS[3], SPEC_QUESTIONS[0]],
      [SPEC_QUESTIONS[5], SPEC_QUESTIONS[1]],
    ]);
  });
  it('matches the briefed configuration', () => {
    expect(SCENES.map((s) => s.date)).toEqual(['2026-02-15', '2026-03-08', 'latest', 'latest', 'latest-ais']);
    expect(SCENES[2].highlightLaneIds).toEqual(['L2', 'L4']);
    expect(SCENES[3].highlightLaneIds).toEqual(['L3', 'L6']);
    expect(SCENES[1].vessel).toBe('tanker');
  });

  const noDash = new RegExp('[\u2014\u2013]');
  for (const s of SCENES) {
    it(`scene ${s.id} body: no dashes, no undefined/NaN (full fixture)`, () => {
      const ds = full();
      const body = s.body(ds, resolveSceneDate(s.date, ds));
      expect(body).not.toMatch(/undefined|NaN/);
      expect(body).not.toMatch(noDash);
      expect(body.length).toBeGreaterThan(20);
    });
    it(`scene ${s.id} body: no undefined/NaN (empty dataset)`, () => {
      const ds = emptyDataset();
      const body = s.body(ds, resolveSceneDate(s.date, ds));
      expect(body).not.toMatch(/undefined|NaN/);
      expect(body).not.toMatch(noDash);
    });
  }

  it('empty dataset renders no data and the no-sample wording', () => {
    const ds = emptyDataset();
    expect(SCENES[0].body(ds, '2026-02-15')).toContain('no data');
    expect(SCENES[1].body(ds, '2026-03-08')).toContain('no data');
    expect(SCENES[4].body(ds, '2026-10-13')).toContain('No AIS samples yet; enable the hormuz_ais_sampler job');
  });

  it('scene 1 and 2 numbers', () => {
    const ds = full();
    expect(SCENES[0].body(ds, '2026-02-15')).toContain('76 visible transits a day');
    expect(SCENES[0].body(ds, '2026-02-15')).toContain('1 lane was already below normal.');
    const b2 = SCENES[1].body(ds, '2026-03-08');
    expect(b2).toBe('On Mar 8, 2026, visible Hormuz tanker transits fell to 30 a day, 40% of the pre-war baseline.');
  });

  it('scene 1 counts the lanes instead of assuming six', () => {
    const ds = full();
    const b = SCENES[0].body(ds, '2026-02-15');
    expect(b).toContain('runs five lanes through the Strait of Hormuz');
    // A new Dataset object each time: the layer index is cached per Dataset.
    const normal = { ...ds, lanes: ds.lanes.map((l) => ({ ...l, status: 'Normal' as const })) };
    expect(SCENES[0].body(normal, '2026-02-15')).toContain('All five lanes were running normally.');
    expect(countWord(6)).toBe('six');
    expect(countWord(14)).toBe('14');
  });

  it('scene 1 says no data when every lane has no data', () => {
    const ds = full();
    ds.lanes = ds.lanes.map((l) => ({ ...l, status: 'No data' as const, volume_at_risk: null }));
    expect(SCENES[0].body(ds, '2026-02-15')).toContain('Lane status: no data.');
  });

  it('scene 2 event line is the latest event on or before the date, with its source', () => {
    const ds = full();
    ds.events = [
      { event_date: '2026-03-01', event: 'Strikes begin', source_url: 'https://example.org/a' },
      { event_date: '2026-04-08', event: 'Ceasefire', source_url: '' },
    ];
    expect(SCENES[1].event?.(ds, '2026-03-08')).toEqual(ds.events[0]);
    expect(eventOn(ds, '2026-02-01')).toBeUndefined();
    expect(eventOn(ds, '2026-05-01')?.event).toBe('Ceasefire');
  });

  it('scene 3 skips low-baseline ports and names normal-baseline ones', () => {
    const b = SCENES[2].body(full(), '2026-10-02');
    expect(b).toContain('Fujairah and Khor Fakkan are running above their pre-war baseline');
    expect(b).not.toContain('Tiny');
    expect(b).toContain('Visible counts measure AIS visibility, not total traffic.');
  });

  it('scene 3 never denies a port above baseline while naming one at 100% or more', () => {
    const ds = full();
    ds.lanes = ds.lanes.map((l) =>
      l.lane_id === 'L2' ? { ...l, alternative_pct: 70, alt_ports: [alt('Fujairah', 120, 5), alt('Dibba', 80, 4)] } : l
    );
    ds.lanes = ds.lanes.map((l) => (l.lane_id === 'L4' ? { ...l, alternative_pct: 60, alt_ports: [] } : l));
    const b = SCENES[2].body(ds, '2026-10-02');
    expect(b).not.toContain('Fujairah');
    expect(b).not.toMatch(/No alternative port is above/);
    expect(b).toContain('the closest port is Dibba at 80%.');
  });

  it('scene 3 uses singular wording for one port', () => {
    const ds = full();
    ds.lanes = ds.lanes.map((l) =>
      l.lane_id === 'L2' ? { ...l, alt_ports: [alt('Fujairah', 120, 5), alt('Tiny', 900, 0.4)] } : l
    );
    expect(SCENES[2].body(ds, '2026-10-02')).toContain('Fujairah is running above its pre-war baseline');
  });

  it('scene 3 falls back without naming a port when none qualify', () => {
    const ds = full();
    ds.lanes = ds.lanes.map((l) => (l.lane_id === 'L2' ? { ...l, alt_ports: [alt('Tiny', 900, 0.4)] } : l));
    const b = SCENES[2].body(ds, '2026-10-02');
    expect(b).not.toContain('Tiny');
    expect(b).not.toMatch(/undefined|NaN/);
  });

  it('scene 3 below-baseline branch names the closest normal-baseline port', () => {
    const ds = full();
    ds.lanes = ds.lanes.map((l) =>
      l.lane_id === 'L2' ? { ...l, alternative_pct: 70, alt_ports: [alt('Fujairah', 70, 5), alt('Tiny', 99, 0.2)] } : l
    );
    const b = SCENES[2].body(ds, '2026-10-02');
    expect(b).toContain('the closest port is Fujairah at 70%.');
  });

  it('scene 4 lists no-bypass lanes and tonnes at risk', () => {
    const b = SCENES[3].body(full(), '2026-10-02');
    expect(b).toContain('Crude to India and Fertilizer have no bypass route.');
    expect(b).toContain('750 tonnes a year');
  });

  it('scene 4 names TEU when the no-bypass lanes are container lanes, and no data when unknown', () => {
    // A new Dataset object each time: the layer index is cached per Dataset.
    const base = full();
    const mixed = {
      ...base,
      lanes: base.lanes.map((l) => (l.lane_id === 'L6' ? { ...l, volume_unit: 'TEU' as const } : l)),
    };
    expect(SCENES[3].body(mixed, '2026-10-02')).toContain('put 500 tonnes and 250 TEU a year at risk');
    const teu = {
      ...mixed,
      lanes: mixed.lanes.map((l) => (l.lane_id === 'L3' ? { ...l, volume_unit: 'TEU' as const } : l)),
    };
    expect(SCENES[3].body(teu, '2026-10-02')).toContain('put 750 TEU a year at risk');
    const unknown = {
      ...teu,
      lanes: teu.lanes.map((l) => (l.alternative_ports.length === 0 ? { ...l, volume_at_risk: null } : l)),
    };
    const b = SCENES[3].body(unknown, '2026-10-02');
    expect(b).toContain('Their volume at risk: no data.');
    expect(b).not.toMatch(/ 0 /);
  });

  it('scene 5 uses the gulf visibility and yanbu calls', () => {
    const b = SCENES[4].body(full(), '2026-10-13');
    expect(b).toContain('In the latest five-minute AIS sample, the Gulf was 20% as visible');
    expect(b).toContain('3.4 visible tanker calls a day');
  });

  it('scene 5 before AIS sampling takes the alternate wording', () => {
    const b = SCENES[4].body(full(), '2026-06-01');
    expect(b).toContain('No AIS sample exists on or before Jun 1, 2026.');
    expect(b).not.toContain('no data as visible');
  });

  it('scene 5 on an earlier sample day names that sample, not the latest', () => {
    const ds = full();
    ds.visibility = [
      { ...vis(0.1), sample_hour: '2026-10-09T05:00:00Z' },
      vis(0.2),
    ];
    const b = SCENES[4].body(ds, '2026-10-10');
    expect(b).toContain('In the AIS sample on or before Oct 10, 2026, the Gulf was 10% as visible');
  });
});

describe('resolveSceneDate', () => {
  it('passes fixed dates through', () => {
    expect(resolveSceneDate('2026-02-15', full())).toBe('2026-02-15');
  });
  it('latest is the latest lane date', () => {
    expect(resolveSceneDate('latest', full())).toBe('2026-10-02');
  });
  it('latest-ais is the latest AIS sample day', () => {
    expect(resolveSceneDate('latest-ais', full())).toBe('2026-10-13');
  });
  it('latest-ais falls back to latest with no samples', () => {
    const ds = full();
    ds.visibility = [];
    ds.aisCells = [];
    expect(resolveSceneDate('latest-ais', ds)).toBe('2026-10-02');
  });
  it('latest-ais uses the same latest AIS day as the scrubber end (cells or samples)', () => {
    const ds = full();
    ds.aisCells = [{ ...ds.aisCells[0], day: '2026-10-14' }];
    expect(resolveSceneDate('latest-ais', ds)).toBe('2026-10-14');
  });
});

describe('scene 5 camera', () => {
  const box = (region: string, lon_min: number, lat_min: number, lon_max: number, lat_max: number): Region =>
    ({ region, role: 'target', label: region, lon_min, lat_min, lon_max, lat_max, area_km2: 1 }) as Region;
  const regions = [box('north_sea', -5, 49, 9, 58), box('gulf', 48, 23, 57, 30), box('malacca', 95, -1, 105, 7)];

  it('regionsBounds is the union of every box', () => {
    expect(regionsBounds(regions)).toEqual([
      [-5, -1],
      [105, 58],
    ]);
    expect(regionsBounds([])).toBeNull();
  });

  it('fits all sampling regions with padding for the legend, and collapses the legend', () => {
    const ds = { ...emptyDataset(), regions };
    const v = sceneView(SCENES[4], ds);
    expect(v.bounds).toEqual([
      [-5, -1],
      [105, 58],
    ]);
    expect(v.boundsPadding).toEqual(REGIONS_FIT_PADDING);
    expect(SCENES[4].legendCollapsed).toBe(true);
  });

  it('falls back to the fixed view before the regions load; other scenes keep their view', () => {
    expect(sceneView(SCENES[4], emptyDataset())).toBe(SCENES[4].view);
    expect(sceneView(SCENES[0], { ...emptyDataset(), regions })).toBe(SCENES[0].view);
  });
});
