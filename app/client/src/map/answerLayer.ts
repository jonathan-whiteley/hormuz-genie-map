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
      })
    );
  }
  return layers;
}
