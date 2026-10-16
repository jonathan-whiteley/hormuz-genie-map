import type { LaneRec, RecTier } from '../data/types';

export interface RecPoint {
  date: string;
  p: number;
  tier: string;
}

/** Highest action probability of a recommendation (0 when none parse). */
export function topProb(rec: LaneRec): number {
  let best = 0;
  for (const v of Object.values(rec.action_probabilities ?? {})) {
    if (typeof v === 'number' && !Number.isNaN(v) && v > best) best = v;
  }
  return best;
}

/** Weekly P(top action) series for one lane, sorted by date. */
export function recSeries(recs: LaneRec[], laneId: string): RecPoint[] {
  return recs
    .filter((r) => r.lane_id === laneId)
    .map((r) => ({ date: r.date, p: topProb(r), tier: r.tier }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const TIER_COLORS: Record<RecTier, string> = {
  Recommended: '#0B2026',
  Review: '#F5A623',
  Analyst: '#8A9094',
  'Novel situation': '#1B8A8F',
};

export const tierColor = (tier: string): string => TIER_COLORS[tier as RecTier] ?? '#8A9094';

/** Plain-text form of the recommendation chip (used in lane tooltips). */
export const recText = (rec: LaneRec): string => `${rec.tier}: ${rec.action} (p ${topProb(rec).toFixed(2)})`;

export const REC_TITLE = 'Calibrated by ai_decide; untuned demo thresholds';
