/** AIS navigational status codes (ITU-R M.1371); 15 and anything unlisted read as not defined. */
const NAV_STATUS: Record<number, string> = {
  0: 'Under way (engine)',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted manoeuvrability',
  4: 'Constrained by draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Fishing',
  8: 'Under way (sailing)',
};

export const navStatusLabel = (code: number | null): string =>
  code == null ? 'no data' : (NAV_STATUS[code] ?? 'Not defined');

/** A report time as "Oct 22, 14:05 UTC"; the raw value when it does not parse. */
export function fmtHeard(ts: string): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return ts;
  const d = new Date(t);
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return `${day}, ${time} UTC`;
}
