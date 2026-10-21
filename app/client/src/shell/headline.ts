import { disruptedCount, fmtPct, hormuzOn, lanesOn } from '../data/kpi';
import type { Dataset } from '../data/types';

const LATEST = '9999-12-31';

/** The two top-bar numbers, always from the latest data (not the slider date). */
export function headline(ds: Dataset): { hormuzPct: number | null; disrupted: number | null; lanes: number } {
  const lanes = lanesOn(ds.lanes, LATEST);
  return { hormuzPct: hormuzOn(ds.chokepoints, LATEST, 'total').pctBaseline, disrupted: disruptedCount(lanes), lanes: lanes.length };
}

export function headlineText(h: ReturnType<typeof headline>): string {
  const hz = h.hormuzPct === null ? 'Hormuz: no data' : `Hormuz at ${fmtPct(h.hormuzPct)} of normal`;
  return h.disrupted === null || h.lanes === 0 ? hz : `${hz} · ${h.disrupted} of ${h.lanes} lanes disrupted`;
}
