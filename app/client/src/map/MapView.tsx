import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre resolves its worker next to its own module URL, which Vite's dep bundling breaks; pin it explicitly.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Layer, PickingInfo } from '@deck.gl/core';
import { fmtNum, fmtPct } from '../data/kpi';
import type { MapDatum } from './baseLayers';
import { PROGRAMMATIC, reportsCamera } from './cameraEvents';
import { fitOptions } from './fit';
import { tooltipPos } from './tooltip';

maplibregl.setWorkerUrl(workerUrl);

export const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export type Padding = { top: number; bottom: number; left: number; right: number };

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
  /** When set, the camera fits these [[west, south], [east, north]] bounds instead of flying to the center. */
  bounds?: [[number, number], [number, number]];
  /** Extra padding for the bounds fit, on top of the map padding. */
  boundsPadding?: Partial<Padding>;
  /** Upper zoom bound for a bounds fit. */
  maxZoom?: number;
}

interface Props {
  layers: Layer[];
  viewState: ViewState;
  /** Camera padding in pixels for overlays (for example the tour bar), so the camera centers on the open map. */
  padding?: Partial<Padding>;
  onViewStateChange?: (v: ViewState) => void;
  /** Reports the zoom once at start and after every zoom change. */
  onZoom?: (zoom: number) => void;
  /** A click: the picked datum (null on empty map) and its pixel position in the map. */
  onPickAt?: (d: MapDatum | null, x: number, y: number) => void;
  /** The datum under the cursor, or null. */
  onHoverDatum?: (d: MapDatum | null) => void;
}

function isDatum(o: unknown): o is MapDatum {
  return typeof o === 'object' && o !== null && 'kind' in o && 'name' in o;
}

const close = (a: ViewState, b: ViewState) =>
  Math.abs(a.longitude - b.longitude) < 1e-4 &&
  Math.abs(a.latitude - b.latitude) < 1e-4 &&
  Math.abs(a.zoom - b.zoom) < 1e-3;

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

const NO_PADDING: Padding = { top: 0, bottom: 0, left: 0, right: 0 };
const pad = (p?: Partial<Padding>): Padding => ({ ...NO_PADDING, ...p });
const sizeOf = (el: HTMLElement) => ({ w: el.clientWidth, h: el.clientHeight });

export function MapView({
  layers,
  viewState,
  padding,
  onViewStateChange,
  onZoom,
  onPickAt,
  onHoverDatum,
}: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const cbs = useRef({ onViewStateChange, onZoom, onPickAt, onHoverDatum });
  cbs.current = { onViewStateChange, onZoom, onPickAt, onHoverDatum };
  const [hover, setHover] = useState<{ x: number; y: number; d: MapDatum } | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  // Measured tooltip size (starts at its max width), so it can flip away from the container edges.
  const [tipSize, setTipSize] = useState({ w: 300, h: 120 });
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w !== tipSize.w || h !== tipSize.h) setTipSize({ w, h });
  }, [hover, tipSize]);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: BASEMAP_STYLE,
      center: [viewState.longitude, viewState.latitude],
      zoom: viewState.zoom,
      pitch: viewState.pitch ?? 0,
      bearing: viewState.bearing ?? 0,
      attributionControl: { compact: true },
    });
    map.setPadding(pad(padding));
    const initialFit = fitOptions(viewState, sizeOf(container.current), pad(padding), 0);
    if (viewState.bounds && initialFit) map.fitBounds(viewState.bounds, initialFit);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      onHover: (info: PickingInfo) => {
        const o: unknown = info.object;
        setHover(isDatum(o) ? { x: info.x, y: info.y, d: o } : null);
        cbs.current.onHoverDatum?.(isDatum(o) ? o : null);
      },
      onClick: (info: PickingInfo) => {
        const o: unknown = info.object;
        cbs.current.onPickAt?.(isDatum(o) ? o : null, info.x, info.y);
      },
      getCursor: ({ isHovering }) => (isHovering ? 'pointer' : 'grab'),
    });
    map.addControl(overlay);
    map.on('moveend', (e) => {
      // MapView's own camera calls (and their interruptions) are tagged and not reported; see reportsCamera.
      if (!reportsCamera(e as { originalEvent?: unknown; programmatic?: boolean })) return;
      const c = map.getCenter();
      cbs.current.onViewStateChange?.({
        longitude: c.lng,
        latitude: c.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      });
    });
    map.on('zoomend', () => cbs.current.onZoom?.(map.getZoom()));
    map.once('load', () => cbs.current.onZoom?.(map.getZoom()));
    mapRef.current = map;
    overlayRef.current = overlay;
    return () => {
      map.removeControl(overlay);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // Created once; later camera changes go through the viewState effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    overlayRef.current?.setProps({ layers });
  }, [layers]);

  const padKey = JSON.stringify(pad(padding));
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // setPadding is a jumpTo with its own moveend; reporting that camera would make the viewState
    // effect fly back to the previous view and cancel a fit or flight started in the same render.
    map.setPadding(JSON.parse(padKey) as Padding, PROGRAMMATIC);
  }, [padKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (viewState.bounds) {
      // No fit when the container has no size or the padding leaves no room: MapLibre would compute NaN.
      const fit = fitOptions(viewState, sizeOf(map.getContainer()), pad(map.getPadding()), 1200);
      if (!fit) return;
      map.fitBounds(viewState.bounds, fit, PROGRAMMATIC);
      return;
    }
    const c = map.getCenter();
    const cur = { longitude: c.lng, latitude: c.lat, zoom: map.getZoom() };
    if (close(cur, viewState)) return;
    map.flyTo(
      {
        center: [viewState.longitude, viewState.latitude],
        zoom: viewState.zoom,
        pitch: viewState.pitch ?? 0,
        bearing: viewState.bearing ?? 0,
        duration: 1200,
      },
      PROGRAMMATIC
    );
  }, [viewState]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {hover && (
        <div
          ref={tipRef}
          role="tooltip"
          style={{
            position: 'absolute',
            ...tooltipPos(
              hover.x,
              hover.y,
              { w: container.current?.clientWidth ?? Infinity, h: container.current?.clientHeight ?? Infinity },
              tipSize
            ),
            pointerEvents: 'none',
            background: 'var(--white)',
            color: 'var(--navy-900)',
            border: '1px solid var(--gray-300)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: '0.8125rem',
            lineHeight: 1.45,
            minWidth: 200,
            maxWidth: 300,
            boxShadow: '0 4px 12px rgba(11, 32, 38, 0.12)',
            zIndex: 2,
          }}
        >
          <TooltipBody d={hover.d} />
        </div>
      )}
    </div>
  );
}
