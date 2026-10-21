# Genie-First Map Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Story/Explore UI of the hormuz-map app with one calm map plus a chat-style Genie sidebar, where Genie answers land on the map, layers toggle on their own, and a tour is optional.

**Architecture:**
- **Pure first:** pure TypeScript modules (place matching, answer features, chat thread reducer, base and answer deck.gl layers, tour state) are built and unit-tested first, alongside the old UI, which keeps compiling.
- **UI second:** React components (chat panel, map chrome, tour bar) are then built on those modules.
- **Swap last:** a final swap task replaces `App.tsx` and deletes the old Story/Explore code.
- **Unchanged:** data loading (`DataContext`, `loadAll`), the Genie SSE client, the AppKit server and the bundle stay as they are.

**Tech Stack:** AppKit 0.76.1 (React 19, TypeScript 5.9), MapLibre GL 6.13 + deck.gl 9.4, vitest 4 (node environment), Databricks Asset Bundle.

**Spec:** `docs/superpowers/specs/2026-10-21-elegant-map-design.md` (read it with this plan). Visual reference: the approved mockup (resting, Genie answer and tour states) described in the spec sections 3 to 6.

## Global Constraints

- Never use em dashes or en dashes in any copy, comment, doc or commit message. Use colons, semicolons, commas or parentheses.
- Brand: Lava 600 `#FF3621`, Navy 900 `#0B2026`, Light `#F9F7F4`, DM Sans, the real logo at `app/client/src/assets/databricks-logo.svg`. CSS variables live in `app/client/src/theme/tokens.css` (`--lava-600`, `--navy-900`, `--light`, `--gray-100`, `--gray-300`, `--gray-500`, `--gray-700`, `--white`).
- One sequential ramp for percent of normal: `pctColor` in `app/client/src/map/colors.ts` (Lava at 0%, Navy at 100% or more). Lava with a white halo is reserved for Genie answers.
- No new npm dependencies. `app/package-lock.json` must keep every `resolved` URL under `https://registry.npmjs.org/`.
- Never commit real workspace hosts, warehouse ids or Genie space ids. They live in the git-ignored `app/.env`.
- Tests run in vitest's node environment (no DOM). React components are verified by `npm run typecheck`, `npm run build` and the live screenshots in Task 11, not by unit tests.
- Every commit message ends with the line `Co-authored-by: Isaac <no-reply@databricks.com>`.
- Commands run from `app/` unless a step says otherwise: `npm test`, `npm run typecheck`, `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.
- Target display: laptop or projector at 1440 by 900 or wider. No mobile layout.
- Bundle commands always pass the four vars: `--var="catalog=<catalog>" --var="schedule_pause_status=UNPAUSED" --var="warehouse_id=<warehouse-id>" --var="genie_space_id=<genie-space-id>"`. Deploy only after `databricks bundle plan` shows 0 to delete.

## Review Focus

1. **A Genie reply that arrives after New chat.** It must be dropped; it must not reappear in the fresh thread or move the map. Test: Task 3 "ignores a reply for a message that no longer exists".
2. **An answer whose lat/lon cells are null or non-numeric strings.** No map chip, no camera move, no marks at (0, 0). Test: Task 2 "skips rows without usable coordinates and returns null bounds".
3. **A one-place answer.** The camera must not zoom to street level on a single point; bounds get a margin. Test: Task 2 "pads a single-point bounds".
4. **Genie not configured (`genieEnabled: false`).** Starters, follow-ups, Enter and "Ask Genie this" must not send. Test: Task 3 `canSend` cases.
5. **Starting the tour before the data has loaded, or with no AIS regions.** Step cameras fall back to a fixed center instead of throwing, and exiting restores the pre-tour state exactly. Test: Task 7 "falls back to the center view without regions" and "exit restores the snapshot".

---

## File map

Created:
- `app/client/src/genie/places.ts`: place-name gazetteer (ports and chokepoints) and matching.
- `app/client/src/genie/answerFeatures.ts`: a detected Genie answer as drawable features, bounds and the map-chip text.
- `app/client/src/chat/thread.ts`: chat thread reducer and selectors.
- `app/client/src/chat/chatStore.ts`: `ChatApi` context type and `useChat`.
- `app/client/src/chat/ChatProvider.tsx`: runs questions through the Genie client, holds the thread, active answer, draft and row focus.
- `app/client/src/chat/markdown.ts`: tiny Markdown parser for Genie text (paragraphs, bullets, bold).
- `app/client/src/chat/Markdown.tsx`, `ChatPanel.tsx`, `GenieReply.tsx`, `AnswerTable.tsx`, `starters.ts`: the chat UI.
- `app/client/src/data/dataIndex.ts`: per-dataset indexes moved out of `map/layers.ts`.
- `app/client/src/map/baseLayers.ts`: the four base layers with the new styling.
- `app/client/src/map/answerLayer.ts`: the Genie answer layers.
- `app/client/src/map/legendItems.ts`, `MapLegend.tsx`, `AnswerPill.tsx`, `PlacePopover.tsx`, `MapScreen.tsx`, `useMapState.ts`: map chrome and state.
- `app/client/src/shell/LayersCard.tsx`, `DateSlider.tsx`, `HowItWorks.tsx`, `headline.ts`: shell pieces.
- `app/client/src/tour/fill.ts` (moved from `story/copy.ts`), `tour/copy.ts`, `tour/steps.ts`, `tour/tourState.ts`, `tour/TourBar.tsx`.

Modified:
- `app/client/src/genie/genieLayer.ts`: name fallback in `detect`, `nameField`, removal of the multi-layer entry model (Task 10).
- `app/client/src/genie/genieClient.ts`: optional `onStatus` callback.
- `app/client/src/map/MapView.tsx`: new datum type, `onZoom`, `onPickAt`, `onHoverDatum`, `maxZoom`.
- `app/client/src/map/layers.ts`: re-exports from `dataIndex.ts` (Task 5), deleted in Task 10.
- `app/client/src/shell/TopBar.tsx`, `app/client/src/App.tsx`: new shell.
- `app/client/src/data/kpi.ts`: drop `recOn` and `riskSources` (Task 10).
- `genie/space_config.py`, `tests/test_genie_config.py`: place-name instruction.
- `README.md`, `docs/img/*`: new screenshots and app section.

Deleted (Task 10): `story/`, `explore/ExplorePage.tsx`, `explore/LeftRail.tsx`, `explore/TimeScrubber.tsx`, `decisions/`, `genie/GeniePanel.tsx`, `genie/AnswerCard.tsx`, `genie/GenieProvider.tsx`, `genie/genieStore.ts`, `genie/useGenieMap.ts`, `map/layers.ts`, `map/Legend.tsx`, and their tests.

---

### Task 1: Place gazetteer and name fallback in `detect`

**Files:**
- Create: `app/client/src/genie/places.ts`
- Modify: `app/client/src/genie/genieLayer.ts` (the `GenieLayerSpec` type and `detect`)
- Test: `app/client/src/genie/__tests__/places.test.ts`

**Interfaces:**
- Consumes: `Dataset`, `ChokepointDay`, `PortDay` from `data/types.ts`; `GenieAnswer` from `genie/genieClient.ts`.
- Produces:
  - `interface Place { name: string; kind: 'port' | 'chokepoint'; lat: number; lon: number }`
  - `type Gazetteer = Map<string, Place>`
  - `normPlace(s: string): string`
  - `buildGazetteer(ds: Pick<Dataset, 'ports' | 'chokepoints'>): Gazetteer`
  - `gazetteerOf(ds: Dataset): Gazetteer` (memoized per dataset object)
  - `lookupPlace(g: Gazetteer, v: unknown): Place | null`
  - In `genieLayer.ts`: `PLACE_LAT = '__place_lat'`, `PLACE_LON = '__place_lon'`, `ROW_INDEX = '__row'`, `nameColumn(columns: string[], rows: Row[], skip: string[]): string | undefined`. The points spec gains `nameField?: string`. `detect(answer: GenieAnswer, places?: Gazetteer): GenieLayerSpec | null` checks H3, then lat/lon, then place names, then `lane_id`.

- [ ] **Step 1: Write the failing tests**

Create `app/client/src/genie/__tests__/places.test.ts`:

```ts
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

  it('ignores names when no gazetteer is given', () => {
    expect(detect(answer(['port'], [{ port: 'Salalah' }]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client/src/genie/__tests__/places.test.ts`
Expected: FAIL, `Cannot find module '../places'` (and missing exports from `../genieLayer`).

- [ ] **Step 3: Create `places.ts`**

Create `app/client/src/genie/places.ts`:

```ts
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
```

- [ ] **Step 4: Extend `detect` in `genieLayer.ts`**

In `app/client/src/genie/genieLayer.ts`:

1. Add the import at the top: `import { lookupPlace, type Gazetteer } from './places';`
2. Replace the points member of `GenieLayerSpec` with:

```ts
  | { kind: 'points'; latField: string; lonField: string; valueField?: string; nameField?: string; rows: Row[] }
```

3. Below `valueField`, add:

```ts
/** Synthetic fields added to rows placed by name, and the original row index for table linking. */
export const PLACE_LAT = '__place_lat';
export const PLACE_LON = '__place_lon';
export const ROW_INDEX = '__row';

/** First column, outside `skip`, whose non-null values are all non-numeric strings (a name, say). */
export function nameColumn(columns: string[], rows: Row[], skip: string[]): string | undefined {
  return columns.find((c) => {
    if (skip.includes(c)) return false;
    const vals = rows.map((r) => r[c]).filter((v) => !missing(v));
    return vals.length > 0 && vals.every((v) => typeof v === 'string' && toNum(v) === null);
  });
}
```

4. Replace the whole `detect` function with:

```ts
/**
 * Chooses how a Genie answer is drawn on the map, or null for table only. First match wins:
 * H3 cells, then lat/lon, then place names (needs `places`), then lane ids. Places come before
 * lanes because port answers often carry a lane_id column too.
 */
export function detect(answer: GenieAnswer, places?: Gazetteer): GenieLayerSpec | null {
  const { columns, rows } = answer;
  const find = (pred: (lc: string) => boolean) => columns.find((c) => pred(c.toLowerCase()));

  // An h3-named column counts only when at least one row holds a valid cell index; otherwise the
  // lat/lon and lane rules still get their turn instead of an empty "On map" layer.
  const hexField = columns.find((c) => {
    const lc = c.toLowerCase();
    return (lc === 'h3' || lc.endsWith('_h3') || lc.startsWith('h3_res')) && rows.some((r) => toH3Hex(r[c]) !== null);
  });
  if (hexField) {
    const vf = valueField(columns, rows, [hexField]);
    const out = rows.slice(0, MAX_LAYER_ROWS).map((r) => ({ ...r, [hexField]: toH3Hex(r[hexField]) }));
    return { kind: 'h3', hexField, valueField: vf, rows: out };
  }

  const pairs: [string, string][] = [
    ['lat', 'lon'],
    ['latitude', 'longitude'],
  ];
  for (const [la, lo] of pairs) {
    const latField = find((c) => c === la);
    const lonField = find((c) => c === lo);
    if (latField && lonField) {
      const vf = valueField(columns, rows, [latField, lonField]);
      const nf = nameColumn(columns, rows, [latField, lonField]);
      return { kind: 'points', latField, lonField, valueField: vf, nameField: nf, rows: rows.slice(0, MAX_LAYER_ROWS) };
    }
  }

  if (places && places.size > 0) {
    for (const col of columns) {
      const matched: Row[] = [];
      rows.forEach((r, i) => {
        const p = lookupPlace(places, r[col]);
        if (p) matched.push({ ...r, [PLACE_LAT]: p.lat, [PLACE_LON]: p.lon, [ROW_INDEX]: i });
      });
      if (matched.length > 0) {
        const vf = valueField(columns, rows, [col]);
        return {
          kind: 'points',
          latField: PLACE_LAT,
          lonField: PLACE_LON,
          valueField: vf,
          nameField: col,
          rows: matched.slice(0, MAX_LAYER_ROWS),
        };
      }
    }
  }

  const laneField = find((c) => c === 'lane_id');
  if (laneField) {
    const ids = rows
      .map((r) => r[laneField])
      .filter((v) => !missing(v))
      .map(String);
    return { kind: 'lanes', laneIds: [...new Set(ids)] };
  }
  return null;
}
```

- [ ] **Step 5: Run the new and existing Genie tests**

Run: `npx vitest run client/src/genie`
Expected: PASS. If an existing `genieLayer.test.ts` case compares a points spec with `toEqual` and now fails only because of the new `nameField` key, update that expectation to include `nameField` (the value `nameColumn` returns for that fixture), and change nothing else.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: exit 0.

```bash
git add client/src/genie/places.ts client/src/genie/genieLayer.ts client/src/genie/__tests__/places.test.ts client/src/genie/__tests__/genieLayer.test.ts
git commit -m "feat: Genie answers that name ports or chokepoints map by name

Co-authored-by: Isaac <no-reply@databricks.com>"
```

---

### Task 2: Answer features, bounds and the map chip

**Files:**
- Create: `app/client/src/genie/answerFeatures.ts`
- Test: `app/client/src/genie/__tests__/answerFeatures.test.ts`

**Interfaces:**
- Consumes: `GenieLayerSpec`, `toNum`, `nameColumn`, `ROW_INDEX` from `genie/genieLayer.ts` (Task 1); `LaneDay` from `data/types.ts`.
- Produces:
  - `type LngLat = [number, number]`
  - `interface AnswerFeature { key: string; rowIndex: number | null; name: string; value: string | null; position?: LngLat; hexagon?: string; path?: LngLat[] }`
  - `LABEL_LIMIT = 12`
  - `answerFeatures(spec: GenieLayerSpec, lanes: LaneDay[]): AnswerFeature[]`
  - `featureBounds(features: AnswerFeature[]): [[number, number], [number, number]] | null`
  - `mapChipText(spec: GenieLayerSpec, features: AnswerFeature[]): string | null`

- [ ] **Step 1: Write the failing tests**

Create `app/client/src/genie/__tests__/answerFeatures.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { LaneDay } from '../../data/types';
import { answerFeatures, featureBounds, mapChipText } from '../answerFeatures';
import { PLACE_LAT, PLACE_LON, ROW_INDEX, type GenieLayerSpec } from '../genieLayer';

const lane = (o: Partial<LaneDay>): LaneDay =>
  ({
    lane_id: 'L1',
    lane: 'Crude feedstock',
    status: 'Disrupted',
    primary_lat: 26.6,
    primary_lon: 50.2,
    hormuz_lat: 26.3,
    hormuz_lon: 56.9,
    exit_lat: 24,
    exit_lon: 60,
    ...o,
  }) as LaneDay;

const points: GenieLayerSpec = {
  kind: 'points',
  latField: PLACE_LAT,
  lonField: PLACE_LON,
  valueField: 'calls_7d',
  nameField: 'port',
  rows: [
    { port: 'Salalah', calls_7d: '3.14', pct: '135.0', [PLACE_LAT]: 16.9, [PLACE_LON]: 54.0, [ROW_INDEX]: 0 },
    { port: 'Khor Fakkan', calls_7d: '1.0', pct: '1160.0', [PLACE_LAT]: 25.4, [PLACE_LON]: 56.4, [ROW_INDEX]: 2 },
  ],
};

describe('answerFeatures', () => {
  it('names points by nameField and labels them with the percent column when there is one', () => {
    const f = answerFeatures(points, []);
    expect(f.map((x) => [x.name, x.value, x.rowIndex, x.position])).toEqual([
      ['Salalah', '135%', 0, [54.0, 16.9]],
      ['Khor Fakkan', '1,160%', 2, [56.4, 25.4]],
    ]);
  });

  it('falls back to valueField, then to the row position, for labels and row indexes', () => {
    const spec: GenieLayerSpec = {
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      valueField: 'n',
      rows: [{ lat: '1', lon: '2', n: '12.346' }],
    };
    expect(answerFeatures(spec, [])[0]).toMatchObject({ name: 'Place 1', value: '12.35', rowIndex: 0 });
  });

  it('skips rows without usable coordinates and returns null bounds', () => {
    const spec: GenieLayerSpec = {
      kind: 'points',
      latField: 'lat',
      lonField: 'lon',
      rows: [
        { lat: null, lon: '2' },
        { lat: 'n/a', lon: '2' },
      ],
    };
    const f = answerFeatures(spec, []);
    expect(f).toEqual([]);
    expect(featureBounds(f)).toBeNull();
    expect(mapChipText(spec, f)).toBeNull();
  });

  it('draws lanes from the lane geometry and skips unknown lane ids', () => {
    const spec: GenieLayerSpec = { kind: 'lanes', laneIds: ['L1', 'L9'] };
    const f = answerFeatures(spec, [lane({})]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ key: 'lane:L1', name: 'L1 Crude feedstock', value: 'Disrupted', rowIndex: null });
    expect(f[0].path).toEqual([
      [50.2, 26.6],
      [56.9, 26.3],
      [60, 24],
    ]);
  });

  it('keeps h3 cells and uses lat/lon columns on the row for bounds', () => {
    const spec: GenieLayerSpec = {
      kind: 'h3',
      hexField: 'h3_res5',
      valueField: 'vessels',
      rows: [{ h3_res5: '85283473fffffff', vessels: '4', lat: '25', lon: '55' }],
    };
    const f = answerFeatures(spec, []);
    expect(f[0]).toMatchObject({ hexagon: '85283473fffffff', position: [55, 25], value: '4' });
  });
});

describe('featureBounds', () => {
  it('spans every position and path point', () => {
    expect(featureBounds(answerFeatures(points, []))).toEqual([
      [54.0, 16.9],
      [56.4, 25.4],
    ]);
  });

  it('pads a single-point bounds', () => {
    const one = answerFeatures({ ...points, rows: [points.rows[0]] } as GenieLayerSpec, []);
    expect(featureBounds(one)).toEqual([
      [52.5, 15.4],
      [55.5, 18.4],
    ]);
  });
});

describe('mapChipText', () => {
  it('counts features with a noun from the spec', () => {
    expect(mapChipText(points, answerFeatures(points, []))).toBe('On the map: 2 ports');
    const one = answerFeatures({ ...points, rows: [points.rows[0]] } as GenieLayerSpec, []);
    expect(mapChipText(points, one)).toBe('On the map: 1 port');
    const chokeSpec = { ...points, nameField: 'chokepoint' } as GenieLayerSpec;
    expect(mapChipText(chokeSpec, one)).toBe('On the map: 1 chokepoint');
    const lanes: GenieLayerSpec = { kind: 'lanes', laneIds: ['L1'] };
    expect(mapChipText(lanes, answerFeatures(lanes, [lane({})]))).toBe('On the map: 1 lane');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client/src/genie/__tests__/answerFeatures.test.ts`
Expected: FAIL, `Cannot find module '../answerFeatures'`.

- [ ] **Step 3: Implement `answerFeatures.ts`**

Create `app/client/src/genie/answerFeatures.ts`:

```ts
import type { LaneDay } from '../data/types';
import { ROW_INDEX, nameColumn, toNum, type GenieLayerSpec } from './genieLayer';

export type LngLat = [number, number];

/** One drawable piece of a Genie answer: a point, an H3 cell or a lane, linked to its table row. */
export interface AnswerFeature {
  key: string;
  /** Row in the answer table (null for lanes, which come from lane ids, not rows). */
  rowIndex: number | null;
  name: string;
  /** Formatted label value (percent when the answer has one), or null. */
  value: string | null;
  position?: LngLat;
  hexagon?: string;
  path?: LngLat[];
}

/** More features than this draw without labels (labels then show on hover). */
export const LABEL_LIMIT = 12;

type Row = Record<string, unknown>;
const PCT = /pct|percent/i;

/** The label column: the first numeric percent-named column, else the spec's value field. */
function labelField(rows: Row[], fallback: string | undefined): string | undefined {
  const first = rows[0];
  if (!first) return fallback;
  const pct = Object.keys(first).find(
    (k) => !k.startsWith('__') && PCT.test(k) && rows.some((r) => toNum(r[k]) !== null)
  );
  return pct ?? fallback;
}

function fmtValue(field: string | undefined, v: unknown): string | null {
  if (!field) return null;
  const n = toNum(v);
  if (n === null) return null;
  if (PCT.test(field)) return `${Math.round(n).toLocaleString('en-US')}%`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const rowIndexOf = (r: Row, i: number): number => (typeof r[ROW_INDEX] === 'number' ? (r[ROW_INDEX] as number) : i);

/** lat/lon from columns named lat and lon on the row, if both are numeric. */
function rowLatLon(r: Row): LngLat | undefined {
  const keys = Object.keys(r);
  const la = keys.find((k) => k.toLowerCase() === 'lat' || k.toLowerCase() === 'latitude');
  const lo = keys.find((k) => k.toLowerCase() === 'lon' || k.toLowerCase() === 'longitude');
  const lat = la ? toNum(r[la]) : null;
  const lon = lo ? toNum(r[lo]) : null;
  return lat !== null && lon !== null ? [lon, lat] : undefined;
}

export function answerFeatures(spec: GenieLayerSpec, lanes: LaneDay[]): AnswerFeature[] {
  if (spec.kind === 'lanes') {
    const byId = new Map(lanes.map((l) => [l.lane_id, l]));
    return spec.laneIds.flatMap((id): AnswerFeature[] => {
      const l = byId.get(id);
      if (!l) return [];
      const pts = [
        [l.primary_lon, l.primary_lat],
        [l.hormuz_lon, l.hormuz_lat],
        [l.exit_lon, l.exit_lat],
      ].filter((p): p is LngLat => p[0] != null && p[1] != null && !Number.isNaN(p[0]) && !Number.isNaN(p[1]));
      if (pts.length < 2) return [];
      return [{ key: `lane:${id}`, rowIndex: null, name: `${id} ${l.lane}`, value: l.status, position: pts[0], path: pts }];
    });
  }

  const field = labelField(spec.rows, spec.valueField);
  if (spec.kind === 'h3') {
    const cols = spec.rows[0] ? Object.keys(spec.rows[0]) : [];
    const nf = nameColumn(cols, spec.rows, [spec.hexField]);
    return spec.rows.flatMap((r, i): AnswerFeature[] => {
      const hex = r[spec.hexField];
      if (typeof hex !== 'string') return [];
      return [
        {
          key: `hex:${hex}`,
          rowIndex: rowIndexOf(r, i),
          name: nf ? String(r[nf]) : 'Cell',
          value: fmtValue(field, field ? r[field] : undefined),
          hexagon: hex,
          position: rowLatLon(r),
        },
      ];
    });
  }

  return spec.rows.flatMap((r, i): AnswerFeature[] => {
    const lat = toNum(r[spec.latField]);
    const lon = toNum(r[spec.lonField]);
    if (lat === null || lon === null) return [];
    const idx = rowIndexOf(r, i);
    return [
      {
        key: `row:${idx}`,
        rowIndex: idx,
        name: spec.nameField ? String(r[spec.nameField]) : `Place ${idx + 1}`,
        value: fmtValue(field, field ? r[field] : undefined),
        position: [lon, lat],
      },
    ];
  });
}

/** Degrees added on each side when every feature is at one point, so the camera does not zoom in to the street. */
const SINGLE_POINT_MARGIN = 1.5;

export function featureBounds(features: AnswerFeature[]): [[number, number], [number, number]] | null {
  const pts = features.flatMap((f) => [...(f.path ?? []), ...(f.position ? [f.position] : [])]);
  if (pts.length === 0) return null;
  let w = Math.min(...pts.map((p) => p[0]));
  let e = Math.max(...pts.map((p) => p[0]));
  let s = Math.min(...pts.map((p) => p[1]));
  let n = Math.max(...pts.map((p) => p[1]));
  if (w === e && s === n) {
    w -= SINGLE_POINT_MARGIN;
    e += SINGLE_POINT_MARGIN;
    s -= SINGLE_POINT_MARGIN;
    n += SINGLE_POINT_MARGIN;
  }
  const r = (x: number) => Math.round(x * 1e6) / 1e6;
  return [
    [r(w), r(s)],
    [r(e), r(n)],
  ];
}

function noun(spec: GenieLayerSpec): [string, string] {
  if (spec.kind === 'lanes') return ['lane', 'lanes'];
  if (spec.kind === 'h3') return ['cell', 'cells'];
  const nf = (spec.nameField ?? '').toLowerCase();
  if (nf.includes('chokepoint')) return ['chokepoint', 'chokepoints'];
  if (nf.includes('port')) return ['port', 'ports'];
  return ['place', 'places'];
}

/** "On the map: 2 ports", or null when nothing in the answer can be drawn. */
export function mapChipText(spec: GenieLayerSpec, features: AnswerFeature[]): string | null {
  const n = features.length;
  if (n === 0) return null;
  const [one, many] = noun(spec);
  return `On the map: ${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run client/src/genie/__tests__/answerFeatures.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/genie/answerFeatures.ts client/src/genie/__tests__/answerFeatures.test.ts
git commit -m "feat: Genie answer features, bounds and map chip text

Co-authored-by: Isaac <no-reply@databricks.com>"
```

---

### Task 3: Chat thread reducer

**Files:**
- Create: `app/client/src/chat/thread.ts`
- Test: `app/client/src/chat/__tests__/thread.test.ts`

**Interfaces:**
- Consumes: `GenieAnswer` (`genie/genieClient.ts`), `GenieLayerSpec` (`genie/genieLayer.ts`).
- Produces:
  - `interface UserMsg { id: string; role: 'user'; text: string }`
  - `interface GenieMsg { id: string; role: 'genie'; question: string; status: 'pending' | 'done' | 'error'; statusText?: string; answer?: GenieAnswer; spec: GenieLayerSpec | null; error?: string }`
  - `type Msg = UserMsg | GenieMsg`
  - `interface ThreadState { messages: Msg[]; seq: number; conversationId?: string; activeId: string | null }`
  - `EMPTY_THREAD: ThreadState`
  - `type ThreadAction` (send, status, reply, fail, retry, show, clear, reset)
  - `threadReducer(s: ThreadState, a: ThreadAction): ThreadState`
  - selectors `pendingOf(s): GenieMsg | undefined`, `activeOf(s): GenieMsg | undefined`, `followUps(s): { id: string; items: string[] } | null`
  - `statusLabel(raw: string | undefined): string`
  - `canSend(genieOff: boolean, pending: boolean, text: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `app/client/src/chat/__tests__/thread.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { GenieAnswer } from '../../genie/genieClient';
import type { GenieLayerSpec } from '../../genie/genieLayer';
import {
  EMPTY_THREAD,
  activeOf,
  canSend,
  followUps,
  pendingOf,
  statusLabel,
  threadReducer as r,
  type GenieMsg,
  type ThreadState,
} from '../thread';

const ok = (o: Partial<GenieAnswer> = {}): GenieAnswer => ({
  columns: [],
  rows: [],
  totalRows: 0,
  conversationId: 'c1',
  text: 'Two ports.',
  ...o,
});
const spec: GenieLayerSpec = { kind: 'lanes', laneIds: ['L1'] };
const genie = (s: ThreadState, id: string) => s.messages.find((m) => m.id === id) as GenieMsg;

describe('threadReducer', () => {
  it('send adds a user bubble and a pending reply, and ignores empty text', () => {
    const s = r(EMPTY_THREAD, { type: 'send', question: '  Which ports?  ' });
    expect(s.messages.map((m) => [m.id, m.role])).toEqual([
      ['u-1', 'user'],
      ['g-1', 'genie'],
    ]);
    expect(genie(s, 'g-1')).toMatchObject({ question: 'Which ports?', status: 'pending', spec: null });
    expect(r(EMPTY_THREAD, { type: 'send', question: '   ' })).toBe(EMPTY_THREAD);
  });

  it('send is a no-op while a reply is pending', () => {
    const s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    expect(r(s, { type: 'send', question: 'b' })).toBe(s);
  });

  it('reply completes the message, keeps the conversation and shows a mappable answer', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'status', id: 'g-1', text: 'EXECUTING_QUERY' });
    expect(genie(s, 'g-1').statusText).toBe('EXECUTING_QUERY');
    s = r(s, { type: 'reply', id: 'g-1', answer: ok(), spec });
    expect(genie(s, 'g-1')).toMatchObject({ status: 'done', spec });
    expect(s.conversationId).toBe('c1');
    expect(s.activeId).toBe('g-1');
    expect(pendingOf(s)).toBeUndefined();
    expect(activeOf(s)?.id).toBe('g-1');
  });

  it('a reply with nothing mappable leaves the current answer on the map', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'reply', id: 'g-1', answer: ok(), spec });
    s = r(s, { type: 'send', question: 'b' });
    s = r(s, { type: 'reply', id: 'g-2', answer: ok(), spec: null });
    expect(s.activeId).toBe('g-1');
  });

  it('a reply carrying an error becomes an error message; retry re-sends without a new user bubble', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'reply', id: 'g-1', answer: ok({ error: 'boom' }), spec: null });
    expect(genie(s, 'g-1')).toMatchObject({ status: 'error', error: 'boom' });
    s = r(s, { type: 'retry', id: 'g-1' });
    expect(s.messages).toHaveLength(2);
    expect(genie(s, 'g-1')).toMatchObject({ status: 'pending', error: undefined });
    expect(pendingOf(s)?.id).toBe('g-1');
  });

  it('fail marks the message as an error', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'fail', id: 'g-1', error: 'Connection error' });
    expect(genie(s, 'g-1')).toMatchObject({ status: 'error', error: 'Connection error' });
  });

  it('show puts an older mappable reply back on the map; clear removes it', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'reply', id: 'g-1', answer: ok(), spec });
    s = r(s, { type: 'send', question: 'b' });
    s = r(s, { type: 'reply', id: 'g-2', answer: ok(), spec });
    s = r(s, { type: 'show', id: 'g-1' });
    expect(s.activeId).toBe('g-1');
    s = r(s, { type: 'clear' });
    expect(s.activeId).toBeNull();
    expect(r(s, { type: 'show', id: 'u-1' }).activeId).toBeNull();
  });

  it('ignores a reply for a message that no longer exists (New chat while pending)', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'reset' });
    expect(s).toEqual(EMPTY_THREAD);
    const after = r(s, { type: 'reply', id: 'g-1', answer: ok(), spec });
    expect(after).toBe(s);
    expect(r(s, { type: 'status', id: 'g-1', text: 'x' })).toBe(s);
  });
});

describe('followUps', () => {
  it('returns suggestions of the latest finished reply only', () => {
    let s = r(EMPTY_THREAD, { type: 'send', question: 'a' });
    s = r(s, { type: 'reply', id: 'g-1', answer: ok({ suggested: ['x'] }), spec });
    expect(followUps(s)).toEqual({ id: 'g-1', items: ['x'] });
    s = r(s, { type: 'send', question: 'b' });
    expect(followUps(s)).toBeNull();
    s = r(s, { type: 'reply', id: 'g-2', answer: ok(), spec: null });
    expect(followUps(s)).toEqual({ id: 'g-2', items: [] });
  });
});

describe('statusLabel', () => {
  it('maps Genie status codes to short phrases', () => {
    expect(statusLabel('ASKING_AI')).toBe('Writing SQL');
    expect(statusLabel('EXECUTING_QUERY')).toBe('Running the query');
    expect(statusLabel('FETCHING_METADATA')).toBe('Reading the tables');
    expect(statusLabel(undefined)).toBe('Thinking');
    expect(statusLabel('SOMETHING_NEW')).toBe('Thinking');
  });
});

describe('canSend', () => {
  it('needs Genie on, nothing pending and non-blank text', () => {
    expect(canSend(false, false, 'Which ports?')).toBe(true);
    expect(canSend(true, false, 'Which ports?')).toBe(false);
    expect(canSend(false, true, 'Which ports?')).toBe(false);
    expect(canSend(false, false, '   ')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client/src/chat/__tests__/thread.test.ts`
Expected: FAIL, `Cannot find module '../thread'`.

- [ ] **Step 3: Implement `thread.ts`**

Create `app/client/src/chat/thread.ts`:

```ts
import type { GenieAnswer } from '../genie/genieClient';
import type { GenieLayerSpec } from '../genie/genieLayer';

export interface UserMsg {
  id: string;
  role: 'user';
  text: string;
}

export interface GenieMsg {
  id: string;
  role: 'genie';
  question: string;
  status: 'pending' | 'done' | 'error';
  /** Raw Genie status code while pending (see statusLabel). */
  statusText?: string;
  answer?: GenieAnswer;
  spec: GenieLayerSpec | null;
  error?: string;
}

export type Msg = UserMsg | GenieMsg;

export interface ThreadState {
  messages: Msg[];
  seq: number;
  conversationId?: string;
  /** The reply whose answer is on the map, or null. */
  activeId: string | null;
}

export const EMPTY_THREAD: ThreadState = { messages: [], seq: 0, activeId: null };

export type ThreadAction =
  | { type: 'send'; question: string }
  | { type: 'status'; id: string; text: string }
  | { type: 'reply'; id: string; answer: GenieAnswer; spec: GenieLayerSpec | null }
  | { type: 'fail'; id: string; error: string }
  | { type: 'retry'; id: string }
  | { type: 'show'; id: string }
  | { type: 'clear' }
  | { type: 'reset' };

const isGenie = (m: Msg | undefined): m is GenieMsg => m?.role === 'genie';

export const pendingOf = (s: ThreadState): GenieMsg | undefined =>
  s.messages.find((m): m is GenieMsg => isGenie(m) && m.status === 'pending');

export const activeOf = (s: ThreadState): GenieMsg | undefined =>
  s.activeId ? s.messages.find((m): m is GenieMsg => isGenie(m) && m.id === s.activeId) : undefined;

/** Patches one Genie message; returns the same state when the id is unknown (a reply after New chat). */
function patch(s: ThreadState, id: string, fn: (m: GenieMsg) => GenieMsg | null): ThreadState {
  const i = s.messages.findIndex((m) => m.id === id);
  const m = s.messages[i];
  if (!isGenie(m)) return s;
  const next = fn(m);
  if (!next) return s;
  const messages = [...s.messages];
  messages[i] = next;
  return { ...s, messages };
}

export function threadReducer(s: ThreadState, a: ThreadAction): ThreadState {
  switch (a.type) {
    case 'send': {
      const q = a.question.trim();
      if (!q || pendingOf(s)) return s;
      const seq = s.seq + 1;
      return {
        ...s,
        seq,
        messages: [
          ...s.messages,
          { id: `u-${seq}`, role: 'user', text: q },
          { id: `g-${seq}`, role: 'genie', question: q, status: 'pending', spec: null },
        ],
      };
    }
    case 'status':
      return patch(s, a.id, (m) => (m.status === 'pending' ? { ...m, statusText: a.text } : null));
    case 'reply': {
      const next = patch(s, a.id, (m) =>
        m.status !== 'pending'
          ? null
          : a.answer.error
            ? { ...m, status: 'error', error: a.answer.error, answer: a.answer, spec: null }
            : { ...m, status: 'done', answer: a.answer, spec: a.spec, statusText: undefined }
      );
      if (next === s) return s;
      const mapped = !a.answer.error && a.spec !== null;
      return {
        ...next,
        conversationId: a.answer.conversationId ?? s.conversationId,
        activeId: mapped ? a.id : s.activeId,
      };
    }
    case 'fail':
      return patch(s, a.id, (m) => (m.status === 'pending' ? { ...m, status: 'error', error: a.error } : null));
    case 'retry':
      if (pendingOf(s)) return s;
      return patch(s, a.id, (m) =>
        m.status === 'error' ? { ...m, status: 'pending', error: undefined, statusText: undefined } : null
      );
    case 'show': {
      const m = s.messages.find((x) => x.id === a.id);
      return isGenie(m) && m.status === 'done' && m.spec ? { ...s, activeId: a.id } : s;
    }
    case 'clear':
      return s.activeId === null ? s : { ...s, activeId: null };
    case 'reset':
      return EMPTY_THREAD;
    default:
      return s;
  }
}

/** Follow-up suggestions of the latest Genie reply, only once it has finished; null while it is pending. */
export function followUps(s: ThreadState): { id: string; items: string[] } | null {
  const last = [...s.messages].reverse().find(isGenie);
  if (!last || last.status === 'pending') return null;
  return { id: last.id, items: last.status === 'done' ? (last.answer?.suggested ?? []) : [] };
}

const STATUS: Record<string, string> = {
  FETCHING_METADATA: 'Reading the tables',
  FILTERING_CONTEXT: 'Reading the tables',
  ASKING_AI: 'Writing SQL',
  PENDING_WAREHOUSE: 'Starting the warehouse',
  EXECUTING_QUERY: 'Running the query',
};

export const statusLabel = (raw: string | undefined): string => (raw && STATUS[raw]) || 'Thinking';

export const canSend = (genieOff: boolean, pending: boolean, text: string): boolean =>
  !genieOff && !pending && text.trim().length > 0;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run client/src/chat/__tests__/thread.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/chat/thread.ts client/src/chat/__tests__/thread.test.ts
git commit -m "feat: chat thread reducer for the Genie sidebar

Co-authored-by: Isaac <no-reply@databricks.com>"
```

---

### Task 4: Genie status callback and the chat provider

**Files:**
- Modify: `app/client/src/genie/genieClient.ts` (`attempt` and `ask`)
- Create: `app/client/src/chat/chatStore.ts`, `app/client/src/chat/ChatProvider.tsx`
- Modify: `app/client/src/map/layers.ts` is NOT touched here; `lanesOnIdx` is imported from `../map/layers` in this task and switched to `../data/dataIndex` in Task 5.
- Test: `app/client/src/genie/__tests__/genieClient.test.ts` (add one case)

**Interfaces:**
- Consumes: `threadReducer`, `EMPTY_THREAD`, `pendingOf`, `activeOf`, `canSend` (Task 3); `detect`, `GenieLayerSpec` (Task 1); `gazetteerOf` (Task 1); `answerFeatures`, `mapChipText`, `AnswerFeature` (Task 2); `useData` (`data/DataContext.tsx`); `genieStatus`, `useAppConfig` (`lib/appConfig.ts`).
- Produces:
  - `ask(question: string, conversationId?: string, opts?: { onStatus?: (status: string) => void }): Promise<GenieAnswer>`
  - `interface ActiveAnswer { id: string; question: string; spec: GenieLayerSpec; features: AnswerFeature[]; chip: string | null }`
  - `interface ChatApi { thread: ThreadState; pending: boolean; genieOff: boolean; lanes: LaneDay[]; active: ActiveAnswer | null; send(q: string): void; retry(id: string): void; show(id: string): void; clear(): void; newChat(): void; draft: { text: string; key: number } | undefined; setDraft(text: string): void; hoverRow: number | null; setHoverRow(i: number | null): void; focusRow: { row: number; key: number } | null; setFocusRow(row: number): void }`
  - `ChatContext`, `useChat(): ChatApi`, `<ChatProvider>`

- [ ] **Step 1: Write the failing test**

Append to `app/client/src/genie/__tests__/genieClient.test.ts`, inside the file after the existing `describe` blocks (reuse its `connectSSE`, `emit`, `START`, `RESULT`, `QUERY` helpers):

```ts
describe('ask onStatus', () => {
  beforeEach(() => connectSSE.mockReset());

  it('reports each status event to the caller', async () => {
    connectSSE.mockImplementation(async (o) => {
      emit(o, START, { type: 'status', status: 'ASKING_AI' }, { type: 'status', status: 'EXECUTING_QUERY' }, RESULT, QUERY);
    });
    const seen: string[] = [];
    const a = await ask('Which ports?', undefined, { onStatus: (s) => seen.push(s) });
    expect(seen).toEqual(['ASKING_AI', 'EXECUTING_QUERY']);
    expect(a.error).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run client/src/genie/__tests__/genieClient.test.ts`
Expected: FAIL on `ask onStatus` (`seen` is `[]`).

- [ ] **Step 3: Add `onStatus` to the client**

In `app/client/src/genie/genieClient.ts`, replace `attempt` and `ask` with:

```ts
export interface AskOptions {
  /** Called with each Genie status code (for example 'ASKING_AI', 'EXECUTING_QUERY') while the answer streams. */
  onStatus?: (status: string) => void;
}

async function attempt(question: string, conversationId: string | undefined, opts: AskOptions): Promise<GenieAnswer> {
  const { answer, onEvent } = reducer();
  let connectionError: string | undefined;
  try {
    await connectSSE({
      url: `${GENIE_MESSAGES_URL}?requestId=${encodeURIComponent(crypto.randomUUID())}`,
      payload: { content: question, conversationId },
      // ask() owns the single retry, so connectSSE must not retry on its own.
      maxRetries: 0,
      onMessage: (message) => {
        try {
          const e = JSON.parse(message.data) as GenieEvent;
          if (e.type === 'status') opts.onStatus?.(e.status);
          onEvent(e);
        } catch {
          // Ignore malformed events, as useGenieChat does.
        }
        return Promise.resolve();
      },
      onError: (err) => {
        connectionError = err instanceof Error ? err.message : 'Connection error. Please try again.';
      },
    });
  } catch (err) {
    connectionError = err instanceof Error ? err.message : 'Connection error. Please try again.';
  }
  if (!answer.error && connectionError) answer.error = connectionError;
  return answer;
}

/** Asks the default Genie space a question. Retries once on an error event or a connection failure. */
export async function ask(question: string, conversationId?: string, opts: AskOptions = {}): Promise<GenieAnswer> {
  const first = await attempt(question, conversationId, opts);
  if (!first.error) return first;
  return attempt(question, conversationId, opts);
}
```

- [ ] **Step 4: Run the client tests**

Run: `npx vitest run client/src/genie/__tests__/genieClient.test.ts`
Expected: PASS (all cases, including the existing ones).

- [ ] **Step 5: Create the chat store**

Create `app/client/src/chat/chatStore.ts`:

```ts
import { createContext, useContext } from 'react';
import type { LaneDay } from '../data/types';
import type { AnswerFeature } from '../genie/answerFeatures';
import type { GenieLayerSpec } from '../genie/genieLayer';
import type { ThreadState } from './thread';

/** The reply whose answer is on the map. */
export interface ActiveAnswer {
  id: string;
  question: string;
  spec: GenieLayerSpec;
  features: AnswerFeature[];
  chip: string | null;
}

export interface ChatApi {
  thread: ThreadState;
  pending: boolean;
  /** True when the app has no Genie space id (genieEnabled false); nothing can be sent. */
  genieOff: boolean;
  /** Latest row per demo lane, for drawing lane answers. */
  lanes: LaneDay[];
  active: ActiveAnswer | null;
  send: (question: string) => void;
  retry: (id: string) => void;
  show: (id: string) => void;
  clear: () => void;
  newChat: () => void;
  /** Text for the chat input (from a map popover); a new key re-applies the same text. */
  draft: { text: string; key: number } | undefined;
  setDraft: (text: string) => void;
  /** Table row hovered in the chat or on the map, so both highlight it. */
  hoverRow: number | null;
  setHoverRow: (i: number | null) => void;
  /** Row picked on the map: the table opens and scrolls to it. */
  focusRow: { row: number; key: number } | null;
  setFocusRow: (row: number) => void;
}

export const ChatContext = createContext<ChatApi | null>(null);

export function useChat(): ChatApi {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside ChatProvider');
  return ctx;
}
```

- [ ] **Step 6: Create the chat provider**

Create `app/client/src/chat/ChatProvider.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { useData } from '../data/DataContext';
import { genieStatus, useAppConfig } from '../lib/appConfig';
import { lanesOnIdx } from '../map/layers';
import { answerFeatures, mapChipText } from '../genie/answerFeatures';
import { ask } from '../genie/genieClient';
import { detect } from '../genie/genieLayer';
import { gazetteerOf } from '../genie/places';
import { ChatContext, type ActiveAnswer, type ChatApi } from './chatStore';
import { EMPTY_THREAD, activeOf, canSend, pendingOf, threadReducer } from './thread';

/** A date past every row, so lanesOnIdx returns the latest row per lane. */
const LATEST = '9999-12-31';

/** Holds the chat thread and runs each pending question through Genie, one at a time. Mount inside DataProvider. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { dataset } = useData();
  const config = useAppConfig();
  const genieOff = genieStatus(config) === 'off';
  const [thread, dispatch] = useReducer(threadReducer, EMPTY_THREAD);
  const places = useMemo(() => gazetteerOf(dataset), [dataset]);
  const lanes = useMemo(() => lanesOnIdx(dataset, LATEST), [dataset]);
  const pendingMsg = pendingOf(thread);
  // The id being asked, so a re-render cannot ask twice; the generation drops replies after New chat.
  const inFlight = useRef<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (!pendingMsg || inFlight.current === pendingMsg.id) return;
    const id = pendingMsg.id;
    const gen = generation.current;
    inFlight.current = id;
    void ask(pendingMsg.question, thread.conversationId, {
      onStatus: (text) => {
        if (gen === generation.current) dispatch({ type: 'status', id, text });
      },
    }).then((answer) => {
      if (gen !== generation.current) return;
      inFlight.current = null;
      dispatch({ type: 'reply', id, answer, spec: answer.error ? null : detect(answer, places) });
    });
  }, [pendingMsg, thread.conversationId, places]);

  const pending = pendingMsg !== undefined;
  const send = useCallback(
    (q: string) => {
      if (canSend(genieOff, pending, q)) dispatch({ type: 'send', question: q });
    },
    [genieOff, pending]
  );
  const retry = useCallback((id: string) => dispatch({ type: 'retry', id }), []);
  const show = useCallback((id: string) => dispatch({ type: 'show', id }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);
  const newChat = useCallback(() => {
    generation.current += 1;
    inFlight.current = null;
    dispatch({ type: 'reset' });
  }, []);

  const [draft, setDraftState] = useState<{ text: string; key: number } | undefined>(undefined);
  const setDraft = useCallback((text: string) => setDraftState((d) => ({ text, key: (d?.key ?? 0) + 1 })), []);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [focusRow, setFocusRowState] = useState<{ row: number; key: number } | null>(null);
  const setFocusRow = useCallback((row: number) => setFocusRowState((f) => ({ row, key: (f?.key ?? 0) + 1 })), []);

  const activeMsg = activeOf(thread);
  const active = useMemo<ActiveAnswer | null>(() => {
    if (!activeMsg?.spec) return null;
    const features = answerFeatures(activeMsg.spec, lanes);
    return { id: activeMsg.id, question: activeMsg.question, spec: activeMsg.spec, features, chip: mapChipText(activeMsg.spec, features) };
  }, [activeMsg, lanes]);

  const value = useMemo<ChatApi>(
    () => ({
      thread,
      pending,
      genieOff,
      lanes,
      active,
      send,
      retry,
      show,
      clear,
      newChat,
      draft,
      setDraft,
      hoverRow,
      setHoverRow,
      focusRow,
      setFocusRow,
    }),
    [thread, pending, genieOff, lanes, active, send, retry, show, clear, newChat, draft, setDraft, hoverRow, focusRow, setFocusRow]
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
```

- [ ] **Step 7: Typecheck, test and commit**

Run: `npm run typecheck && npm test`
Expected: typecheck exit 0; all test files pass.

```bash
git add client/src/genie/genieClient.ts client/src/genie/__tests__/genieClient.test.ts client/src/chat/chatStore.ts client/src/chat/ChatProvider.tsx
git commit -m "feat: chat provider runs Genie questions with live status

Co-authored-by: Isaac <no-reply@databricks.com>"
```

---

### Task 5: Data index and the restyled base layers

**Files:**
- Create: `app/client/src/data/dataIndex.ts` (moved code), `app/client/src/map/baseLayers.ts`
- Modify: `app/client/src/map/layers.ts` (import and re-export the moved code), `app/client/src/chat/ChatProvider.tsx` (import `lanesOnIdx` from `../data/dataIndex`)
- Test: `app/client/src/map/__tests__/baseLayers.test.ts`

**Interfaces:**
- Consumes: `Dataset` and row types; `pctColor`, `statusColor`, `NAVY`, `LAVA`, `GRAY` (`map/colors.ts`); `fmtPct` (`data/kpi.ts`).
- Produces:
  - `data/dataIndex.ts`: `LOW_BASELINE = 1`, `indexOf(ds)`, `onOrBefore(sorted, date)`, `latestPer(m, date)`, `portsOn(ds, date)`, `lanesOnIdx(ds, date)`, `latestChokepoints(ds, date): ChokepointDay[]`, `aisCellsOn(ds, date)`, `visibilityOn(ds, region, date)`
  - `map/baseLayers.ts`: `type LngLat`, `interface MapDatum`, `interface Toggles { chokepoints: boolean; ports: boolean; lanes: boolean; ais: boolean }`, `RESTING: Toggles`, `AIS_CELL_ZOOM = 5`, `PORT_LABEL_ZOOM = 6`, `DIM_OPACITY = 0.35`, `shortName(name)`, `portTotals(p)`, `visiblePorts(ds, date): MapDatum[]`, `interface LaneSegment`, `worstStatus(statuses)`, `laneSegments(lanes)`, `curve(a, b, steps?, bend?)`, `curvePath(points)`, `regionShort(r)`, `chokepointRadius(value7d, pct)`, `buildBaseLayers(args: { dataset: Dataset; date: string; visible: Toggles; zoom: number; dimmed: boolean }): Layer[]`

- [ ] **Step 1: Move the indexes into `data/dataIndex.ts`**

Create `app/client/src/data/dataIndex.ts` by moving these declarations verbatim out of `app/client/src/map/layers.ts` (cut, do not copy): the `LOW_BASELINE` constant, the `Index` interface, `cache`, `groupSorted`, `indexOf`, `lastLE`, `onOrBefore`, `latestPer`, `portsOn`, `lanesOnIdx`, `aisCellsOn`, `visibilityOn`. Give the file these imports:

```ts
import type { AisCell, ChokepointDay, Dataset, LaneDay, PortDay, VisibilityPoint } from './types';
```

Export `latestPer` (it was module-private), and add at the end of the file:

```ts
/** Latest row per chokepoint on or before the date. */
export const latestChokepoints = (ds: Dataset, date: string): ChokepointDay[] => latestPer(indexOf(ds).chokepoints, date);
```

In `app/client/src/map/layers.ts`, add near the top:

```ts
import { LOW_BASELINE, aisCellsOn, indexOf, lanesOnIdx, latestPer, portsOn, visibilityOn } from '../data/dataIndex';
export { LOW_BASELINE, aisCellsOn, indexOf, lanesOnIdx, onOrBefore, portsOn, visibilityOn } from '../data/dataIndex';
```

and drop the type imports `AisCell`, `ChokepointDay`, `VisibilityPoint` from its `../data/types` import if they become unused. In `app/client/src/chat/ChatProvider.tsx` change `import { lanesOnIdx } from '../map/layers';` to `import { lanesOnIdx } from '../data/dataIndex';`.

Run: `npm run typecheck && npm test`
Expected: exit 0 and every existing test passes (the old Story/Explore code still imports these names through `map/layers.ts`).

- [ ] **Step 2: Write the failing base-layer tests**

Create `app/client/src/map/__tests__/baseLayers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../data/loadAll';
import type { ChokepointDay, Dataset, LaneDay, PortDay, Region } from '../../data/types';
import {
  DIM_OPACITY,
  RESTING,
  buildBaseLayers,
  curve,
  laneSegments,
  regionShort,
  shortName,
  visiblePorts,
  worstStatus,
} from '../baseLayers';

const ds = (o: Partial<Dataset>): Dataset => ({ ...emptyDataset(), ...o });
const port = (o: Partial<PortDay>): PortDay =>
  ({
    date: '2026-10-01',
    port: 'Jebel Ali',
    country: 'UAE',
    lat: 25,
    lon: 55,
    portcalls_tanker_7d_avg: 1,
    portcalls_container_7d_avg: 1,
    portcalls_dry_bulk_7d_avg: 0,
    baseline_portcalls_tanker: 2,
    baseline_portcalls_container: 2,
    baseline_portcalls_dry_bulk: 0,
    ...o,
  }) as PortDay;
const choke = (o: Partial<ChokepointDay>): ChokepointDay =>
  ({ date: '2026-10-01', chokepoint: 'Strait of Hormuz', lat: 26.3, lon: 56.9, n_total_7d_avg: 4, pct_of_baseline_total: 6, ...o }) as ChokepointDay;
const lane = (o: Partial<LaneDay>): LaneDay =>
  ({
    date: '2026-10-01',
    lane_id: 'L1',
    lane: 'Crude',
    status: 'Disrupted',
    primary_lat: 26.6,
    primary_lon: 50.2,
    hormuz_lat: 26.3,
    hormuz_lon: 56.9,
    exit_lat: 24,
    exit_lon: 60,
    alt_ports: [],
    ...o,
  }) as LaneDay;
const region = (o: Partial<Region>): Region =>
  ({ region: 'gulf_hormuz', role: 'target', label: 'Persian Gulf, Strait of Hormuz', lat_min: 22, lon_min: 47, lat_max: 30, lon_max: 60, area_km2: 1, ...o }) as Region;

const ids = (layers: { id: string }[]) => layers.map((l) => l.id);

describe('shortName and regionShort', () => {
  it('shortens the long chokepoint and region names', () => {
    expect(shortName('Strait of Hormuz')).toBe('Hormuz');
    expect(shortName('Bab el-Mandeb Strait')).toBe('Bab el-Mandeb');
    expect(shortName('Suez Canal')).toBe('Suez');
    expect(shortName('Cape of Good Hope')).toBe('Cape of Good Hope');
    expect(regionShort(region({}))).toBe('Gulf');
    expect(regionShort(region({ region: 'other', label: 'Somewhere, Else' }))).toBe('Somewhere');
  });
});

describe('visiblePorts', () => {
  it('drops ports under 1 call a day of baseline and ports without coordinates', () => {
    const d = ds({
      ports: [
        port({ port: 'A' }),
        port({ port: 'B', baseline_portcalls_tanker: 0.3, baseline_portcalls_container: 0.2 }),
        port({ port: 'C', lat: null }),
        port({ port: 'D', baseline_portcalls_tanker: 0.5, baseline_portcalls_container: 0.5 }),
      ],
    });
    expect(visiblePorts(d, '2026-10-01').map((p) => p.name).sort()).toEqual(['A', 'D']);
    expect(visiblePorts(d, '2026-10-01').find((p) => p.name === 'A')?.pct).toBe(50);
  });
});

describe('laneSegments', () => {
  it('draws a shared stretch once, with every lane on it and the worst status', () => {
    const segs = laneSegments([
      lane({ lane_id: 'L1', lane: 'Crude', status: 'Normal' }),
      lane({ lane_id: 'L2', lane: 'Jet fuel', status: 'Disrupted', primary_lat: 25, primary_lon: 55 }),
    ]);
    const trunk = segs.find((s) => s.laneIds.length === 2);
    expect(trunk?.from).toEqual([56.9, 26.3]);
    expect(trunk?.to).toEqual([60, 24]);
    expect(trunk?.status).toBe('Disrupted');
    expect(trunk?.names).toEqual(['Crude', 'Jet fuel']);
    expect(segs).toHaveLength(3);
  });

  it('adds alternative routes and skips missing points', () => {
    const segs = laneSegments([
      lane({ exit_lat: null, exit_lon: null, alt_ports: [{ port: 'Fujairah', lat: 25.1, lon: 56.3, pct: 90 }] }),
    ]);
    expect(segs).toHaveLength(1);
  });
});

describe('worstStatus and curve', () => {
  it('ranks Disrupted over Shifted over Degraded over Normal over No data', () => {
    expect(worstStatus(['Normal', 'Shifted to alternative', 'Degraded'])).toBe('Shifted to alternative');
    expect(worstStatus([])).toBe('No data');
  });

  it('curves between the two end points', () => {
    const c = curve([0, 0], [10, 0], 8);
    expect(c[0]).toEqual([0, 0]);
    expect(c[c.length - 1]).toEqual([10, 0]);
    expect(c).toHaveLength(9);
    expect(c[4][1]).not.toBe(0);
  });
});

describe('buildBaseLayers', () => {
  const d = ds({ chokepoints: [choke({})], ports: [port({})], lanes: [lane({})], regions: [region({})] });
  const build = (o: Partial<Parameters<typeof buildBaseLayers>[0]>) =>
    buildBaseLayers({ dataset: d, date: '2026-10-01', visible: RESTING, zoom: 4, dimmed: false, ...o });

  it('shows only labeled chokepoints at rest', () => {
    expect(ids(build({}))).toEqual(['chokepoints', 'chokepoint-labels']);
  });

  it('adds AIS cells only from zoom 5 and port labels only from zoom 6', () => {
    const all = { chokepoints: true, ports: true, lanes: true, ais: true };
    expect(ids(build({ visible: all, zoom: 4 }))).toEqual([
      'ais-regions',
      'ais-region-labels',
      'lanes',
      'ports',
      'chokepoints',
      'chokepoint-labels',
    ]);
    expect(ids(build({ visible: all, zoom: 5 }))).toContain('ais-cells');
    expect(ids(build({ visible: all, zoom: 6 }))).toContain('port-labels');
  });

  it('dims every base layer while an answer is on the map', () => {
    for (const l of build({ dimmed: true })) expect(l.props.opacity).toBe(DIM_OPACITY);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run client/src/map/__tests__/baseLayers.test.ts`
Expected: FAIL, `Cannot find module '../baseLayers'`.

- [ ] **Step 4: Implement `baseLayers.ts`**

Create `app/client/src/map/baseLayers.ts`:

```ts
import type { Layer } from '@deck.gl/core';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { LOW_BASELINE, aisCellsOn, lanesOnIdx, latestChokepoints, portsOn, visibilityOn } from '../data/dataIndex';
import { fmtPct } from '../data/kpi';
import type { Dataset, LaneDay, LaneStatus, PortDay, Region, VesselType } from '../data/types';
import { NAVY, pctColor, statusColor, type RGBA } from './colors';

export type LngLat = [number, number];

/** One pickable map object; the tooltip, popover and answer highlighting read these fields. */
export interface MapDatum {
  kind: 'port' | 'chokepoint' | 'lane' | 'region' | 'ais' | 'answer';
  name: string;
  position?: LngLat;
  pct?: number | null;
  value7d?: number | null;
  baseline?: number | null;
  country?: string;
  path?: LngLat[];
  status?: LaneStatus;
  laneNames?: string[];
  polygon?: LngLat[];
  hexagon?: string;
  vessels?: number;
  alpha?: number;
  label?: string;
  /** Answer marks: the table row they belong to, and their feature key. */
  rowIndex?: number | null;
  key?: string;
}

export interface Toggles {
  chokepoints: boolean;
  ports: boolean;
  lanes: boolean;
  ais: boolean;
}

/** The resting map: chokepoints only. */
export const RESTING: Toggles = { chokepoints: true, ports: false, lanes: false, ais: false };

/** H3 cells show from this zoom; below it the AIS layer is region outlines only. */
export const AIS_CELL_ZOOM = 5;
/** Port names show from this zoom; below it they show on hover. */
export const PORT_LABEL_ZOOM = 6;
/** Base layer opacity while a Genie answer is on the map. */
export const DIM_OPACITY = 0.35;

const FONT = 'DM Sans, system-ui, sans-serif';
const LABEL_BG: RGBA = [255, 255, 255, 235];
const isNum = (v: number | null | undefined): v is number => v != null && !Number.isNaN(v);
const pt = (lat: number | null | undefined, lon: number | null | undefined): LngLat | null =>
  isNum(lat) && isNum(lon) ? [lon, lat] : null;

const SHORT: Record<string, string> = {
  'Strait of Hormuz': 'Hormuz',
  'Bab el-Mandeb Strait': 'Bab el-Mandeb',
  'Suez Canal': 'Suez',
};
export const shortName = (name: string): string => SHORT[name] ?? name;

const REGION_SHORT: Record<string, string> = {
  gulf_hormuz: 'Gulf',
  red_sea: 'Red Sea',
  north_sea_channel: 'North Sea',
  suez_east_med: 'East Med',
  malacca_singapore: 'Malacca',
};
export const regionShort = (r: Region): string => REGION_SHORT[r.region] ?? r.label.split(',')[0].trim();

const TYPES: VesselType[] = ['tanker', 'container', 'dry_bulk'];

/** Total 7-day calls, total baseline and percent across the three vessel types. */
export function portTotals(p: PortDay): { value7d: number | null; baseline: number | null; pct: number | null } {
  const vals = TYPES.map((t) => p[`portcalls_${t}_7d_avg`]).filter(isNum);
  const bases = TYPES.map((t) => p[`baseline_portcalls_${t}`]).filter(isNum);
  const value7d = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  const baseline = bases.length ? bases.reduce((a, b) => a + b, 0) : null;
  const pct = isNum(value7d) && isNum(baseline) && baseline > 0 ? (100 * value7d) / baseline : null;
  return { value7d, baseline, pct };
}

/** Ports with coordinates and at least LOW_BASELINE pre-war calls a day; the rest are not drawn. */
export function visiblePorts(ds: Dataset, date: string): MapDatum[] {
  return portsOn(ds, date).flatMap((p): MapDatum[] => {
    const position = pt(p.lat, p.lon);
    const t = portTotals(p);
    if (!position || !isNum(t.baseline) || t.baseline < LOW_BASELINE) return [];
    return [{ kind: 'port', name: p.port, country: p.country, position, ...t }];
  });
}

export interface LaneSegment {
  key: string;
  from: LngLat;
  to: LngLat;
  laneIds: string[];
  names: string[];
  status: LaneStatus;
}

const RANK: Record<LaneStatus, number> = {
  Disrupted: 4,
  'Shifted to alternative': 3,
  Degraded: 2,
  Normal: 1,
  'No data': 0,
};

export function worstStatus(statuses: LaneStatus[]): LaneStatus {
  return statuses.reduce<LaneStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), 'No data');
}

const keyOf = (p: LngLat) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

/**
 * Every stretch of every lane (primary port to Hormuz, Hormuz to the exit, alternative port to the
 * exit), with identical stretches merged so a shared route draws once with all its lanes.
 */
export function laneSegments(lanes: LaneDay[]): LaneSegment[] {
  const by = new Map<string, { from: LngLat; to: LngLat; ids: string[]; names: string[]; statuses: LaneStatus[] }>();
  const add = (from: LngLat | null, to: LngLat | null, l: LaneDay) => {
    if (!from || !to) return;
    const key = `${keyOf(from)}|${keyOf(to)}`;
    const cur = by.get(key) ?? { from, to, ids: [], names: [], statuses: [] };
    if (!cur.ids.includes(l.lane_id)) {
      cur.ids.push(l.lane_id);
      cur.names.push(l.lane);
      cur.statuses.push(l.status);
    }
    by.set(key, cur);
  };
  for (const l of lanes) {
    const p = pt(l.primary_lat, l.primary_lon);
    const h = pt(l.hormuz_lat, l.hormuz_lon);
    const e = pt(l.exit_lat, l.exit_lon);
    add(p, h, l);
    add(h, e, l);
    for (const a of l.alt_ports ?? []) add(pt(a.lat, a.lon), e, l);
  }
  return [...by.entries()].map(([key, v]) => ({
    key,
    from: v.from,
    to: v.to,
    laneIds: v.ids,
    names: v.names,
    status: worstStatus(v.statuses),
  }));
}

/** A gentle quadratic curve from a to b, bowed sideways by `bend` times the distance, as steps + 1 points. */
export function curve(a: LngLat, b: LngLat, steps = 16, bend = 0.12): LngLat[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c: LngLat = [(a[0] + b[0]) / 2 - dy * bend, (a[1] + b[1]) / 2 + dx * bend];
  const out: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  out[0] = a;
  out[steps] = b;
  return out;
}

/** curve() across consecutive points of a path. */
export function curvePath(points: LngLat[]): LngLat[] {
  const out: LngLat[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const seg = curve(points[i], points[i + 1]);
    out.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return out;
}

/** Chokepoint circle radius from its pre-war daily transits (7-day value divided by percent). */
export function chokepointRadius(value7d: number | null | undefined, pct: number | null | undefined): number {
  const baseline = isNum(value7d) && isNum(pct) && pct > 0 ? (100 * value7d) / pct : 0;
  return 8 + 1.5 * Math.sqrt(baseline);
}

export interface BaseArgs {
  dataset: Dataset;
  date: string;
  visible: Toggles;
  zoom: number;
  dimmed: boolean;
}

export function buildBaseLayers({ dataset: ds, date, visible, zoom, dimmed }: BaseArgs): Layer[] {
  const opacity = dimmed ? DIM_OPACITY : 1;
  const layers: Layer[] = [];

  if (visible.ais) {
    const regions: MapDatum[] = ds.regions.map((r) => {
      const vis = visibilityOn(ds, r.region, date)?.visibility_vs_control ?? null;
      const pct = isNum(vis) ? 100 * vis : null;
      return {
        kind: 'region',
        name: r.label,
        pct,
        label: `${regionShort(r)}: ${pct === null ? 'no data' : `${fmtPct(pct)} visible`}`,
        position: [r.lon_min + 0.2, r.lat_max - 0.2],
        polygon: [
          [r.lon_min, r.lat_min],
          [r.lon_max, r.lat_min],
          [r.lon_max, r.lat_max],
          [r.lon_min, r.lat_max],
        ],
      };
    });
    layers.push(
      new PolygonLayer<MapDatum>({
        id: 'ais-regions',
        data: regions,
        opacity,
        getPolygon: (d) => d.polygon ?? [],
        stroked: true,
        filled: false,
        getLineColor: [...NAVY, 140],
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        pickable: true,
      }),
      new TextLayer<MapDatum>({
        id: 'ais-region-labels',
        data: regions,
        opacity,
        getPosition: (d) => d.position ?? [0, 0],
        getText: (d) => d.label ?? '',
        getColor: [...NAVY, 255],
        getSize: 12,
        fontFamily: FONT,
        fontWeight: 500,
        getTextAnchor: 'start',
        getAlignmentBaseline: 'top',
        background: true,
        getBackgroundColor: LABEL_BG,
        backgroundPadding: [5, 2],
      })
    );
    if (zoom >= AIS_CELL_ZOOM) {
      const { cells } = aisCellsOn(ds, date);
      const max = cells.reduce((m, c) => Math.max(m, c.unique_vessels || 0), 0) || 1;
      layers.push(
        new H3HexagonLayer<MapDatum>({
          id: 'ais-cells',
          data: cells.map((c) => ({
            kind: 'ais',
            name: c.h3_res5_str,
            hexagon: c.h3_res5_str,
            vessels: c.unique_vessels,
            alpha: Math.round(60 + 140 * Math.min(1, (c.unique_vessels || 0) / max)),
          })),
          opacity,
          getHexagon: (d) => d.hexagon ?? '',
          extruded: false,
          stroked: false,
          getFillColor: (d): RGBA => [...NAVY, d.alpha ?? 60],
          pickable: true,
        })
      );
    }
  }

  if (visible.lanes) {
    const segs = laneSegments(lanesOnIdx(ds, date));
    layers.push(
      new PathLayer<MapDatum>({
        id: 'lanes',
        data: segs.map((s) => ({
          kind: 'lane',
          name: s.names.length === 1 ? s.names[0] : `${s.names.length} lanes`,
          laneNames: s.names,
          status: s.status,
          path: curve(s.from, s.to),
        })),
        opacity,
        getPath: (d) => d.path ?? [],
        getColor: (d) => statusColor(d.status),
        getWidth: (d) => Math.min(6, 1.5 + (d.laneNames?.length ?? 1)),
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        pickable: true,
      })
    );
  }

  if (visible.ports) {
    const ports = visiblePorts(ds, date);
    layers.push(
      new ScatterplotLayer<MapDatum>({
        id: 'ports',
        data: ports,
        opacity,
        getPosition: (d) => d.position ?? [0, 0],
        getRadius: (d) => 4 + Math.sqrt(isNum(d.baseline) ? d.baseline : 0),
        radiusUnits: 'pixels',
        getFillColor: (d) => pctColor(d.pct ?? null),
        stroked: true,
        getLineColor: [255, 255, 255, 230],
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        pickable: true,
      })
    );
    if (zoom >= PORT_LABEL_ZOOM) {
      layers.push(
        new TextLayer<MapDatum>({
          id: 'port-labels',
          data: ports,
          opacity,
          getPosition: (d) => d.position ?? [0, 0],
          getText: (d) => d.name,
          getColor: [...NAVY, 230],
          getSize: 11,
          fontFamily: FONT,
          getTextAnchor: 'start',
          getPixelOffset: [8, 0],
          background: true,
          getBackgroundColor: [255, 255, 255, 200],
          backgroundPadding: [3, 1],
        })
      );
    }
  }

  if (visible.chokepoints) {
    const data: MapDatum[] = latestChokepoints(ds, date).flatMap((c): MapDatum[] => {
      const position = pt(c.lat, c.lon);
      if (!position) return [];
      return [
        {
          kind: 'chokepoint',
          name: c.chokepoint,
          position,
          value7d: c.n_total_7d_avg,
          pct: c.pct_of_baseline_total,
          label: `${shortName(c.chokepoint)} ${fmtPct(c.pct_of_baseline_total)}`,
        },
      ];
    });
    layers.push(
      new ScatterplotLayer<MapDatum>({
        id: 'chokepoints',
        data,
        opacity,
        getPosition: (d) => d.position ?? [0, 0],
        getRadius: (d) => chokepointRadius(d.value7d, d.pct),
        radiusUnits: 'pixels',
        getFillColor: (d) => pctColor(d.pct ?? null),
        stroked: true,
        getLineColor: [255, 255, 255, 255],
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        pickable: true,
      }),
      new TextLayer<MapDatum>({
        id: 'chokepoint-labels',
        data,
        opacity,
        getPosition: (d) => d.position ?? [0, 0],
        getText: (d) => d.label ?? d.name,
        getColor: [...NAVY, 255],
        getSize: 13,
        fontFamily: FONT,
        fontWeight: 500,
        getTextAnchor: 'start',
        getPixelOffset: (d) => [chokepointRadius(d.value7d, d.pct) + 6, 0],
        background: true,
        getBackgroundColor: LABEL_BG,
        backgroundPadding: [6, 3],
      })
    );
  }
  return layers;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run client/src/map/__tests__/baseLayers.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Full check and commit**

Run: `npm run typecheck && npm test`
Expected: exit 0; all tests pass.

```bash
git add client/src/data/dataIndex.ts client/src/map/layers.ts client/src/map/baseLayers.ts client/src/map/__tests__/baseLayers.test.ts client/src/chat/ChatProvider.tsx
git commit -m "feat: calmer base layers (labeled chokepoints, filtered ports, bundled lanes, AIS by zoom)

Co-authored-by: Isaac <no-reply@databricks.com>"
```

---

### Task 6: Answer layers

**Files:**
- Create: `app/client/src/map/answerLayer.ts`
- Test: `app/client/src/map/__tests__/answerLayer.test.ts`

**Interfaces:**
- Consumes: `AnswerFeature`, `LABEL_LIMIT` (Task 2); `MapDatum`, `curvePath` (Task 5); `LAVA` (`map/colors.ts`); `GenieLayerSpec['kind']`.
- Produces: `buildAnswerLayers(args: { kind: 'points' | 'h3' | 'lanes'; features: AnswerFeature[]; highlightRow: number | null }): Layer[]`, `answerLabel(f: AnswerFeature): string`.

- [ ] **Step 1: Write the failing tests**

Create `app/client/src/map/__tests__/answerLayer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AnswerFeature } from '../../genie/answerFeatures';
import { answerLabel, buildAnswerLayers } from '../answerLayer';
import type { MapDatum } from '../baseLayers';

const pt = (i: number): AnswerFeature => ({
  key: `row:${i}`,
  rowIndex: i,
  name: `Port ${i}`,
  value: `${i}%`,
  position: [50 + i, 20],
});
const ids = (layers: { id: string }[]) => layers.map((l) => l.id);

describe('buildAnswerLayers', () => {
  it('draws points with a halo and labels up to the label limit', () => {
    expect(ids(buildAnswerLayers({ kind: 'points', features: [pt(0), pt(1)], highlightRow: null }))).toEqual([
      'answer-halo',
      'answer-points',
      'answer-labels',
    ]);
    const many = Array.from({ length: 13 }, (_, i) => pt(i));
    expect(ids(buildAnswerLayers({ kind: 'points', features: many, highlightRow: null }))).toEqual([
      'answer-halo',
      'answer-points',
    ]);
  });

  it('enlarges the highlighted row', () => {
    const [, points] = buildAnswerLayers({ kind: 'points', features: [pt(0), pt(1)], highlightRow: 1 });
    const radius = points.props.getRadius as (d: MapDatum) => number;
    const data = points.props.data as MapDatum[];
    expect(radius(data[1])).toBeGreaterThan(radius(data[0]));
  });

  it('draws lanes with a white casing, and cells as H3', () => {
    const lane: AnswerFeature = { key: 'lane:L1', rowIndex: null, name: 'L1 Crude', value: 'Disrupted', position: [50, 26], path: [[50, 26], [57, 26]] };
    expect(ids(buildAnswerLayers({ kind: 'lanes', features: [lane], highlightRow: null }))).toEqual([
      'answer-casing',
      'answer-lanes',
      'answer-labels',
    ]);
    const cell: AnswerFeature = { key: 'hex:x', rowIndex: 0, name: 'Cell', value: null, hexagon: '85283473fffffff' };
    expect(ids(buildAnswerLayers({ kind: 'h3', features: [cell], highlightRow: null }))).toEqual(['answer-cells']);
  });

  it('draws nothing for no features', () => {
    expect(buildAnswerLayers({ kind: 'points', features: [], highlightRow: null })).toEqual([]);
  });
});

describe('answerLabel', () => {
  it('joins name and value', () => {
    expect(answerLabel(pt(3))).toBe('Port 3  3%');
    expect(answerLabel({ ...pt(3), value: null })).toBe('Port 3');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client/src/map/__tests__/answerLayer.test.ts`
Expected: FAIL, `Cannot find module '../answerLayer'`.

- [ ] **Step 3: Implement `answerLayer.ts`**

Create `app/client/src/map/answerLayer.ts`:

```ts
import type { Layer } from '@deck.gl/core';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { LABEL_LIMIT, type AnswerFeature } from '../genie/answerFeatures';
import { curvePath, type MapDatum } from './baseLayers';
import { LAVA, NAVY, type RGBA } from './colors';

const FONT = 'DM Sans, system-ui, sans-serif';
const WHITE: RGBA = [255, 255, 255, 255];

export const answerLabel = (f: AnswerFeature): string => (f.value ? `${f.name}  ${f.value}` : f.name);

const datum = (f: AnswerFeature): MapDatum => ({
  kind: 'answer',
  name: f.name,
  label: answerLabel(f),
  position: f.position,
  hexagon: f.hexagon,
  path: f.path ? curvePath(f.path) : undefined,
  rowIndex: f.rowIndex,
  key: f.key,
});

export interface AnswerArgs {
  kind: 'points' | 'h3' | 'lanes';
  features: AnswerFeature[];
  /** Table row hovered in the chat or on the map. */
  highlightRow: number | null;
}

/** The Genie answer on top of the base map: Lava with a white halo, labeled when there are few marks. */
export function buildAnswerLayers({ kind, features, highlightRow }: AnswerArgs): Layer[] {
  if (features.length === 0) return [];
  const data = features.map(datum);
  const hot = (d: MapDatum) => highlightRow !== null && d.rowIndex === highlightRow;
  const layers: Layer[] = [];

  if (kind === 'h3') {
    layers.push(
      new H3HexagonLayer<MapDatum>({
        id: 'answer-cells',
        data,
        getHexagon: (d) => d.hexagon ?? '',
        extruded: false,
        stroked: true,
        getLineColor: [...LAVA, 255],
        lineWidthUnits: 'pixels',
        getLineWidth: (d) => (hot(d) ? 3 : 1),
        getFillColor: (d): RGBA => [...LAVA, hot(d) ? 220 : 140],
        pickable: true,
        updateTriggers: { getLineWidth: highlightRow, getFillColor: highlightRow },
      })
    );
    return layers;
  }

  if (kind === 'lanes') {
    layers.push(
      new PathLayer<MapDatum>({
        id: 'answer-casing',
        data,
        getPath: (d) => d.path ?? [],
        getColor: WHITE,
        getWidth: 9,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
      }),
      new PathLayer<MapDatum>({
        id: 'answer-lanes',
        data,
        getPath: (d) => d.path ?? [],
        getColor: [...LAVA, 255],
        getWidth: 5,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        pickable: true,
      })
    );
  } else {
    layers.push(
      new ScatterplotLayer<MapDatum>({
        id: 'answer-halo',
        data,
        getPosition: (d) => d.position ?? [0, 0],
        getRadius: (d) => (hot(d) ? 22 : 16),
        radiusUnits: 'pixels',
        getFillColor: [...LAVA, 46],
        updateTriggers: { getRadius: highlightRow },
      }),
      new ScatterplotLayer<MapDatum>({
        id: 'answer-points',
        data,
        getPosition: (d) => d.position ?? [0, 0],
        getRadius: (d) => (hot(d) ? 10 : 7),
        radiusUnits: 'pixels',
        getFillColor: [...LAVA, 255],
        stroked: true,
        getLineColor: WHITE,
        lineWidthUnits: 'pixels',
        getLineWidth: 3,
        pickable: true,
        updateTriggers: { getRadius: highlightRow },
      })
    );
  }

  if (features.length <= LABEL_LIMIT) {
    layers.push(
      new TextLayer<MapDatum>({
        id: 'answer-labels',
        data: data.filter((d) => d.position),
        getPosition: (d) => d.position ?? [0, 0],
        getText: (d) => d.label ?? d.name,
        getColor: [...NAVY, 255],
        getSize: 13,
        fontFamily: FONT,
        fontWeight: 500,
        getTextAnchor: 'start',
        getPixelOffset: [16, 0],
        background: true,
        getBackgroundColor: [255, 255, 255, 245],
        getBorderColor: [...LAVA, 255],
        getBorderWidth: 1,
        backgroundPadding: [7, 4],
      })
    );
  }
  return layers;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run client/src/map/__tests__/answerLayer.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: exit 0.

```bash
git add client/src/map/answerLayer.ts client/src/map/__tests__/answerLayer.test.ts
git commit -m "feat: Genie answer layers in Lava with halo and labels

Co-authored-by: Isaac <no-reply@databricks.com>"
```

---

### Task 7: Tour copy, steps and state

**Files:**
- Move: `app/client/src/story/copy.ts` to `app/client/src/tour/fill.ts`, and `app/client/src/story/__tests__/copy.test.ts` to `app/client/src/tour/__tests__/fill.test.ts` (use `git mv`; fix the import path inside the test to `../fill`)
- Create: `app/client/src/tour/copy.ts` (code moved out of `story/scenes.ts`), `app/client/src/tour/steps.ts`, `app/client/src/tour/tourState.ts`
- Modify: `app/client/src/story/scenes.ts` (import the moved code back), any `story/*` file that imported `./copy` (now `../tour/fill`)
- Test: `app/client/src/tour/__tests__/tour.test.ts`

**Interfaces:**
- Consumes: `Toggles` (Task 5), `ViewState` (`map/MapView.tsx`), `Dataset`, `ConflictEvent`.
- Produces:
  - `tour/copy.ts`: `QUESTIONS: string[]`, `type SceneDate`, `resolveSceneDate(date, ds): string`, `regionsBounds(regions)`, `countWord(n)`, `laneFilter(ds, date, ids)`, `body1` to `body5: (ds: Dataset, date: string) => string`, `eventOn(ds, date): ConflictEvent | undefined`, `firstSentences(text: string, n: number): string`
  - `tour/steps.ts`: `interface TourStep { id: 1 | 2 | 3 | 4 | 5; title: string; date: SceneDate; toggles: Toggles; center: [number, number]; zoom: number; fitRegions?: boolean; question: string; body: (ds: Dataset, date: string) => string; event?: (ds: Dataset, date: string) => ConflictEvent | undefined }`, `STEPS: TourStep[]`, `stepCamera(step: TourStep, ds: Dataset): ViewState`, `stepCaption(step: TourStep, ds: Dataset, date: string): string`, `TOUR_PADDING_BOTTOM = 190`
  - `tour/tourState.ts`: `interface TourSnapshot { toggles: Toggles; date: string | null; view: ViewState }`, `interface TourState { step: number; snapshot: TourSnapshot }`, `startTour(s: TourSnapshot): TourState`, `nextStep(t: TourState): TourState | null`, `prevStep(t: TourState): TourState`

- [ ] **Step 1: Move `story/copy.ts` to `tour/fill.ts`**

```bash
mkdir -p client/src/tour/__tests__
git mv client/src/story/copy.ts client/src/tour/fill.ts
git mv client/src/story/__tests__/copy.test.ts client/src/tour/__tests__/fill.test.ts
```

In `client/src/tour/__tests__/fill.test.ts` change the import from `'../copy'` to `'../fill'`. In `client/src/story/scenes.ts` change `import { fill, pick } from './copy';` to `import { fill, pick } from '../tour/fill';`. Search for any other importer: `grep -rn "from './copy'\|from '../copy'" client/src/story` and repoint each to `../tour/fill`.

- [ ] **Step 2: Move the scene copy into `tour/copy.ts`**

Create `app/client/src/tour/copy.ts`. Cut these declarations verbatim out of `client/src/story/scenes.ts` and paste them into it, in this order: `QUESTIONS`, the `SceneDate` type, `maxOf`, `latestLaneDate`, `resolveSceneDate`, `isNum`, `regionsBounds`, `WORDS`, `countWord`, `joinAnd`, `laneFilter`, `body1`, `eventOn`, `body2`, `reliableAltPorts`, `body3`, `body4`, `yanbuTanker7d`, `body5`. Add `export` to `body1` to `body5`, `QUESTIONS`, `SceneDate`, `resolveSceneDate`, `regionsBounds`, `countWord`, `laneFilter` and `eventOn` (keep the rest module-private). Give the file the imports the moved code uses:

```ts
import { disruptedCount, fmtNum, fmtPct, gulfVisibility, hormuzOn, latestOnOrBefore, riskPhrase, volumeAtRisk } from '../data/kpi';
import { LOW_BASELINE, indexOf, lanesOnIdx } from '../data/dataIndex';
import type { AltPort, ConflictEvent, Dataset, LaneDay, Region } from '../data/types';
import { fmtDate, latestAisDay, latestVisibilityDay, SCRUB_START } from '../explore/dates';
import { fill, pick } from './fill';
```

Then append:

```ts
/**
 * The first n sentences. A sentence ends at ., ! or ? followed by a space and a capital letter, so
 * "Supply Co. (a fictional example)" and "2.6" do not split.
 */
export function firstSentences(text: string, n: number): string {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return parts.slice(0, n).join(' ');
}
```

In `client/src/story/scenes.ts`, replace the cut code with one import (keep the `Scene` interface, `REGIONS_FIT_PADDING`, `sceneView`, `T`, `q` and `SCENES` in place):

```ts
import { QUESTIONS, body1, body2, body3, body4, body5, countWord, eventOn, laneFilter, regionsBounds, resolveSceneDate, type SceneDate } from '../tour/copy';
export { QUESTIONS, countWord, eventOn, laneFilter, regionsBounds, resolveSceneDate, type SceneDate } from '../tour/copy';
```

(`story/__tests__/scenes.test.ts` imports `QUESTIONS`, `countWord`, `eventOn`, `regionsBounds` and `resolveSceneDate` from `../scenes`, and `StoryPage.tsx` imports `laneFilter` and `resolveSceneDate`, so all of these must stay importable from `scenes.ts`.) Remove imports in `scenes.ts` that become unused. Run: `npm run typecheck && npm test`. Expected: exit 0 and every test passes, including `story/__tests__/scenes.test.ts` unchanged.

- [ ] **Step 3: Write the failing tour tests**

Create `app/client/src/tour/__tests__/tour.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../data/loadAll';
import type { Region } from '../../data/types';
import { RESTING } from '../../map/baseLayers';
import { firstSentences } from '../copy';
import { STEPS, stepCamera, stepCaption } from '../steps';
import { nextStep, prevStep, startTour, type TourSnapshot } from '../tourState';

const snap: TourSnapshot = {
  toggles: { ...RESTING, ports: true },
  date: '2026-06-01',
  view: { longitude: 1, latitude: 2, zoom: 3 },
};

describe('firstSentences', () => {
  it('keeps the first n sentences without splitting abbreviations or decimals', () => {
    const t = 'Northwind Supply Co. (a fictional example) runs six lanes. Before the war it carried 2.6 a day. All ran normally.';
    expect(firstSentences(t, 2)).toBe('Northwind Supply Co. (a fictional example) runs six lanes. Before the war it carried 2.6 a day.');
    expect(firstSentences('One sentence.', 2)).toBe('One sentence.');
  });
});

describe('tourState', () => {
  it('walks forward, stops going back at the first step and ends after the last', () => {
    let t = startTour(snap);
    expect(t.step).toBe(0);
    expect(prevStep(t).step).toBe(0);
    for (let i = 1; i < STEPS.length; i++) {
      const n = nextStep(t);
      expect(n?.step).toBe(i);
      t = n!;
    }
    expect(nextStep(t)).toBeNull();
  });

  it('exit restores the snapshot (the caller reads t.snapshot)', () => {
    const t = nextStep(startTour(snap))!;
    expect(t.snapshot).toEqual(snap);
    expect(t.snapshot).not.toBe(snap);
  });
});

describe('steps', () => {
  it('has five steps, each with a question and at least one layer on', () => {
    expect(STEPS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
    for (const s of STEPS) {
      expect(s.question.length).toBeGreaterThan(10);
      expect(Object.values(s.toggles).some(Boolean)).toBe(true);
    }
  });

  it('falls back to the center view without regions, and fits regions when they exist', () => {
    const last = STEPS[4];
    expect(stepCamera(last, emptyDataset())).toEqual({ longitude: last.center[0], latitude: last.center[1], zoom: last.zoom });
    const region = { region: 'r', role: 't', label: 'R', lat_min: 1, lon_min: 2, lat_max: 3, lon_max: 4, area_km2: 1 } as Region;
    const v = stepCamera(last, { ...emptyDataset(), regions: [region] });
    expect(v.bounds).toEqual([
      [2, 1],
      [4, 3],
    ]);
  });

  it('captions are at most two sentences and never throw on an empty dataset', () => {
    for (const s of STEPS) {
      const c = stepCaption(s, emptyDataset(), '2026-03-08');
      expect(c.split(/(?<=[.!?])\s+(?=[A-Z])/).length).toBeLessThanOrEqual(2);
    }
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run client/src/tour/__tests__/tour.test.ts`
Expected: FAIL, `Cannot find module '../steps'`.

- [ ] **Step 5: Implement `steps.ts` and `tourState.ts`**

Create `app/client/src/tour/steps.ts`:

```ts
import type { ConflictEvent, Dataset } from '../data/types';
import type { Toggles } from '../map/baseLayers';
import type { ViewState } from '../map/MapView';
import { QUESTIONS, body1, body2, body3, body4, body5, eventOn, firstSentences, regionsBounds, type SceneDate } from './copy';

export interface TourStep {
  id: 1 | 2 | 3 | 4 | 5;
  title: string;
  date: SceneDate;
  toggles: Toggles;
  center: [number, number];
  zoom: number;
  /** Fit the camera to every AIS sampling region (falls back to center and zoom without regions). */
  fitRegions?: boolean;
  /** Sent to Genie by "Ask Genie this". */
  question: string;
  body: (ds: Dataset, date: string) => string;
  event?: (ds: Dataset, date: string) => ConflictEvent | undefined;
}

const on = (o: Partial<Toggles>): Toggles => ({ chokepoints: false, ports: false, lanes: false, ais: false, ...o });

export const STEPS: TourStep[] = [
  {
    id: 1,
    title: 'Your exposure',
    date: '2026-02-15',
    toggles: on({ chokepoints: true, lanes: true }),
    center: [54.5, 25.5],
    zoom: 5.0,
    question: QUESTIONS[0],
    body: body1,
  },
  {
    id: 2,
    title: 'The strait closes',
    date: '2026-03-08',
    toggles: on({ chokepoints: true }),
    center: [56.4, 26.3],
    zoom: 6.6,
    question: QUESTIONS[4],
    body: body2,
    event: eventOn,
  },
  {
    id: 3,
    title: 'Where traffic went',
    date: 'latest',
    toggles: on({ ports: true, lanes: true }),
    center: [50.0, 22.0],
    zoom: 4.2,
    question: QUESTIONS[1],
    body: body3,
  },
  {
    id: 4,
    title: 'Lanes with no way around',
    date: 'latest',
    toggles: on({ chokepoints: true, lanes: true }),
    center: [51.5, 26.5],
    zoom: 5.6,
    question: QUESTIONS[3],
    body: body4,
  },
  {
    id: 5,
    title: 'What you cannot see',
    date: 'latest-ais',
    toggles: on({ chokepoints: true, ais: true }),
    center: [50.0, 30.0],
    zoom: 2.2,
    fitRegions: true,
    question: QUESTIONS[5],
    body: body5,
  },
];

/** Room under the camera for the tour caption bar at the bottom of the map. */
export const TOUR_PADDING_BOTTOM = 190;

export function stepCamera(step: TourStep, ds: Dataset): ViewState {
  const base: ViewState = { longitude: step.center[0], latitude: step.center[1], zoom: step.zoom };
  if (!step.fitRegions) return base;
  const bounds = regionsBounds(ds.regions);
  return bounds ? { ...base, bounds, boundsPadding: { top: 24, bottom: 24, left: 24, right: 24 } } : base;
}

/** The step's data-driven copy, cut to two sentences for the caption bar. */
export const stepCaption = (step: TourStep, ds: Dataset, date: string): string =>
  firstSentences(step.body(ds, date), 2);
```

Create `app/client/src/tour/tourState.ts`:

```ts
import type { Toggles } from '../map/baseLayers';
import type { ViewState } from '../map/MapView';
import { STEPS } from './steps';

/** What the map looked like before the tour, restored on exit. */
export interface TourSnapshot {
  toggles: Toggles;
  date: string | null;
  view: ViewState;
}

export interface TourState {
  step: number;
  snapshot: TourSnapshot;
}

export const startTour = (s: TourSnapshot): TourState => ({
  step: 0,
  snapshot: { toggles: { ...s.toggles }, date: s.date, view: { ...s.view } },
});

/** The next step, or null after the last one (the caller then exits and restores the snapshot). */
export const nextStep = (t: TourState): TourState | null =>
  t.step + 1 < STEPS.length ? { ...t, step: t.step + 1 } : null;

export const prevStep = (t: TourState): TourState => ({ ...t, step: Math.max(0, t.step - 1) });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run client/src/tour`
Expected: PASS (tour.test.ts 7 tests, fill.test.ts unchanged).

- [ ] **Step 7: Full check and commit**

Run: `npm run typecheck && npm test`
Expected: exit 0; all tests pass.

```bash
git add -A client/src/tour client/src/story
git commit -m "feat: tour steps and state built on the scene copy

Co-authored-by: Isaac <no-reply@databricks.com>"
```

---

### Task 8: Chat panel UI

**Files:**
- Create: `app/client/src/chat/markdown.ts`, `app/client/src/chat/Markdown.tsx`, `app/client/src/chat/starters.ts`, `app/client/src/chat/AnswerTable.tsx`, `app/client/src/chat/GenieReply.tsx`, `app/client/src/chat/ChatPanel.tsx`
- Test: `app/client/src/chat/__tests__/markdown.test.ts`

**Interfaces:**
- Consumes: `useChat`, `ChatApi` (Task 4); `GenieMsg`, `followUps`, `statusLabel`, `canSend` (Task 3); `answerFeatures`, `mapChipText` (Task 2); `TABLE_ROWS`, `cellText`, `mapRowsCaption` (`genie/genieLayer.ts`); `GENIE_OFF_MESSAGE` (`lib/appConfig.ts`).
- Produces: `type Inline = { text: string; bold: boolean }`, `type Block = { kind: 'p'; parts: Inline[] } | { kind: 'ul'; items: Inline[][] }`, `parseMarkdown(src: string): Block[]`, `<Markdown text />`, `STARTERS: string[]`, `<ChatPanel />`, `<GenieReply msg followUps onFollowUp />`, `<AnswerTable msg active />`.

- [ ] **Step 1: Write the failing Markdown test**

Create `app/client/src/chat/__tests__/markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../markdown';

describe('parseMarkdown', () => {
  it('splits paragraphs and bullet lists and finds bold spans', () => {
    const md = 'Based on the data, **2 ports** are up.\n\n- **Salalah**: 135%\n- Khor Fakkan: 1160%\n\nTreat it **cautiously**.';
    expect(parseMarkdown(md)).toEqual([
      { kind: 'p', parts: [{ text: 'Based on the data, ', bold: false }, { text: '2 ports', bold: true }, { text: ' are up.', bold: false }] },
      {
        kind: 'ul',
        items: [
          [{ text: 'Salalah', bold: true }, { text: ': 135%', bold: false }],
          [{ text: 'Khor Fakkan: 1160%', bold: false }],
        ],
      },
      { kind: 'p', parts: [{ text: 'Treat it ', bold: false }, { text: 'cautiously', bold: true }, { text: '.', bold: false }] },
    ]);
  });

  it('joins wrapped lines into one paragraph, accepts * bullets and returns [] for blank input', () => {
    expect(parseMarkdown('one\ntwo')).toEqual([{ kind: 'p', parts: [{ text: 'one two', bold: false }] }]);
    expect(parseMarkdown('* a')).toEqual([{ kind: 'ul', items: [[{ text: 'a', bold: false }]] }]);
    expect(parseMarkdown('   ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run client/src/chat/__tests__/markdown.test.ts`
Expected: FAIL, `Cannot find module '../markdown'`.

- [ ] **Step 3: Implement `markdown.ts` and `Markdown.tsx`**

Create `app/client/src/chat/markdown.ts`:

```ts
export type Inline = { text: string; bold: boolean };
export type Block = { kind: 'p'; parts: Inline[] } | { kind: 'ul'; items: Inline[][] };

const BULLET = /^\s*[-*]\s+/;

/** **bold** spans; everything else is plain text. */
function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), bold: false });
  return out;
}

/** The small Markdown subset Genie writes: paragraphs, "-" or "*" bullets and **bold**. No HTML. */
export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', parts: inline(para.join(' ')) });
    if (list.length) blocks.push({ kind: 'ul', items: list.map(inline) });
    para = [];
    list = [];
  };
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (BULLET.test(raw)) {
      if (para.length) flush();
      list.push(raw.replace(BULLET, '').trim());
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}
```

Create `app/client/src/chat/Markdown.tsx`:

```tsx
import { parseMarkdown, type Inline } from './markdown';

const spans = (parts: Inline[]) =>
  parts.map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>));

/** Genie text rendered from parsed blocks (React elements only, never raw HTML). */
export function Markdown({ text }: { text: string }) {
  return (
    <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
      {parseMarkdown(text).map((b, i) =>
        b.kind === 'p' ? (
          <p key={i} style={{ margin: '0 0 8px' }}>
            {spans(b.parts)}
          </p>
        ) : (
          <ul key={i} style={{ margin: '0 0 8px', paddingLeft: 18 }}>
            {b.items.map((it, j) => (
              <li key={j} style={{ marginBottom: 4 }}>
                {spans(it)}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
```

Run: `npx vitest run client/src/chat/__tests__/markdown.test.ts`. Expected: PASS (2 tests).

- [ ] **Step 4: Create the starters**

Create `app/client/src/chat/starters.ts`:

```ts
/**
 * Starter questions in an empty chat. Each one must return a mappable answer from the live space
 * (checked in the live verification step before these are final).
 */
export const STARTERS = [
  'Which alternative ports are running above their pre-war baseline?',
  'Which of our lanes are disrupted today, and how much volume is at risk?',
  'How much of the Gulf can we see on AIS compared with normal shipping lanes?',
  'Which Gulf ports have lost the most tanker calls since the war began?',
];
```

- [ ] **Step 5: Create `AnswerTable.tsx`**

Create `app/client/src/chat/AnswerTable.tsx`:

```tsx
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { TABLE_ROWS, cellText, mapRowsCaption } from '../genie/genieLayer';
import { useChat } from './chatStore';
import type { GenieMsg } from './thread';

const th: CSSProperties = { textAlign: 'left', fontWeight: 700, padding: '4px 8px', borderBottom: '1px solid var(--gray-300)', whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '4px 8px', borderBottom: '1px solid var(--gray-100)', whiteSpace: 'nowrap' };

/** The collapsed result table. When this reply is on the map, rows and marks highlight each other. */
export function AnswerTable({ msg, active }: { msg: GenieMsg; active: boolean }) {
  const { hoverRow, setHoverRow, focusRow } = useChat();
  const [open, setOpen] = useState(false);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const answer = msg.answer;

  // A mark clicked on the map opens this table and scrolls its row into view.
  useEffect(() => {
    if (!active || !focusRow) return;
    setOpen(true);
    requestAnimationFrame(() => rowRefs.current.get(focusRow.row)?.scrollIntoView({ block: 'nearest' }));
  }, [active, focusRow]);

  if (!answer || answer.columns.length === 0) return null;
  const columns = answer.columns.filter((c) => !c.startsWith('__'));
  const rows = answer.rows.slice(0, TABLE_ROWS);
  const caption = mapRowsCaption(msg.spec, answer.totalRows);

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
        Table ({answer.totalRows.toLocaleString('en-US')} {answer.totalRows === 1 ? 'row' : 'rows'})
      </summary>
      <div style={{ overflowX: 'auto', maxHeight: 260, marginTop: 6, border: '1px solid var(--gray-300)', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', width: '100%' }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} style={th}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                ref={(el) => {
                  if (el) rowRefs.current.set(i, el);
                  else rowRefs.current.delete(i);
                }}
                onMouseEnter={() => active && setHoverRow(i)}
                onMouseLeave={() => active && setHoverRow(null)}
                style={{ background: active && hoverRow === i ? '#FFF1EE' : undefined }}
              >
                {columns.map((c) => (
                  <td key={c} style={{ ...td, color: cellText(r[c]) === 'no data' ? 'var(--gray-500)' : undefined }}>
                    {cellText(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(caption || answer.totalRows > TABLE_ROWS) && (
        <div style={{ fontSize: '0.75rem', color: 'var(--gray-700)', marginTop: 4 }}>
          {answer.totalRows > TABLE_ROWS ? `Showing ${TABLE_ROWS} of ${answer.totalRows.toLocaleString('en-US')} rows. ` : ''}
          {caption ?? ''}
        </div>
      )}
    </details>
  );
}
```

- [ ] **Step 6: Create `GenieReply.tsx`**

Create `app/client/src/chat/GenieReply.tsx`:

```tsx
import { useMemo, type CSSProperties } from 'react';
import { answerFeatures, mapChipText } from '../genie/answerFeatures';
import { AnswerTable } from './AnswerTable';
import { useChat } from './chatStore';
import { Markdown } from './Markdown';
import { statusLabel, type GenieMsg } from './thread';

export const followChip: CSSProperties = {
  font: 'inherit',
  fontSize: '0.8125rem',
  lineHeight: 1.35,
  textAlign: 'left',
  padding: '7px 10px',
  borderRadius: 10,
  border: '1px solid var(--gray-300)',
  background: 'var(--white)',
  color: 'var(--navy-900)',
  cursor: 'pointer',
};

const who = (
  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 6 }}>
    <span
      aria-hidden
      style={{ width: 18, height: 18, borderRadius: 5, background: 'var(--lava-600)', color: 'var(--white)', display: 'grid', placeItems: 'center', fontSize: 11 }}
    >
      G
    </span>
    Genie
  </div>
);

interface Props {
  msg: GenieMsg;
  /** Suggestions shown only under the latest finished reply. */
  followUps: string[];
  onFollowUp: (q: string) => void;
}

export function GenieReply({ msg, followUps, onFollowUp }: Props) {
  const chat = useChat();
  const features = useMemo(() => (msg.spec ? answerFeatures(msg.spec, chat.lanes) : []), [msg.spec, chat.lanes]);
  const chip = msg.spec ? mapChipText(msg.spec, features) : null;
  const active = chat.thread.activeId === msg.id;

  return (
    <div style={{ alignSelf: 'flex-start', width: '100%', display: 'grid', gap: 10 }}>
      {who}
      {msg.status === 'pending' && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gray-700)', fontSize: '0.875rem' }}>
          <span className="typing" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {statusLabel(msg.statusText)}
        </div>
      )}
      {msg.status === 'error' && (
        <div role="alert" style={{ fontSize: '0.875rem' }}>
          <p style={{ margin: '0 0 8px' }}>{msg.error ?? 'Genie could not answer this question.'}</p>
          <button type="button" onClick={() => chat.retry(msg.id)} disabled={chat.pending} style={followChip}>
            Retry
          </button>
        </div>
      )}
      {msg.status === 'done' && (
        <>
          {msg.answer?.text && <Markdown text={msg.answer.text} />}
          {chip && (
            <button
              type="button"
              onClick={() => (active ? chat.clear() : chat.show(msg.id))}
              aria-pressed={active}
              style={{
                justifySelf: 'start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                font: 'inherit',
                fontSize: '0.8125rem',
                fontWeight: 500,
                padding: '6px 11px',
                borderRadius: 999,
                border: `1px solid ${active ? 'var(--lava-600)' : 'var(--gray-300)'}`,
                background: active ? '#FFF4F2' : 'var(--white)',
                color: 'var(--navy-900)',
                cursor: 'pointer',
              }}
            >
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: active ? 'var(--lava-600)' : 'var(--gray-500)' }} />
              {chip}
            </button>
          )}
          <AnswerTable msg={msg} active={active} />
          {msg.answer?.sql && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--gray-700)' }}>Show query</summary>
              <pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', background: 'var(--light)', border: '1px solid var(--gray-300)', borderRadius: 8, padding: 8, margin: '6px 0 0' }}>
                {msg.answer.sql}
              </pre>
            </details>
          )}
          {followUps.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Follow up</div>
              {followUps.slice(0, 3).map((q) => (
                <button key={q} type="button" onClick={() => onFollowUp(q)} disabled={chat.pending} style={followChip}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

Add the typing indicator styles to the end of `app/client/src/theme/tokens.css`:

```css
.typing { display: inline-flex; gap: 3px; }
.typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--gray-500); animation: typing 1s infinite ease-in-out; }
.typing i:nth-child(2) { animation-delay: 0.15s; }
.typing i:nth-child(3) { animation-delay: 0.3s; }
@keyframes typing { 0%, 80%, 100% { opacity: 0.3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
@media (prefers-reduced-motion: reduce) { .typing i { animation: none; } }
```

- [ ] **Step 7: Create `ChatPanel.tsx`**

Create `app/client/src/chat/ChatPanel.tsx`:

```tsx
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { GENIE_OFF_MESSAGE } from '../lib/appConfig';
import { useChat } from './chatStore';
import { GenieReply, followChip } from './GenieReply';
import { STARTERS } from './starters';
import { canSend, followUps } from './thread';

/** The right-hand chat: thread top to bottom, input pinned at the bottom, starters in an empty chat. */
export function ChatPanel() {
  const chat = useChat();
  const { thread, pending, genieOff, draft } = chat;
  const [input, setInput] = useState('');
  const [seenDraft, setSeenDraft] = useState(draft?.key);
  if (draft && draft.key !== seenDraft) {
    setSeenDraft(draft.key);
    setInput(draft.text);
  }
  const endRef = useRef<HTMLDivElement | null>(null);
  const last = thread.messages[thread.messages.length - 1];
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.messages.length, last]);

  const fu = followUps(thread);
  const submit = (text: string) => {
    if (!canSend(genieOff, pending, text)) return;
    chat.send(text);
    setInput('');
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  return (
    <aside
      aria-label="Ask the map"
      style={{ display: 'grid', gridTemplateRows: '54px 1fr auto', minHeight: 0, background: 'var(--white)', borderLeft: '1px solid var(--gray-300)' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--gray-300)' }}>
        <strong style={{ fontSize: '0.95rem' }}>Ask the map</strong>
        <button
          type="button"
          onClick={chat.newChat}
          disabled={thread.messages.length === 0}
          style={{ font: 'inherit', fontSize: '0.8125rem', background: 'none', border: 'none', color: 'var(--navy-900)', cursor: 'pointer', opacity: thread.messages.length === 0 ? 0.4 : 1 }}
        >
          New chat
        </button>
      </header>

      <div role="log" aria-live="polite" style={{ overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
        {genieOff ? (
          <p role="note" style={{ marginTop: 'auto', color: 'var(--gray-700)', fontSize: '0.875rem' }}>
            {GENIE_OFF_MESSAGE}
          </p>
        ) : thread.messages.length === 0 ? (
          <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Ask the map</h2>
            <p style={{ margin: 0, color: 'var(--gray-700)', fontSize: '0.9rem', lineHeight: 1.45 }}>
              Ask about chokepoints, ports, our six supply lanes or AIS visibility. Answers land on the map.
            </p>
            {STARTERS.map((q) => (
              <button key={q} type="button" onClick={() => submit(q)} style={{ ...followChip, fontSize: '0.875rem', padding: '10px 12px', background: 'var(--light)' }}>
                {q}
              </button>
            ))}
          </div>
        ) : (
          thread.messages.map((m) =>
            m.role === 'user' ? (
              <div
                key={m.id}
                style={{ alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--navy-900)', color: 'var(--white)', padding: '10px 13px', borderRadius: '14px 14px 4px 14px', fontSize: '0.9rem', lineHeight: 1.4 }}
              >
                {m.text}
              </div>
            ) : (
              <GenieReply key={m.id} msg={m} followUps={fu?.id === m.id ? fu.items : []} onFollowUp={submit} />
            )
          )
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} style={{ borderTop: '1px solid var(--gray-300)', padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, border: '1px solid var(--gray-300)', borderRadius: 12, padding: '6px 6px 6px 12px' }}>
          <textarea
            aria-label="Ask a question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={genieOff || pending}
            rows={1}
            placeholder={genieOff ? 'Genie is not configured' : pending ? 'Genie is answering' : 'Ask about ports, lanes or AIS visibility'}
            style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', font: 'inherit', fontSize: '0.9rem', padding: '6px 0', background: 'transparent', maxHeight: 120 }}
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSend(genieOff, pending, input)}
            style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: canSend(genieOff, pending, input) ? 'var(--lava-600)' : 'var(--gray-300)', color: 'var(--white)', cursor: 'pointer', fontSize: 16 }}
          >
            ➤
          </button>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)', marginTop: 6 }}>Enter to send. Shift+Enter for a new line.</div>
      </form>
    </aside>
  );
}
```

- [ ] **Step 8: Typecheck, test and commit**

Run: `npm run typecheck && npm test`
Expected: exit 0; all tests pass.

```bash
git add client/src/chat client/src/theme/tokens.css
git commit -m "feat: chat-style Genie panel with thread, starters and follow-ups

Co-authored-by: Isaac <no-reply@databricks.com>"
```

---

### Task 9: Map chrome (MapView hooks, layers card, legend, date slider, pill, popover)

**Files:**
- Modify: `app/client/src/map/MapView.tsx`
- Create: `app/client/src/map/legendItems.ts`, `app/client/src/map/MapLegend.tsx`, `app/client/src/map/AnswerPill.tsx`, `app/client/src/map/PlacePopover.tsx`, `app/client/src/shell/LayersCard.tsx`, `app/client/src/shell/DateSlider.tsx`
- Test: `app/client/src/map/__tests__/legendItems.test.ts`

**Interfaces:**
- Consumes: `MapDatum`, `Toggles` (Task 5); `fmtNum`, `fmtPct`; `fmtDate`, `monthTicks`, `toT`, `DAY` (`explore/dates.ts`); `pctColor`, `statusColor`, `rgbaCss` (`map/colors.ts`).
- Produces:
  - `ViewState.maxZoom?: number`; MapView props `onZoom?: (zoom: number) => void`, `onPickAt?: (d: MapDatum | null, x: number, y: number) => void`, `onHoverDatum?: (d: MapDatum | null) => void` (the existing `onPick` stays for the old pages until Task 10)
  - `type LegendItem = 'ramp' | 'lanes' | 'ais' | 'answer'`, `legendItems(t: Toggles, answerOn: boolean): LegendItem[]`
  - `<MapLegend toggles answerOn />`, `<AnswerPill question onClear />`, `<PlacePopover datum x y onAsk onClose />`, `<LayersCard toggles onChange />`, `<DateSlider start end date events onChange />`

- [ ] **Step 1: Write the failing legend test**

Create `app/client/src/map/__tests__/legendItems.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RESTING } from '../baseLayers';
import { legendItems } from '../legendItems';

describe('legendItems', () => {
  it('is one ramp at rest and grows only with the layers that are on', () => {
    expect(legendItems(RESTING, false)).toEqual(['ramp']);
    expect(legendItems({ chokepoints: false, ports: false, lanes: false, ais: false }, false)).toEqual([]);
    expect(legendItems({ chokepoints: false, ports: true, lanes: true, ais: true }, true)).toEqual(['ramp', 'lanes', 'ais', 'answer']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails, then implement**

Run: `npx vitest run client/src/map/__tests__/legendItems.test.ts`
Expected: FAIL, `Cannot find module '../legendItems'`.

Create `app/client/src/map/legendItems.ts`:

```ts
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
```

Run the test again. Expected: PASS.

- [ ] **Step 3: Extend `MapView.tsx`**

In `app/client/src/map/MapView.tsx`:

1. Replace `import type { MapDatum } from './layers';` with `import type { MapDatum } from './baseLayers';`.
2. Add `maxZoom?: number;` to `ViewState`, with the doc comment `/** Upper zoom bound for a bounds fit. */`.
3. Add to `Props`:

```ts
  /** Reports the zoom once at start and after every zoom change. */
  onZoom?: (zoom: number) => void;
  /** A click: the picked datum (null on empty map) and its pixel position in the map. */
  onPickAt?: (d: MapDatum | null, x: number, y: number) => void;
  /** The datum under the cursor, or null. */
  onHoverDatum?: (d: MapDatum | null) => void;
```

4. Destructure the new props in `MapView(...)` and keep them current: change the `cbs` ref to `useRef({ onViewStateChange, onPick, onZoom, onPickAt, onHoverDatum })` and the assignment below it to `cbs.current = { onViewStateChange, onPick, onZoom, onPickAt, onHoverDatum };`.
5. In the overlay `onHover`, after `setHover(...)`, add `cbs.current.onHoverDatum?.(isDatum(o) ? o : null);`.
6. Replace the overlay `onClick` body with:

```ts
        const o: unknown = info.object;
        const d = isDatum(o) ? o : null;
        cbs.current.onPickAt?.(d, info.x, info.y);
        if (d && (d.kind === 'port' || d.kind === 'chokepoint' || d.kind === 'lane')) {
          cbs.current.onPick?.({ kind: d.kind, name: d.name });
        }
```

7. After `map.on('moveend', ...)` registration, add:

```ts
    map.on('zoomend', () => cbs.current.onZoom?.(map.getZoom()));
    map.once('load', () => cbs.current.onZoom?.(map.getZoom()));
```

8. In both `map.fitBounds(...)` calls, add `maxZoom: viewState.maxZoom` to the options object.
9. Replace `TooltipBody` with:

```tsx
function TooltipBody({ d }: { d: MapDatum }) {
  const row = (k: string, v: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--gray-700)' }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
  switch (d.kind) {
    case 'port':
    case 'chokepoint':
      return (
        <>
          <strong>{d.name}</strong>
          {row('Of pre-war normal', fmtPct(d.pct))}
        </>
      );
    case 'lane':
      return (
        <>
          <strong>{d.laneNames && d.laneNames.length > 1 ? `${d.laneNames.length} lanes` : d.name}</strong>
          {d.laneNames && d.laneNames.length > 1 && <div>{d.laneNames.join(', ')}</div>}
          {row('Status', d.status ?? 'no data')}
        </>
      );
    case 'ais':
      return (
        <>
          <strong>AIS cell</strong>
          {row('Vessels heard', fmtNum(d.vessels))}
          <div style={{ color: 'var(--gray-700)' }}>Measures visibility, not traffic</div>
        </>
      );
    case 'answer':
      return (
        <>
          <div style={{ fontSize: '0.6875rem', color: 'var(--lava-600)', fontWeight: 700 }}>Genie answer</div>
          <strong>{d.label ?? d.name}</strong>
        </>
      );
    default:
      return <strong>{d.label ?? d.name}</strong>;
  }
}
```

Run: `npm run typecheck`. Expected: exit 0 (the old pages still pass `onPick`; their old datums read through the same fields).

- [ ] **Step 4: Create the map chrome components**

Create `app/client/src/shell/LayersCard.tsx`:

```tsx
import type { Toggles } from '../map/baseLayers';

const ROWS: { key: keyof Toggles; label: string }[] = [
  { key: 'chokepoints', label: 'Chokepoints' },
  { key: 'ports', label: 'Ports' },
  { key: 'lanes', label: 'Supply lanes' },
  { key: 'ais', label: 'AIS coverage' },
];

/** Floating top-left card with one switch per base layer. */
export function LayersCard({ toggles, onChange }: { toggles: Toggles; onChange: (t: Toggles) => void }) {
  return (
    <div
      role="group"
      aria-label="Layers"
      style={{ position: 'absolute', top: 14, left: 14, zIndex: 3, width: 186, padding: '10px 12px', background: 'var(--white)', border: '1px solid var(--gray-300)', borderRadius: 10, boxShadow: '0 2px 10px rgba(11, 32, 38, 0.08)' }}
    >
      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray-500)', marginBottom: 6 }}>Layers</div>
      {ROWS.map(({ key, label }) => {
        const on = toggles[key];
        return (
          <button
            key={key}
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => onChange({ ...toggles, [key]: !on })}
            style={{ all: 'unset', boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            {label}
            <span aria-hidden style={{ width: 30, height: 18, borderRadius: 999, background: on ? 'var(--navy-900)' : 'var(--gray-300)', position: 'relative', transition: 'background 0.15s' }}>
              <span style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: '50%', background: 'var(--white)', transition: 'left 0.15s' }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

Create `app/client/src/map/MapLegend.tsx`:

```tsx
import { pctColor, rgbaCss, statusColor } from './colors';
import type { Toggles } from './baseLayers';
import { legendItems } from './legendItems';

const ramp = `linear-gradient(to right, ${rgbaCss(pctColor(0))}, ${rgbaCss(pctColor(50))}, ${rgbaCss(pctColor(100))})`;
const STATUSES = ['Disrupted', 'Shifted to alternative', 'Degraded', 'Normal'];

/** Bottom-right key listing only the layers that are on (one line at rest). */
export function MapLegend({ toggles, answerOn }: { toggles: Toggles; answerOn: boolean }) {
  const items = legendItems(toggles, answerOn);
  if (items.length === 0) return null;
  return (
    <div
      aria-label="Map legend"
      style={{ position: 'absolute', right: 14, bottom: 34, zIndex: 3, display: 'grid', gap: 8, padding: '8px 12px', background: 'var(--white)', border: '1px solid var(--gray-300)', borderRadius: 10, fontSize: '0.75rem', color: 'var(--gray-700)', boxShadow: '0 2px 10px rgba(11, 32, 38, 0.08)' }}
    >
      {items.includes('ramp') && (
        <div>
          <div>Traffic vs pre-war normal</div>
          <div style={{ width: 150, height: 6, borderRadius: 3, background: ramp, margin: '4px 0 2px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 150, fontSize: '0.6875rem' }}>
            <span>0%</span>
            <span>50%</span>
            <span>100%+</span>
          </div>
        </div>
      )}
      {items.includes('lanes') && (
        <div style={{ display: 'grid', gap: 3 }}>
          {STATUSES.map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 3, borderRadius: 2, background: rgbaCss(statusColor(s)) }} />
              {s}
            </div>
          ))}
        </div>
      )}
      {items.includes('ais') && <div>AIS: share of a busy lane's visible vessels</div>}
      {items.includes('answer') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--lava-600)', boxShadow: '0 0 0 2px var(--white), 0 0 0 3px var(--lava-600)' }} />
          Genie answer
        </div>
      )}
    </div>
  );
}
```

Create `app/client/src/map/AnswerPill.tsx`:

```tsx
const MAX = 60;

/** Top-center pill naming the answer on the map, with a close button that clears it. */
export function AnswerPill({ question, onClear }: { question: string; onClear: () => void }) {
  const text = question.length > MAX ? `${question.slice(0, MAX - 1).trimEnd()}…` : question;
  return (
    <div
      role="status"
      style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 3, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 6px 14px', background: 'var(--white)', border: '1px solid var(--lava-600)', borderRadius: 10, fontSize: '0.875rem', boxShadow: '0 2px 10px rgba(11, 32, 38, 0.08)', maxWidth: '60%' }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--lava-600)', flexShrink: 0 }} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Showing: {text}</span>
      <button
        type="button"
        aria-label="Clear the answer from the map"
        onClick={onClear}
        style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'var(--gray-100)', color: 'var(--gray-700)', cursor: 'pointer', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}
```

Create `app/client/src/map/PlacePopover.tsx`:

```tsx
import { useEffect } from 'react';
import { fmtNum, fmtPct } from '../data/kpi';
import type { MapDatum } from './baseLayers';

interface Props {
  datum: MapDatum;
  x: number;
  y: number;
  /** Fills the chat input with a question about this place. */
  onAsk: (name: string) => void;
  onClose: () => void;
  /** False when Genie is not configured: the ask button is hidden. */
  canAsk: boolean;
}

/** Click card for a port or chokepoint: its numbers and an "Ask about" button. Esc closes it. */
export function PlacePopover({ datum, x, y, onAsk, onClose, canAsk }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const row = (k: string, v: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--gray-700)' }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
  return (
    <div
      role="dialog"
      aria-label={datum.name}
      style={{ position: 'absolute', left: x + 14, top: y - 10, zIndex: 4, width: 240, padding: '10px 12px', background: 'var(--white)', border: '1px solid var(--gray-300)', borderRadius: 10, fontSize: '0.8125rem', lineHeight: 1.45, boxShadow: '0 4px 14px rgba(11, 32, 38, 0.14)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
        <strong style={{ fontSize: '0.9rem' }}>
          {datum.name}
          {datum.country ? `, ${datum.country}` : ''}
        </strong>
        <button type="button" aria-label="Close" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray-700)' }}>
          ✕
        </button>
      </div>
      {row(datum.kind === 'chokepoint' ? 'Transits, 7-day avg' : 'Port calls, 7-day avg', fmtNum(datum.value7d, 1))}
      {datum.kind === 'port' && row('Pre-war baseline', fmtNum(datum.baseline, 1))}
      {row('Of pre-war normal', fmtPct(datum.pct))}
      {canAsk && (
        <button
          type="button"
          onClick={() => onAsk(datum.name)}
          style={{ marginTop: 8, width: '100%', font: 'inherit', fontSize: '0.8125rem', fontWeight: 500, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--lava-600)', background: '#FFF4F2', color: 'var(--navy-900)', cursor: 'pointer' }}
        >
          Ask about {datum.name}
        </button>
      )}
    </div>
  );
}
```

Create `app/client/src/shell/DateSlider.tsx`:

```tsx
import type { ConflictEvent } from '../data/types';
import { DAY, fmtDate, monthTicks, toT } from '../explore/dates';

interface Props {
  start: string;
  end: string;
  date: string;
  events: ConflictEvent[];
  onChange: (date: string) => void;
}

/** Slim day slider along the bottom of the map, with clickable war-event ticks and month labels. */
export function DateSlider({ start, end, date, events, onChange }: Props) {
  const t0 = toT(start);
  const days = Math.max(1, Math.round((toT(end) - t0) / DAY));
  const idx = Math.min(days, Math.max(0, Math.round((toT(date) - t0) / DAY)));
  const pos = (d: string) => `${(100 * Math.round((toT(d) - t0) / DAY)) / days}%`;
  const inRange = events.filter((e) => e.event_date.slice(0, 10) >= start && e.event_date.slice(0, 10) <= end);
  const iso = (i: number) => new Date(t0 + i * DAY).toISOString().slice(0, 10);

  return (
    <section
      aria-label="Date"
      style={{ height: 56, display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', background: 'var(--white)', borderTop: '1px solid var(--gray-300)' }}
    >
      <div style={{ fontWeight: 700, fontSize: '0.875rem', width: 104, flexShrink: 0 }}>{fmtDate(date)}</div>
      <div style={{ position: 'relative', flex: 1, height: 34 }}>
        {inRange.map((e) => (
          <button
            key={`${e.event_date}-${e.event}`}
            type="button"
            title={`${fmtDate(e.event_date)}: ${e.event}`}
            aria-label={`${fmtDate(e.event_date)}: ${e.event}`}
            onClick={() => onChange(e.event_date.slice(0, 10))}
            style={{ position: 'absolute', top: 2, left: pos(e.event_date), width: 2, height: 11, padding: 0, border: 'none', borderRadius: 1, background: 'var(--lava-600)', opacity: 0.8, cursor: 'pointer', transform: 'translateX(-1px)' }}
          />
        ))}
        <input
          type="range"
          aria-label="Selected date"
          min={0}
          max={days}
          step={1}
          value={idx}
          onChange={(e) => onChange(iso(Number(e.target.value)))}
          style={{ position: 'absolute', top: 2, left: 0, right: 0, width: '100%', margin: 0, accentColor: 'var(--navy-900)' }}
        />
        <div style={{ position: 'absolute', top: 20, left: 0, right: 0, fontSize: '0.66rem', color: 'var(--gray-500)' }}>
          {monthTicks(start, end).map((m) => (
            <span key={m} style={{ position: 'absolute', left: pos(m), transform: 'translateX(-50%)' }}>
              {new Date(toT(m)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Typecheck, test and commit**

Run: `npm run typecheck && npm test`
Expected: exit 0; all tests pass.

```bash
git add client/src/map client/src/shell/LayersCard.tsx client/src/shell/DateSlider.tsx
git commit -m "feat: map chrome for the new screen (layers card, legend, slider, pill, popover)

Co-authored-by: Isaac <no-reply@databricks.com>"
```

---

### Task 10: New shell, tour bar, How it works, and removal of the old UI

**Files:**
- Create: `app/client/src/shell/headline.ts`, `app/client/src/map/useMapState.ts`, `app/client/src/map/MapScreen.tsx`, `app/client/src/tour/TourBar.tsx`, `app/client/src/shell/HowItWorks.tsx`
- Modify: `app/client/src/shell/TopBar.tsx` (rewrite), `app/client/src/App.tsx` (rewrite), `app/client/src/genie/genieLayer.ts` (drop the multi-layer entry model), `app/client/src/data/kpi.ts` (drop `recOn`, `riskSources`), their tests
- Delete: `client/src/story/` (whole directory), `client/src/explore/ExplorePage.tsx`, `client/src/explore/LeftRail.tsx`, `client/src/explore/TimeScrubber.tsx`, `client/src/decisions/` (whole directory), `client/src/genie/GeniePanel.tsx`, `client/src/genie/AnswerCard.tsx`, `client/src/genie/GenieProvider.tsx`, `client/src/genie/genieStore.ts`, `client/src/genie/useGenieMap.ts`, `client/src/map/layers.ts`, `client/src/map/__tests__/layers.test.ts`, `client/src/map/Legend.tsx`
- Test: `app/client/src/shell/__tests__/headline.test.ts`

**Interfaces:**
- Consumes: everything above; `hormuzOn`, `lanesOn`, `disruptedCount`, `fmtPct` (`data/kpi.ts`); `scrubEnd`, `SCRUB_START` (`explore/dates.ts`); `FreshnessBadge`; `ErrorBanner`; `ArchitecturePage` (default export, lazy).
- Produces: `headline(ds: Dataset): { hormuzPct: number | null; disrupted: number | null; lanes: number }`, `headlineText(h): string`; `useMapState(): MapState`; `RESTING_VIEW: ViewState`; `<MapScreen m />`, `<TourBar ... />`, `<HowItWorks open onClose />`, `<TopBar tourOn onTour onHow />`.

- [ ] **Step 1: Write the failing headline test**

Create `app/client/src/shell/__tests__/headline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../../data/loadAll';
import type { ChokepointDay, LaneDay } from '../../data/types';
import { headline, headlineText } from '../headline';

const choke = (date: string, pct: number): ChokepointDay =>
  ({ date, chokepoint: 'Strait of Hormuz', pct_of_baseline_total: pct, n_total_7d_avg: 4 }) as ChokepointDay;
const lane = (lane_id: string, status: LaneDay['status']): LaneDay => ({ date: '2026-10-09', lane_id, status }) as LaneDay;

describe('headline', () => {
  it('uses the latest Hormuz percent and the latest lane statuses', () => {
    const ds = {
      ...emptyDataset(),
      chokepoints: [choke('2026-10-01', 9), choke('2026-10-11', 6.1)],
      lanes: [lane('L1', 'Disrupted'), lane('L2', 'Disrupted'), lane('L3', 'Shifted to alternative')],
    };
    const h = headline(ds);
    expect(h).toEqual({ hormuzPct: 6.1, disrupted: 2, lanes: 3 });
    expect(headlineText(h)).toBe('Hormuz at 6% of normal · 2 of 3 lanes disrupted');
  });

  it('says no data before anything loads', () => {
    expect(headlineText(headline(emptyDataset()))).toBe('Hormuz: no data');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails, then implement `headline.ts`**

Run: `npx vitest run client/src/shell/__tests__/headline.test.ts`
Expected: FAIL, `Cannot find module '../headline'`.

Create `app/client/src/shell/headline.ts`:

```ts
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
```

Run the test again. Expected: PASS (2 tests).

- [ ] **Step 3: Create `useMapState.ts`**

Create `app/client/src/map/useMapState.ts`:

```ts
import { useCallback, useState } from 'react';
import { useData } from '../data/DataContext';
import { resolveSceneDate } from '../tour/copy';
import { STEPS, stepCamera } from '../tour/steps';
import { nextStep, prevStep, startTour, type TourState } from '../tour/tourState';
import { RESTING, type Toggles } from './baseLayers';
import type { ViewState } from './MapView';

/** Suez, Bab el-Mandeb and Hormuz in frame, clear of the layers card on the left. */
export const RESTING_VIEW: ViewState = {
  longitude: 46,
  latitude: 22,
  zoom: 4,
  bounds: [
    [32.4, 12.5],
    [57.2, 30.8],
  ],
  boundsPadding: { top: 60, bottom: 60, left: 220, right: 120 },
};

/** Map toggles, date, camera and the tour, owned by App so the top bar can start and stop the tour. */
export function useMapState() {
  const { dataset } = useData();
  const [toggles, setToggles] = useState<Toggles>(RESTING);
  /** null means "latest". */
  const [date, setDate] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>(RESTING_VIEW);
  const [tour, setTour] = useState<TourState | null>(null);

  const apply = useCallback(
    (step: number) => {
      const s = STEPS[step];
      setToggles(s.toggles);
      setDate(resolveSceneDate(s.date, dataset));
      setView(stepCamera(s, dataset));
    },
    [dataset]
  );

  const exitTour = useCallback(() => {
    if (!tour) return;
    // Fresh objects, so MapView refits even when the saved view is the same as before.
    setToggles({ ...tour.snapshot.toggles });
    setDate(tour.snapshot.date);
    setView({ ...tour.snapshot.view });
    setTour(null);
  }, [tour]);

  const beginTour = useCallback(() => {
    setTour(startTour({ toggles, date, view }));
    apply(0);
  }, [toggles, date, view, apply]);

  const next = useCallback(() => {
    if (!tour) return;
    const t = nextStep(tour);
    if (!t) return exitTour();
    setTour(t);
    apply(t.step);
  }, [tour, apply, exitTour]);

  const back = useCallback(() => {
    if (!tour) return;
    const t = prevStep(tour);
    setTour(t);
    apply(t.step);
  }, [tour, apply]);

  return { toggles, setToggles, date, setDate, view, setView, tour, beginTour, nextStep: next, prevStep: back, exitTour };
}

export type MapState = ReturnType<typeof useMapState>;
```

- [ ] **Step 4: Create `TourBar.tsx` and `HowItWorks.tsx`**

Create `app/client/src/tour/TourBar.tsx`:

```tsx
import type { CSSProperties } from 'react';
import type { Dataset } from '../data/types';
import { fmtDate } from '../explore/dates';
import { STEPS, stepCaption } from './steps';

const btn: CSSProperties = { font: 'inherit', fontSize: '0.875rem', fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--gray-300)', background: 'var(--white)', color: 'var(--navy-900)', cursor: 'pointer' };

interface Props {
  step: number;
  dataset: Dataset;
  date: string;
  canAsk: boolean;
  onAsk: (question: string) => void;
  onBack: () => void;
  onNext: () => void;
  onExit: () => void;
}

/** Slim caption card along the bottom of the map for the current tour step. */
export function TourBar({ step, dataset, date, canAsk, onAsk, onBack, onNext, onExit }: Props) {
  const s = STEPS[step];
  const event = s.event?.(dataset, date);
  const last = step === STEPS.length - 1;
  return (
    <section
      aria-label={`Tour step ${step + 1} of ${STEPS.length}`}
      style={{ position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 3, width: 'min(660px, calc(100% - 420px))', minWidth: 460, display: 'grid', gap: 8, padding: '14px 16px', background: 'var(--white)', border: '1px solid var(--gray-300)', borderRadius: 12, boxShadow: '0 4px 16px rgba(11, 32, 38, 0.14)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--gray-500)' }}>
        <span>
          Tour · step {step + 1} of {STEPS.length}
        </span>
        <span aria-hidden style={{ display: 'flex', gap: 5 }}>
          {STEPS.map((x, i) => (
            <i key={x.id} style={{ width: 7, height: 7, borderRadius: '50%', background: i === step ? 'var(--lava-600)' : 'var(--gray-300)' }} />
          ))}
        </span>
      </div>
      <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{s.title}</h2>
      <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.45, color: 'var(--gray-700)' }}>{stepCaption(s, dataset, date)}</p>
      {event && (
        <a href={event.source_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8125rem', color: 'var(--navy-900)' }}>
          {fmtDate(event.event_date)}: {event.event}
        </a>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" onClick={() => onAsk(s.question)} disabled={!canAsk} style={{ ...btn, background: 'var(--lava-600)', borderColor: 'var(--lava-600)', color: 'var(--white)', opacity: canAsk ? 1 : 0.5 }}>
          Ask Genie this
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onBack} disabled={step === 0} style={{ ...btn, opacity: step === 0 ? 0.5 : 1 }}>
          Back
        </button>
        <button type="button" onClick={onNext} style={btn}>
          {last ? 'Finish' : 'Next'}
        </button>
        <button type="button" onClick={onExit} style={{ ...btn, border: 'none', background: 'none' }}>
          Exit
        </button>
      </div>
    </section>
  );
}
```

Create `app/client/src/shell/HowItWorks.tsx`:

```tsx
import { lazy, Suspense, useEffect } from 'react';

// React Flow and html-to-image load in their own chunk, only when the modal opens.
const ArchitecturePage = lazy(() => import('../architecture/ArchitecturePage'));

/** The architecture diagram in a modal. Esc or a backdrop click closes it. */
export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How it works"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(11, 32, 38, 0.45)', display: 'grid', placeItems: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: '92vw', height: '88vh', background: 'var(--light)', borderRadius: 14, overflow: 'auto', boxShadow: '0 12px 40px rgba(11, 32, 38, 0.3)' }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{ position: 'absolute', top: 12, right: 12, zIndex: 2, width: 32, height: 32, borderRadius: 8, border: '1px solid var(--gray-300)', background: 'var(--white)', cursor: 'pointer' }}
        >
          ✕
        </button>
        <Suspense fallback={<p role="status" style={{ padding: 24 }}>Loading the architecture diagram</p>}>
          <ArchitecturePage />
        </Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `MapScreen.tsx`**

Create `app/client/src/map/MapScreen.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '../chat/chatStore';
import { useData } from '../data/DataContext';
import { SCRUB_START, scrubEnd } from '../explore/dates';
import { featureBounds } from '../genie/answerFeatures';
import { genieQuestionFor } from '../genie/genieLayer';
import { DateSlider } from '../shell/DateSlider';
import { LayersCard } from '../shell/LayersCard';
import { TOUR_PADDING_BOTTOM } from '../tour/steps';
import { TourBar } from '../tour/TourBar';
import { AnswerPill } from './AnswerPill';
import { buildAnswerLayers } from './answerLayer';
import { buildBaseLayers, type MapDatum } from './baseLayers';
import { MapLegend } from './MapLegend';
import { MapView, type ViewState } from './MapView';
import { PlacePopover } from './PlacePopover';
import type { MapState } from './useMapState';

const ANSWER_PADDING = { top: 80, bottom: 80, left: 230, right: 200 };
const ANSWER_MAX_ZOOM = 7;

/** The map column: base layers, the Genie answer, floating cards, the date slider and the tour bar. */
export function MapScreen({ m }: { m: MapState }) {
  const { dataset, loading } = useData();
  const chat = useChat();
  const [zoom, setZoom] = useState(4);
  const [popover, setPopover] = useState<{ d: MapDatum; x: number; y: number } | null>(null);
  const end = useMemo(() => scrubEnd(dataset), [dataset]);
  const date = m.date ?? end;
  const active = chat.active;

  const layers = useMemo(
    () => [
      ...buildBaseLayers({ dataset, date, visible: m.toggles, zoom, dimmed: !!active }),
      ...(active ? buildAnswerLayers({ kind: active.spec.kind, features: active.features, highlightRow: chat.hoverRow }) : []),
    ],
    [dataset, date, m.toggles, zoom, active, chat.hoverRow]
  );

  // A new answer flies the camera to it; clearing it flies back to where the reader was.
  const saved = useRef<ViewState | null>(null);
  const shownId = useRef<string | null>(null);
  const { view, setView } = m;
  useEffect(() => {
    const id = active?.id ?? null;
    if (id === shownId.current) return;
    shownId.current = id;
    if (active) {
      const b = featureBounds(active.features);
      if (!b) return;
      if (!saved.current) saved.current = view;
      setView({ ...view, bounds: b, boundsPadding: ANSWER_PADDING, maxZoom: ANSWER_MAX_ZOOM });
    } else if (saved.current) {
      setView({ ...saved.current });
      saved.current = null;
    }
  }, [active, view, setView]);

  const onPickAt = (d: MapDatum | null, x: number, y: number) => {
    if (d?.kind === 'answer') {
      if (d.rowIndex != null) chat.setFocusRow(d.rowIndex);
      setPopover(null);
    } else if (d && (d.kind === 'port' || d.kind === 'chokepoint')) {
      setPopover({ d, x, y });
    } else {
      setPopover(null);
    }
  };
  const onHoverDatum = (d: MapDatum | null) => {
    if (d?.kind === 'answer') chat.setHoverRow(d.rowIndex ?? null);
    else if (chat.hoverRow !== null) chat.setHoverRow(null);
  };

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr 56px', minHeight: 0, minWidth: 0 }}>
      <div style={{ position: 'relative', minHeight: 0 }}>
        <MapView
          layers={layers}
          viewState={view}
          padding={m.tour ? { bottom: TOUR_PADDING_BOTTOM } : undefined}
          onViewStateChange={setView}
          onZoom={setZoom}
          onPickAt={onPickAt}
          onHoverDatum={onHoverDatum}
        />
        <LayersCard toggles={m.toggles} onChange={m.setToggles} />
        {active && <AnswerPill question={active.question} onClear={chat.clear} />}
        {!m.tour && <MapLegend toggles={m.toggles} answerOn={!!active} />}
        {popover && (
          <PlacePopover
            datum={popover.d}
            x={popover.x}
            y={popover.y}
            canAsk={!chat.genieOff}
            onAsk={(name) => {
              chat.setDraft(genieQuestionFor(name));
              setPopover(null);
            }}
            onClose={() => setPopover(null)}
          />
        )}
        {m.tour && (
          <TourBar
            step={m.tour.step}
            dataset={dataset}
            date={date}
            canAsk={!chat.genieOff && !chat.pending}
            onAsk={chat.send}
            onBack={m.prevStep}
            onNext={m.nextStep}
            onExit={m.exitTour}
          />
        )}
        {loading && (
          <div role="status" style={{ position: 'absolute', bottom: 12, left: 14, zIndex: 3, background: 'var(--white)', border: '1px solid var(--gray-300)', borderRadius: 8, padding: '6px 10px', fontSize: '0.8125rem' }}>
            Loading data
          </div>
        )}
      </div>
      <DateSlider start={SCRUB_START} end={end} date={date} events={dataset.events} onChange={m.setDate} />
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `TopBar.tsx` and `App.tsx`**

Replace `app/client/src/shell/TopBar.tsx` with:

```tsx
import type { CSSProperties } from 'react';
import logo from '../assets/databricks-logo.svg';
import { useData } from '../data/DataContext';
import { FreshnessBadge } from './FreshnessBadge';
import { headline, headlineText } from './headline';

const btn: CSSProperties = { font: 'inherit', fontSize: '0.875rem', fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--gray-300)', background: 'var(--white)', color: 'var(--navy-900)', cursor: 'pointer', whiteSpace: 'nowrap' };

interface Props {
  tourOn: boolean;
  onTour: () => void;
  onHow: () => void;
}

export function TopBar({ tourOn, onTour, onHow }: Props) {
  const { dataset, loading } = useData();
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '0 20px', height: 60, borderBottom: '1px solid var(--gray-300)', background: 'var(--white)' }}>
      <img src={logo} alt="Databricks" style={{ display: 'block', height: 22, width: 'auto', flexShrink: 0 }} />
      <h1 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, whiteSpace: 'nowrap' }}>The Invisible Strait</h1>
      <span aria-hidden style={{ width: 1, height: 24, background: 'var(--gray-300)' }} />
      <span style={{ fontSize: '0.875rem', color: 'var(--gray-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {loading ? 'Loading' : headlineText(headline(dataset))}
      </span>
      <span style={{ flex: 1 }} />
      <FreshnessBadge />
      <button type="button" onClick={onTour} aria-pressed={tourOn} style={tourOn ? { ...btn, background: 'var(--navy-900)', borderColor: 'var(--navy-900)', color: 'var(--white)' } : btn}>
        {tourOn ? '✕ Exit tour' : '▶ Tour'}
      </button>
      <button type="button" onClick={onHow} style={{ ...btn, border: 'none', background: 'none' }}>
        How it works
      </button>
    </header>
  );
}
```

Replace `app/client/src/App.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { ChatPanel } from './chat/ChatPanel';
import { ChatProvider } from './chat/ChatProvider';
import { DataProvider } from './data/DataContext';
import { AppConfigContext, fetchAppConfig, type AppConfig } from './lib/appConfig';
import { MapScreen } from './map/MapScreen';
import { useMapState } from './map/useMapState';
import { ErrorBanner } from './shell/ErrorBanner';
import { HowItWorks } from './shell/HowItWorks';
import { TopBar } from './shell/TopBar';

function Screen() {
  const m = useMapState();
  const [how, setHow] = useState(false);
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', height: '100vh' }}>
      <TopBar tourOn={!!m.tour} onTour={m.tour ? m.exitTour : m.beginTour} onHow={() => setHow(true)} />
      <ErrorBanner />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', minHeight: 0 }}>
        <MapScreen m={m} />
        <ChatPanel />
      </div>
      <HowItWorks open={how} onClose={() => setHow(false)} />
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    fetchAppConfig()
      .then(setConfig)
      .catch((e: unknown) => setConfigError(String(e)));
  }, []);

  if (configError) return <p role="alert" style={{ padding: 'var(--space-3)' }}>Could not load app config: {configError}</p>;
  return (
    <AppConfigContext.Provider value={config}>
      <DataProvider>
        <ChatProvider>
          <Screen />
        </ChatProvider>
      </DataProvider>
    </AppConfigContext.Provider>
  );
}
```

- [ ] **Step 7: Delete the old UI and trim the leftovers**

```bash
git rm -r -q client/src/story client/src/decisions
git rm -q client/src/explore/ExplorePage.tsx client/src/explore/LeftRail.tsx client/src/explore/TimeScrubber.tsx \
  client/src/genie/GeniePanel.tsx client/src/genie/AnswerCard.tsx client/src/genie/GenieProvider.tsx \
  client/src/genie/genieStore.ts client/src/genie/useGenieMap.ts \
  client/src/map/layers.ts client/src/map/__tests__/layers.test.ts client/src/map/Legend.tsx
```

Then:
1. In `client/src/genie/genieLayer.ts` delete `GenieEntry`, `MAX_GENIE_LAYERS`, `turnOn`, `GenieMapLayer` and `mapLayersOf` (keep `detect`, `toNum`, `toH3Hex`, `nameColumn`, the `PLACE_*`/`ROW_INDEX` constants, `MAX_LAYER_ROWS`, `TABLE_ROWS`, `cellText`, `genieQuestionFor`, `mapRowsCaption`). In `client/src/genie/__tests__/genieLayer.test.ts` delete the `describe` blocks and imports for the removed names.
2. In `client/src/data/kpi.ts` delete `recOn` and `riskSources`, and remove the now-unused `LaneRec` type import. In `client/src/data/__tests__/kpi.test.ts` delete their tests and imports.
3. Run `grep -rn "story/\|decisions/\|GenieProvider\|useGenieMap\|genieStore\|map/layers'\|from './layers'\|LeftRail\|TimeScrubber\|ExplorePage\|/Legend'" client/src` and fix any remaining importer (there should be none outside deleted files).

- [ ] **Step 8: Verify and commit**

Run: `npm run typecheck && npm test && NODE_OPTIONS=--max-old-space-size=8192 npm run build`
Expected: typecheck exit 0, all tests pass, build exit 0 with an `ArchitecturePage-*.js` lazy chunk listed.

Run: `npx eslint client/src/chat client/src/map client/src/tour client/src/shell client/src/App.tsx`
Expected: no errors in these paths (generated `shared/appkit-types` files are out of scope).

```bash
git add -A client/src
git commit -m "feat: Genie-first screen replaces Story and Explore

Co-authored-by: Isaac <no-reply@databricks.com>"
```

---

### Task 11: Genie instructions, live verification, deploy, screenshots and README

This task touches the live DEFAULT workspace (sandbox) and is run by the controller, not a subagent. Read real values from `app/.env` (`DATABRICKS_WAREHOUSE_ID`, `DATABRICKS_GENIE_SPACE_ID`); never write them into tracked files.

**Files:**
- Modify: `genie/space_config.py` (one instruction line), `tests/test_genie_config.py`
- Modify: `app/client/src/chat/starters.ts` (only if a starter fails the live check)
- Modify: `README.md` (app section, screenshots), `docs/img/` (new `live-rest.png`, `live-answer.png`, `live-tour.png`, `live-how.png`; remove `live-story-*.png`, `live-explore.png`, `live-genie.png`, `live-architecture.png` once README no longer references them)

- [ ] **Step 1: Write the failing instruction test**

Append to `tests/test_genie_config.py`:

```python
def test_instructions_ask_for_place_names_with_coordinates():
    from genie.space_config import instructions_for

    text = instructions_for()
    assert "return the port or chokepoint name with lat and lon" in text
```

Run (repo root): `uv run --no-project --with pytest --with websockets --with requests pytest -q tests/test_genie_config.py`
Expected: FAIL on the new test.

- [ ] **Step 2: Update the instruction**

In `genie/space_config.py`, replace the line

```
- For questions about places, return lat and lon (ports, chokepoints) or h3_res5 (AIS cells) so the app can map the answer.
```

with

```
- For questions about places, return the port or chokepoint name with lat and lon (ports, chokepoints), or h3_res5 (AIS cells), so the app can map the answer.
```

Run the same pytest command, then the full suite: `uv run --no-project --with pytest --with websockets --with requests pytest -q`. Expected: all pass.

```bash
git add genie/space_config.py tests/test_genie_config.py
git commit -m "feat: Genie space asks for place names with coordinates

Co-authored-by: Isaac <no-reply@databricks.com>"
```

- [ ] **Step 3: Deploy (controller)**

From the repo root, with the four vars from `app/.env`:

```bash
set -a && . app/.env && set +a
V=(--var="catalog=jdub_demo" --var="schedule_pause_status=UNPAUSED" --var="warehouse_id=$DATABRICKS_WAREHOUSE_ID" --var="genie_space_id=$DATABRICKS_GENIE_SPACE_ID")
databricks bundle plan "${V[@]}" --profile DEFAULT | tail -3
```

Expected: `0 to add, 1 to change, 0 to delete` (the app). Stop if any delete appears. Then:

```bash
databricks bundle deploy "${V[@]}" --profile DEFAULT
databricks bundle run hormuz_map "${V[@]}" --profile DEFAULT
uv run --no-project python -m genie.build_space --profile DEFAULT --catalog jdub_demo --schema hormuz --warehouse-id "$DATABRICKS_WAREHOUSE_ID"
```

Expected: "App started successfully" and build_space exits 0.

- [ ] **Step 4: Check every starter against the live space (controller)**

Write this script to `/tmp/hz-check/starters.sh` (outside the repo) and run it:

```bash
#!/usr/bin/env bash
set -euo pipefail
U=$(databricks apps get hormuz-map --profile DEFAULT -o json | jq -r .url)
TOK=$(databricks auth token --profile DEFAULT -o json | jq -r .access_token)
node -e "const s=require('fs').readFileSync('app/client/src/chat/starters.ts','utf8');console.log(JSON.stringify([...s.matchAll(/'([^']+\?)'/g)].map(m=>m[1])))" > /tmp/hz-check/q.json
jq -r '.[]' /tmp/hz-check/q.json | while read -r q; do
  curl -s -N --max-time 240 -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -X POST \
    -d "$(jq -n --arg c "$q" '{content:$c}')" "$U/api/genie/default/messages" > /tmp/hz-check/out.sse
  python3 - "$q" <<'EOF'
import json, sys
cols = []
for l in open('/tmp/hz-check/out.sse'):
    if l.startswith('data:'):
        d = json.loads(l[5:])
        if d.get('type') == 'query_result':
            cols = [c['name'].lower() for c in d['data']['manifest']['schema']['columns']]
mappable = bool({'lat', 'lon'} <= set(cols) or any(c.startswith('h3') for c in cols) or 'lane_id' in cols
                 or any(c in ('port', 'chokepoint', 'primary_port', 'alternative_port') for c in cols))
print(('OK  ' if mappable else 'FAIL'), sys.argv[1], cols)
EOF
done
```

Run from the repo root: `bash /tmp/hz-check/starters.sh`
Expected: four `OK` lines. For any `FAIL`, replace that starter in `app/client/src/chat/starters.ts` with a question that returns `lat`/`lon` or `lane_id` (for example "Which Gulf ports are below half their pre-war port calls?"), rerun until all four pass, redeploy (Step 3 commands), and commit:

```bash
git add app/client/src/chat/starters.ts
git commit -m "fix: starters that return mappable answers

Co-authored-by: Isaac <no-reply@databricks.com>"
```

- [ ] **Step 5: Live screenshots (controller)**

Use Playwright with system Chrome and a CLI bearer token routed to the app origin only (see the memory note `reference_apps_browser_test_bearer`). In a scratch dir outside the repo (`/tmp/hz-shots`, with `npm i playwright-core`), capture at 1440 by 900:
1. `live-rest.png`: the app after data loads (wait for the text "Hormuz at").
2. `live-answer.png`: click the first starter, wait up to 180 s for "On the map:", wait 2 s, capture.
3. Hover the first table row (open "Table", hover `tbody tr:first-child`), capture as `live-answer-hover.png` (kept in `/tmp`, not committed).
4. `live-tour.png`: click "New chat", click "Tour", then "Next" once, wait 3 s, capture step 2.
5. Capture each remaining tour step to `/tmp` for review.
6. `live-how.png`: exit the tour, click "How it works", wait for the diagram, capture.

Review every capture before going on. Check each one:
- The resting map shows only labeled chokepoints and a one-line legend.
- The answer state shows Lava marks with labels, a "Showing" pill, a dimmed base map, and the chat thread with the user bubble on the right.
- The tour caption does not hide the step's subject.
- Fix any defect in code, then rerun Steps 3 and 5.

Copy the four committed captures into `docs/img/`.

- [ ] **Step 6: README**

In `README.md`, replace the app paragraph that begins "It has three tabs (Story, Explore, Architecture)" and its bullets with:

```markdown
It is one screen: a map and a chat with Genie.

- **Ask the map:** ask a question in plain English. Genie answers in the chat, and the places, H3 cells or lanes in the answer are drawn on the map in Lava; the rest of the map dims. Click an older reply's map chip to show its answer again, or close the "Showing" pill to clear it. Hovering a table row highlights its mark.
- **Layers:** chokepoints (on at rest), ports, supply lanes and AIS coverage, each toggled on its own. The date slider along the bottom moves every layer through 2026, with the war events marked.
- **Tour:** five short steps (your exposure, the strait closes, where traffic went, lanes with no way around, what you cannot see). Each step has an "Ask Genie this" button. Exiting returns the map to where it was.
- **How it works:** the architecture diagram.
```

Replace the screenshot lines (`docs/img/live-story-1.png`, `docs/img/live-explore.png` and any other `live-*` image lines) with:

```markdown
![Resting map](docs/img/live-rest.png)
![A Genie answer on the map](docs/img/live-answer.png)
![Tour step 2](docs/img/live-tour.png)
![How it works](docs/img/live-how.png)
```

Remove any README sentence that mentions recommendation chips on Story scenes or the left rail (the decision layer section stays; say "Genie answers recommendation questions from `gold_lane_recommendation`" instead). Then delete the unreferenced images:

```bash
grep -o 'docs/img/[a-z0-9-]*\.png' README.md | sort -u > /tmp/hz-check/used.txt
ls docs/img/*.png | while read -r f; do grep -qx "$f" /tmp/hz-check/used.txt || git rm -q "$f"; done
grep -nP '[\x{2013}\x{2014}]' README.md || echo "no dashes"
```

Expected: "no dashes".

```bash
git add README.md docs/img
git commit -m "docs: README and screenshots for the Genie-first screen

Co-authored-by: Isaac <no-reply@databricks.com>"
```

- [ ] **Step 7: Final checks before merge (controller)**

From `app/`: `npm test && npm run typecheck && NODE_OPTIONS=--max-old-space-size=8192 npm run build`. From the repo root: the pytest suite. Then the public-repo scan over the branch:

```bash
set -a && . app/.env && set +a
for pat in "$DATABRICKS_WAREHOUSE_ID" "$DATABRICKS_GENIE_SPACE_ID" "fe-vm-" "databricksapps.com" "npm-proxy"; do
  echo "$(git log -p main..HEAD -G "$pat" | grep -c "^+.*$pat") $pat"
done
grep -c "npm-proxy" app/package-lock.json || true
```

Expected: 0 for the ids and `fe-vm-`; `databricksapps.com` only in the README placeholder line; 0 `npm-proxy`. Merging to `main` (squash) and pushing wait for the user.
