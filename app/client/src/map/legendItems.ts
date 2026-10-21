import type { Toggles } from './baseLayers';

export type LegendItem = 'ramp' | 'lanes' | 'ais' | 'answer';

/** Legend rows for the layers that are on; the percent ramp covers chokepoints and ports. */
export function legendItems(t: Toggles, answerOn: boolean): LegendItem[] {
  const out: LegendItem[] = [];
  if (t.chokepoints || t.ports) out.push('ramp');
  if (t.lanes) out.push('lanes');
  if (t.ais) out.push('ais');
  if (answerOn) out.push('answer');
  return out;
}
