import {
  disruptedCount,
  fmtNum,
  fmtPct,
  gulfVisibility,
  hormuzOn,
  latestOnOrBefore,
  riskPhrase,
  volumeAtRisk,
} from '../data/kpi';
import { LOW_BASELINE, indexOf, lanesOnIdx } from '../data/dataIndex';
import type { AltPort, ConflictEvent, Dataset, LaneDay, Region } from '../data/types';
import { fmtDate, latestAisDay, latestVisibilityDay, SCRUB_START } from '../explore/dates';
import { fill, pick } from './fill';

/** Spec section 5.4, in order. Scenes reference these by index. */
export const QUESTIONS = [
  'Which of our lanes are disrupted today, and how much volume is at risk?',
  'Which alternative ports are running above their pre-war baseline?',
  'When did our container lane shift away from Jebel Ali?',
  'Which lanes have no alternative route?',
  'How do visible tanker transits through Hormuz compare with the pre-war baseline by month?',
  'How much of the Gulf can we see on AIS compared with normal shipping lanes?',
];

export type SceneDate = 'latest' | 'latest-ais' | `${number}-${number}-${number}`;

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

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];
/** "six" for 6; digits past twelve. */
export const countWord = (n: number): string => WORDS[n] ?? String(n);

const joinAnd = (items: string[]): string =>
  items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;

export const laneFilter = (ds: Dataset, date: string, ids: string[]): LaneDay[] =>
  lanesOnIdx(ds, date).filter((l) => ids.includes(l.lane_id));

export function body1(ds: Dataset, date: string): string {
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

export function body2(ds: Dataset, date: string): string {
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

export function body3(ds: Dataset, date: string): string {
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

export function body4(ds: Dataset, date: string): string {
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

export function body5(ds: Dataset, date: string): string {
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

/**
 * The first n sentences. A sentence ends at ., ! or ? followed by a space and a capital letter, so
 * "Supply Co. (a fictional example)" and "2.6" do not split.
 */
export function firstSentences(text: string, n: number): string {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return parts.slice(0, n).join(' ');
}
