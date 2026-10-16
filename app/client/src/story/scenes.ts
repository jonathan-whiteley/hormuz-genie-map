import { disruptedCount, fmtNum, fmtPct, gulfVisibility, hormuzOn, latestOnOrBefore, riskPhrase, volumeAtRisk } from '../data/kpi';
import type { AltPort, ConflictEvent, Dataset, LaneDay, Region } from '../data/types';
import { fmtDate, latestAisDay, latestVisibilityDay, SCRUB_START } from '../explore/dates';
import { indexOf, lanesOnIdx, LOW_BASELINE, type LayerToggles, type Vessel } from '../map/layers';
import type { ViewState } from '../map/MapView';
import { fill, pick } from './copy';

/** Spec section 5.4, in order. Scenes reference these by index. */
export const QUESTIONS = [
  'Which of our lanes are disrupted today, and how much volume is at risk?',
  'Which alternative ports are running above their pre-war baseline?',
  'When did our container lane shift away from Jebel Ali?',
  'Which lanes have no alternative route?',
  'How do visible tanker transits through Hormuz compare with the pre-war baseline by month?',
  'How much of the Gulf can we see on AIS compared with normal shipping lanes?',
];
const q = (...n: number[]) => n.map((i) => QUESTIONS[i - 1]);

export type SceneDate = 'latest' | 'latest-ais' | `${number}-${number}-${number}`;

export interface Scene {
  id: 1 | 2 | 3 | 4 | 5;
  title: string;
  date: SceneDate;
  view: ViewState;
  vessel: Vessel;
  toggles: LayerToggles;
  highlightLaneIds?: string[];
  /** 'regions': fit the camera to every AIS sampling region box (falls back to `view` before they load). */
  fit?: 'regions';
  /** Start with the map legend collapsed so it does not cover the scene. */
  legendCollapsed?: boolean;
  body: (ds: Dataset, date: string) => string;
  /** An event line shown under the body, linked to its source_url. */
  event?: (ds: Dataset, date: string) => ConflictEvent | undefined;
  questions: string[];
}

const maxOf = (dates: string[]): string | null =>
  dates.reduce<string | null>((m, d) => (m == null || d > m ? d : m), null);

const latestLaneDate = (ds: Dataset): string =>
  maxOf(ds.lanes.map((l) => l.date)) ??
  maxOf(ds.ports.map((p) => p.date)) ??
  maxOf(ds.chokepoints.map((c) => c.date)) ??
  SCRUB_START;

/** 'latest' is the latest lane (PortWatch) date; 'latest-ais' is the day of the latest AIS sample. */
export function resolveSceneDate(date: SceneDate, ds: Dataset): string {
  if (date === 'latest') return latestLaneDate(ds);
  if (date === 'latest-ais') return latestAisDay(ds) ?? latestLaneDate(ds);
  return date;
}

const isNum = (v: number | null | undefined): v is number => v != null && !Number.isNaN(v);

/** Union of the region boxes as [[west, south], [east, north]], or null when there are none. */
export function regionsBounds(regions: Region[]): [[number, number], [number, number]] | null {
  const ok = regions.filter((r) => [r.lon_min, r.lat_min, r.lon_max, r.lat_max].every(isNum));
  if (ok.length === 0) return null;
  return [
    [Math.min(...ok.map((r) => r.lon_min)), Math.min(...ok.map((r) => r.lat_min))],
    [Math.max(...ok.map((r) => r.lon_max)), Math.max(...ok.map((r) => r.lat_max))],
  ];
}

/**
 * Padding for the scene 5 fit beyond the map padding: the open map edge, plus room at the bottom
 * for the collapsed legend chip (Malacca sits in the bottom-right corner of the region union).
 */
export const REGIONS_FIT_PADDING = { top: 16, bottom: 80, left: 24, right: 24 };

/** The camera for a scene: its fixed view, or a fit over the AIS regions when the scene asks for it. */
export function sceneView(scene: Scene, ds: Dataset): ViewState {
  if (scene.fit === 'regions') {
    const bounds = regionsBounds(ds.regions);
    if (bounds) return { ...scene.view, bounds, boundsPadding: REGIONS_FIT_PADDING };
  }
  return scene.view;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** "six" for 6; digits past twelve. */
export const countWord = (n: number): string => WORDS[n] ?? String(n);

const joinAnd = (items: string[]): string =>
  items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;

export const laneFilter = (ds: Dataset, date: string, ids: string[]): LaneDay[] =>
  lanesOnIdx(ds, date).filter((l) => ids.includes(l.lane_id));

function body1(ds: Dataset, date: string): string {
  const lanes = lanesOnIdx(ds, date);
  const n = disruptedCount(lanes);
  const total = new Set(ds.lanes.map((l) => l.lane_id)).size;
  const laneSummary =
    n == null
      ? 'Lane status: no data.'
      : pick(
          n === 0,
          `All ${countWord(lanes.length)} lanes were running normally.`,
          `${n} ${n === 1 ? 'lane was' : 'lanes were'} already below normal.`
        );
  return fill(
    'Northwind Supply Co. (a fictional example) runs {laneCount} through the Strait of Hormuz. Before the war, the strait carried {total7d} visible transits a day. {laneSummary}',
    {
      laneCount: total > 0 ? `${countWord(total)} ${total === 1 ? 'lane' : 'lanes'}` : 'its supply lanes',
      total7d: fmtNum(hormuzOn(ds.chokepoints, date, 'total').transits7d),
      laneSummary,
    }
  );
}

/** The latest conflict event on or before the date. */
export function eventOn(ds: Dataset, date: string): ConflictEvent | undefined {
  return latestOnOrBefore(
    ds.events.map((e) => ({ e, date: String(e.event_date).slice(0, 10) })),
    date
  )?.e;
}

function body2(ds: Dataset, date: string): string {
  const hz = hormuzOn(ds.chokepoints, date, 'tanker');
  return fill('On {date}, visible Hormuz tanker transits fell to {tanker7d} a day, {pct} of the pre-war baseline.', {
    date: fmtDate(date),
    tanker7d: fmtNum(hz.transits7d),
    pct: fmtPct(hz.pctBaseline),
  });
}

/** Alternative ports of the given lanes whose baseline is normal (at least 1 call a day) and pct is known. */
function reliableAltPorts(lanes: LaneDay[]): AltPort[] {
  const seen = new Map<string, AltPort>();
  for (const l of lanes) {
    for (const p of l.alt_ports) {
      if (!isNum(p.pct)) continue;
      if (p.baseline == null || Number.isNaN(p.baseline) || p.baseline < LOW_BASELINE) continue;
      const cur = seen.get(p.port);
      if (!cur || p.pct > (cur.pct ?? -Infinity)) seen.set(p.port, p);
    }
  }
  return [...seen.values()];
}

function body3(ds: Dataset, date: string): string {
  const lanes = laneFilter(ds, date, ['L2', 'L4']);
  const note = 'Visible counts measure AIS visibility, not total traffic.';
  if (lanes.length === 0) return `Alternative port data: no data. ${note}`;
  const above = lanes.some((l) => isNum(l.alternative_pct) && l.alternative_pct >= 100);
  const ports = reliableAltPorts(lanes);
  let lead: string;
  if (above) {
    const named = ports.filter((p) => (p.pct as number) >= 100).map((p) => p.port);
    const one = named.length === 1;
    lead = fill(
      '{ports} running above {their} pre-war baseline, picking up traffic that can no longer move through Jebel Ali and Ruways.',
      {
        ports: named.length > 0 ? `${joinAnd(named)} ${one ? 'is' : 'are'}` : 'Alternative ports are',
        their: one ? 'its' : 'their',
      }
    );
  } else {
    // Lane level says not above baseline, so only name ports that are themselves under 100%.
    const best = ports
      .filter((p) => (p.pct as number) < 100)
      .reduce<AltPort | null>((b, p) => (b == null || (p.pct as number) > (b.pct as number) ? p : b), null);
    lead = best
      ? fill(
          'Alternative traffic on these lanes is still below its pre-war baseline; the closest port is {bestPort} at {bestPct}.',
          {
            bestPort: best.port,
            bestPct: fmtPct(best.pct),
          }
        )
      : 'Alternative traffic on these lanes is still below its pre-war baseline.';
  }
  return `${lead} ${note}`;
}

function body4(ds: Dataset, date: string): string {
  const lanes = lanesOnIdx(ds, date);
  if (lanes.length === 0) return 'Lanes with no bypass route: no data.';
  const none = lanes.filter((l) => l.alternative_ports.length === 0);
  if (none.length === 0) return 'Every lane has at least one bypass route.';
  const phrase = riskPhrase(volumeAtRisk(none));
  const one = none.length === 1;
  return fill(
    phrase
      ? '{noBypassList} {have} no bypass route. Together they put {risk} a year at risk under our assumptions.'
      : '{noBypassList} {have} no bypass route. {their} volume at risk: no data.',
    {
      noBypassList: joinAnd(none.map((l) => l.lane)),
      have: one ? 'has' : 'have',
      risk: phrase,
      their: one ? 'Its' : 'Their',
    }
  );
}

function yanbuTanker7d(ds: Dataset, date: string): number | null {
  for (const [name, rows] of indexOf(ds).ports) {
    if (!name.startsWith('Yanbu')) continue;
    const r = latestOnOrBefore(rows, date);
    return r?.portcalls_tanker_7d_avg ?? null;
  }
  return null;
}

function body5(ds: Dataset, date: string): string {
  const vis = gulfVisibility(ds.visibility, date);
  const latestDay = latestVisibilityDay(ds);
  let first: string;
  if (ds.visibility.length === 0) {
    first = 'No AIS samples yet; enable the hormuz_ais_sampler job to measure visibility.';
  } else if (vis == null) {
    first = `No AIS sample exists on or before ${fmtDate(date)}.`;
  } else {
    first = fill('In {which}, the Gulf was {gulfPct} as visible as a typical busy shipping lane.', {
      which:
        latestDay != null && date >= latestDay
          ? 'the latest five-minute AIS sample'
          : `the AIS sample on or before ${fmtDate(date)}`,
      // visibility_vs_control is a fraction of the control density (0.2 = 20%).
      gulfPct: fmtPct(100 * vis),
    });
  }
  const rest = fill(
    'Yanbu (King Fahd Port) shows {yanbu7d} visible tanker calls a day while Saudi Arabia reports the East-West pipeline running near capacity. Signals that disappear are a risk in themselves.',
    { yanbu7d: fmtNum(yanbuTanker7d(ds, date), 1) }
  );
  return `${first} ${rest}`;
}

const T = (o: Partial<LayerToggles>): LayerToggles => ({
  chokepoints: false,
  ports: false,
  lanes: false,
  aisCells: false,
  regions: false,
  // Genie answers stay visible across scenes; the reader asked for them.
  genie: true,
  ...o,
});

/**
 * Scene centers are given under the Story map padding (384 px left for the card), which draws the
 * center 192 px right of the map middle. Each view is the original center moved east by 192 px at
 * its zoom, so the subject stays clear of the card and the legend.
 */
export const SCENES: Scene[] = [
  {
    id: 1,
    title: 'Your exposure',
    date: '2026-02-15',
    view: { longitude: 58.7, latitude: 25.5, zoom: 5.0 },
    vessel: 'total',
    toggles: T({ chokepoints: true, ports: true, lanes: true }),
    body: body1,
    questions: q(1, 4),
  },
  {
    id: 2,
    title: 'The strait closes',
    date: '2026-03-08',
    view: { longitude: 57.8, latitude: 26.3, zoom: 6.6 },
    vessel: 'tanker',
    toggles: T({ chokepoints: true, ports: true, lanes: true }),
    body: body2,
    event: eventOn,
    questions: q(5, 1),
  },
  {
    id: 3,
    title: 'Where traffic went',
    date: 'latest',
    view: { longitude: 57.9, latitude: 22.0, zoom: 4.0 },
    vessel: 'total',
    toggles: T({ ports: true, lanes: true }),
    highlightLaneIds: ['L2', 'L4'],
    body: body3,
    questions: q(2, 3),
  },
  {
    id: 4,
    title: 'Lanes with no way around',
    date: 'latest',
    view: { longitude: 54.2, latitude: 26.5, zoom: 5.6 },
    vessel: 'total',
    toggles: T({ ports: true, lanes: true }),
    highlightLaneIds: ['L3', 'L6'],
    body: body4,
    questions: q(4, 1),
  },
  {
    id: 5,
    title: 'What you cannot see',
    date: 'latest-ais',
    // Fallback camera until ref_ais_regions loads; then the camera fits all five sampling regions.
    view: { longitude: 50.0, latitude: 30.0, zoom: 2.2 },
    fit: 'regions',
    legendCollapsed: true,
    vessel: 'total',
    toggles: T({ aisCells: true, regions: true, ports: true }),
    body: body5,
    questions: q(6, 2),
  },
];
