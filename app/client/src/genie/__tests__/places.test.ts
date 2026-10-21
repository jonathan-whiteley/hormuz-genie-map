import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../data/loadAll';
import type { ChokepointDay, Dataset, PortDay } from '../../data/types';
import type { GenieAnswer } from '../genieClient';
import { PLACE_LAT, PLACE_LON, ROW_INDEX, detect } from '../genieLayer';
import { buildGazetteer, gazetteerOf, lookupPlace, normPlace } from '../places';

const port = (port: string, lat: number | null, lon: number | null): PortDay =>
  ({ date: '2026-10-01', port, country: 'X', lat, lon }) as PortDay;
const choke = (chokepoint: string, lat: number | null, lon: number | null): ChokepointDay =>
  ({ date: '2026-10-01', chokepoint, lat, lon }) as ChokepointDay;
const ds = (o: Partial<Dataset>): Dataset => ({ ...emptyDataset(), ...o });
const answer = (columns: string[], rows: Record<string, unknown>[]): GenieAnswer => ({
  columns,
  rows,
  totalRows: rows.length,
});

const G = buildGazetteer(
  ds({
    chokepoints: [choke('Strait of Hormuz', 26.3, 56.9), choke('Bab el-Mandeb Strait', 12.8, 43.3)],
    ports: [port('Salalah', 16.9, 54.0), port('Khor Fakkan', 25.4, 56.4), port('Nowhere', null, 50), port('Salalah', 1, 1)],
  })
);

describe('normPlace', () => {
  it('drops strait, canal, port of and parentheses, and folds case and punctuation', () => {
    expect(normPlace('Strait of Hormuz')).toBe('hormuz');
    expect(normPlace('Bab el-Mandeb Strait')).toBe('bab el mandeb');
    expect(normPlace('Suez Canal')).toBe('suez');
    expect(normPlace('Yanbu (King Fahd Port)')).toBe('yanbu');
    expect(normPlace('  KHOR   fakkan ')).toBe('khor fakkan');
  });
});

describe('buildGazetteer', () => {
  it('keeps the first coordinates per name and skips rows without coordinates', () => {
    expect(G.get('salalah')).toEqual({ name: 'Salalah', kind: 'port', lat: 16.9, lon: 54.0 });
    expect(G.get('hormuz')?.kind).toBe('chokepoint');
    expect(G.has('nowhere')).toBe(false);
  });

  it('is memoized per dataset object', () => {
    const d = ds({ ports: [port('Salalah', 16.9, 54.0)] });
    expect(gazetteerOf(d)).toBe(gazetteerOf(d));
  });
});

describe('lookupPlace', () => {
  it('matches Genie spellings and ignores non-strings and unknown names', () => {
    expect(lookupPlace(G, 'Hormuz')?.name).toBe('Strait of Hormuz');
    expect(lookupPlace(G, 'Bab el Mandeb')?.name).toBe('Bab el-Mandeb Strait');
    expect(lookupPlace(G, 'Atlantis')).toBeNull();
    expect(lookupPlace(G, 42)).toBeNull();
    expect(lookupPlace(G, '')).toBeNull();
  });
});

describe('detect with places', () => {
  it('maps a name column when there are no coordinates, keeping only matched rows and their index', () => {
    const spec = detect(
      answer(['port', 'pct'], [
        { port: 'Atlantis', pct: '50' },
        { port: 'Salalah', pct: '135.0' },
        { port: 'Khor Fakkan', pct: '1160.0' },
      ]),
      G
    );
    expect(spec?.kind).toBe('points');
    if (spec?.kind !== 'points') return;
    expect(spec.nameField).toBe('port');
    expect(spec.latField).toBe(PLACE_LAT);
    expect(spec.lonField).toBe(PLACE_LON);
    expect(spec.rows.map((r) => [r.port, r[PLACE_LAT], r[ROW_INDEX]])).toEqual([
      ['Salalah', 16.9, 1],
      ['Khor Fakkan', 25.4, 2],
    ]);
  });

  it('prefers lat/lon over names and sets nameField to the first text column', () => {
    const spec = detect(
      answer(['port', 'lane_id', 'pct', 'lat', 'lon'], [{ port: 'Salalah', lane_id: 'L4', pct: '135', lat: '16.9', lon: '54.0' }]),
      G
    );
    expect(spec?.kind).toBe('points');
    if (spec?.kind !== 'points') return;
    expect(spec.latField).toBe('lat');
    expect(spec.nameField).toBe('port');
  });

  it('prefers places over lane ids, and falls back to lanes when no name matches', () => {
    const rows = [{ lane_id: 'L4', primary_port: 'Salalah', status: 'Shifted' }];
    expect(detect(answer(['lane_id', 'primary_port', 'status'], rows), G)?.kind).toBe('points');
    expect(detect(answer(['lane_id', 'status'], [{ lane_id: 'L4', status: 'Disrupted' }]), G)).toEqual({
      kind: 'lanes',
      laneIds: ['L4'],
    });
  });

  it('picks the column with the most place matches, so a country that names one port loses to port', () => {
    const g = buildGazetteer(ds({ ports: [port('Kuwait', 29.3, 47.9), port('Salalah', 16.9, 54.0), port('Khor Fakkan', 25.4, 56.4)] }));
    const spec = detect(
      answer(['country', 'port', 'pct'], [
        { country: 'Kuwait', port: 'Kuwait', pct: '80' },
        { country: 'Oman', port: 'Salalah', pct: '135' },
        { country: 'UAE', port: 'Khor Fakkan', pct: '1160' },
      ]),
      g
    );
    expect(spec?.kind).toBe('points');
    if (spec?.kind !== 'points') return;
    expect(spec.nameField).toBe('port');
    expect(spec.rows.map((r) => [r.port, r[ROW_INDEX]])).toEqual([
      ['Kuwait', 0],
      ['Salalah', 1],
      ['Khor Fakkan', 2],
    ]);
  });

  it('ignores names when no gazetteer is given', () => {
    expect(detect(answer(['port'], [{ port: 'Salalah' }]))).toBeNull();
  });
});
