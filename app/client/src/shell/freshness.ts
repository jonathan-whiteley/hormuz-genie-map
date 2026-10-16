const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown';
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export function isStale(portwatch: string | null, ais: string | null, now: number): boolean {
  const pw = portwatch ? Date.parse(portwatch) : NaN;
  const a = ais ? Date.parse(ais) : NaN;
  return (!Number.isNaN(pw) && now - pw > 7 * DAY_MS) || (!Number.isNaN(a) && now - a > 3 * HOUR_MS);
}
