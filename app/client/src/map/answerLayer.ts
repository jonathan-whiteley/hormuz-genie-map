import type { Layer } from '@deck.gl/core';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { ColumnLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { LABEL_LIMIT, type AnswerFeature } from '../genie/answerFeatures';
import { fmtFrameDate, frameOn, type TimeSeries } from '../genie/timeSeries';
import { curvePath, type MapDatum } from './baseLayers';
import { LAVA, NAVY, type RGBA } from './colors';
import { answerElevation, answerLabelZ } from './answerScale';
import { COLUMN_RADIUS_PX, LABEL_ON_TOP, columnTransitions, elevationScaleFor } from './columns';

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
  /** When set, the answer is drawn as Lava columns for the frame on or before `date`. */
  series?: TimeSeries | null;
  date?: string;
  /** Camera zoom rounded to ZOOM_STEP, for column heights and label altitude. */
  zoom?: number;
  reducedMotion?: boolean;
}

const fmtNum = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });

export function seriesLabel(series: TimeSeries, name: string, date: string, value: number | null): string {
  const v = value === null ? 'no data' : `${fmtNum(value)}${series.perDay ? ' a day' : ''}`;
  return `${name} · ${fmtFrameDate(series, date)} · ${v}`;
}

interface SeriesDatum extends MapDatum {
  elevation: number;
  value: number | null;
}

function seriesLayers(series: TimeSeries, date: string, zoom: number, highlightRow: number | null, reduced: boolean): Layer[] {
  const { date: at, values } = frameOn(series, date);
  if (!at) return [];
  const data: SeriesDatum[] = values.flatMap(({ place, frame }): SeriesDatum[] =>
    frame === null
      ? []
      : [
          {
            kind: 'answer',
            name: place.name,
            key: place.key,
            position: place.position,
            rowIndex: frame.rowIndex,
            value: frame.value,
            elevation: answerElevation(series, frame.value),
            label: seriesLabel(series, place.name, at, frame.value),
          },
        ]
  );
  const hot = (d: MapDatum) => highlightRow !== null && d.rowIndex === highlightRow;
  return [
    new ScatterplotLayer<SeriesDatum>({
      id: 'answer-halo',
      data,
      getPosition: (d) => d.position ?? [0, 0],
      getRadius: (d) => (hot(d) ? COLUMN_RADIUS_PX.chokepoint + 9 : COLUMN_RADIUS_PX.chokepoint + 6),
      radiusUnits: 'pixels',
      getFillColor: [255, 255, 255, 235],
      stroked: true,
      getLineColor: [...LAVA, 255],
      lineWidthUnits: 'pixels',
      getLineWidth: 1.5,
      pickable: true,
      updateTriggers: { getRadius: highlightRow },
    }),
    new ColumnLayer<SeriesDatum>({
      id: 'answer-columns',
      data,
      diskResolution: 16,
      radius: COLUMN_RADIUS_PX.chokepoint,
      radiusUnits: 'pixels',
      extruded: true,
      flatShading: true,
      elevationScale: elevationScaleFor(zoom),
      getPosition: (d) => d.position ?? [0, 0],
      getElevation: (d) => d.elevation,
      getFillColor: [...LAVA, 255],
      transitions: columnTransitions(reduced),
      pickable: true,
    }),
    new TextLayer<SeriesDatum>({
      id: 'answer-labels',
      data,
      getPosition: (d) => [...(d.position ?? [0, 0]), answerLabelZ(series, d.value, zoom)],
      getText: (d) => d.label ?? d.name,
      getColor: [...NAVY, 255],
      getSize: 13,
      fontFamily: FONT,
      fontWeight: 500,
      characterSet: 'auto',
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'bottom',
      getPixelOffset: [0, -10],
      background: true,
      getBackgroundColor: [255, 255, 255, 245],
      getBorderColor: [...LAVA, 255],
      getBorderWidth: 1,
      backgroundPadding: [7, 4],
      parameters: LABEL_ON_TOP,
    }),
  ];
}

/** The Genie answer on top of the base map: Lava with a white halo, labeled when there are few marks. */
export function buildAnswerLayers(args: AnswerArgs): Layer[] {
  if (args.series && args.date) return seriesLayers(args.series, args.date, args.zoom ?? 4, args.highlightRow, !!args.reducedMotion);
  const { kind, features, highlightRow } = args;
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
  } else if (kind === 'lanes') {
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
        getRadius: (d) => (hot(d) ? 18 : 14),
        radiusUnits: 'pixels',
        getFillColor: [255, 255, 255, 235],
        stroked: true,
        getLineColor: [...LAVA, 255],
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        pickable: true,
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
        getLineWidth: 2,
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
        characterSet: 'auto',
        getTextAnchor: 'start',
        getPixelOffset: [16, 0],
        background: true,
        getBackgroundColor: [255, 255, 255, 245],
        getBorderColor: [...LAVA, 255],
        getBorderWidth: 1,
        backgroundPadding: [7, 4],
        parameters: LABEL_ON_TOP,
      })
    );
  }
  return layers;
}
