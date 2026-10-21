import type { Dataset } from '../data/types';

/** A port or chokepoint with coordinates, used to place Genie answers that only name places. */
export interface Place {
  name: string;
  kind: 'port' | 'chokepoint';
  lat: number;
  lon: number;
}

export type Gazetteer = Map<string, Place>;

/** Lowercase; drop parentheses, "strait of", "strait", "canal" and "port of"; keep letters and digits. */
export function normPlace(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(strait of|strait|canal|port of)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const ok = (v: number | null): v is number => v != null && !Number.isNaN(v);

/** Chokepoints first, then ports; the first row with coordinates wins for each normalized name. */
export function buildGazetteer(ds: Pick<Dataset, 'ports' | 'chokepoints'>): Gazetteer {
  const g: Gazetteer = new Map();
  const add = (name: string, kind: Place['kind'], lat: number | null, lon: number | null) => {
    if (!ok(lat) || !ok(lon)) return;
    const key = normPlace(name);
    if (key && !g.has(key)) g.set(key, { name, kind, lat, lon });
  };
  for (const c of ds.chokepoints) add(c.chokepoint, 'chokepoint', c.lat, c.lon);
  for (const p of ds.ports) add(p.port, 'port', p.lat, p.lon);
  return g;
}

const cache = new WeakMap<Dataset, Gazetteer>();

/** buildGazetteer, built once per Dataset object (the port table has about 23k rows). */
export function gazetteerOf(ds: Dataset): Gazetteer {
  const hit = cache.get(ds);
  if (hit) return hit;
  const g = buildGazetteer(ds);
  cache.set(ds, g);
  return g;
}

export function lookupPlace(g: Gazetteer, v: unknown): Place | null {
  if (typeof v !== 'string') return null;
  const key = normPlace(v);
  return key ? (g.get(key) ?? null) : null;
}
