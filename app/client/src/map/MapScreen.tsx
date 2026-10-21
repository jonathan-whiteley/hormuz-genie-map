import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '../chat/chatStore';
import { useData } from '../data/DataContext';
import { SCRUB_START, scrubEnd } from '../explore/dates';
import { featureBounds } from '../genie/answerFeatures';
import { genieQuestionFor } from '../genie/genieLayer';
import { DateSlider } from '../shell/DateSlider';
import { LayersCard } from '../shell/LayersCard';
import { TOUR_PADDING_BOTTOM } from '../tour/steps';
import { TourBar } from '../tour/TourBar';
import { ANSWER_CAMERA_START, answerCamera, tourReset } from './answerCamera';
import { AnswerPill } from './AnswerPill';
import { buildAnswerLayers } from './answerLayer';
import { buildBaseLayers, type MapDatum } from './baseLayers';
import { MapLegend } from './MapLegend';
import { MapView } from './MapView';
import { PlacePopover } from './PlacePopover';
import type { MapState } from './useMapState';

interface Popover {
  d: MapDatum;
  x: number;
  y: number;
  container: { w: number; h: number };
}

/** The map column: base layers, the Genie answer, floating cards, the date slider and the tour bar. */
export function MapScreen({ m }: { m: MapState }) {
  const { dataset, loading } = useData();
  const chat = useChat();
  const [zoom, setZoom] = useState(4);
  const [popover, setPopover] = useState<Popover | null>(null);
  const mapArea = useRef<HTMLDivElement | null>(null);
  const end = useMemo(() => scrubEnd(dataset), [dataset]);
  const date = m.date ?? end;
  const active = chat.active;
  // The base layers only change at integer zoom thresholds, so rebuild them per zoom level, not per zoom step.
  const zoomLevel = Math.floor(zoom);

  // Base and answer layers memoize apart, so hovering a table row or a mark rebuilds only the answer layers.
  const answerOn = !!active;
  const base = useMemo(
    () => buildBaseLayers({ dataset, date, visible: m.toggles, zoom: zoomLevel, dimmed: answerOn }),
    [dataset, date, m.toggles, zoomLevel, answerOn]
  );
  const answer = useMemo(
    () =>
      active
        ? buildAnswerLayers({ kind: active.spec.kind, features: active.features, highlightRow: chat.hoverRow })
        : [],
    [active, chat.hoverRow]
  );
  const layers = useMemo(() => [...base, ...answer], [base, answer]);

  // A new answer flies the camera to it; clearing it flies back to where the reader was (see answerCamera).
  const camera = useRef(ANSWER_CAMERA_START);
  const { view, setView } = m;
  const tourStep = m.tour?.step ?? null;
  useEffect(() => {
    camera.current = tourReset(camera.current);
  }, [tourStep]);
  // Bounds once per answer, not on every pan (view changes on each camera move).
  const target = useMemo(() => (active ? { id: active.id, bounds: featureBounds(active.features) } : null), [active]);
  useEffect(() => {
    const { state, next } = answerCamera(camera.current, target, view);
    camera.current = state;
    if (next) setView(next);
  }, [target, view, setView]);

  // The popover belongs to the camera it was opened in: a tour step or a new answer moves the map, so it closes.
  const popoverScene = `${tourStep ?? 'none'}|${active?.id ?? 'none'}`;
  const [seenScene, setSeenScene] = useState(popoverScene);
  if (popoverScene !== seenScene) {
    setSeenScene(popoverScene);
    setPopover(null);
  }

  const onPickAt = (d: MapDatum | null, x: number, y: number) => {
    if (d?.kind === 'answer') {
      if (d.rowIndex != null) chat.setFocusRow(d.rowIndex);
      setPopover(null);
    } else if (d && (d.kind === 'port' || d.kind === 'chokepoint')) {
      const el = mapArea.current;
      setPopover({ d, x, y, container: { w: el?.clientWidth ?? Infinity, h: el?.clientHeight ?? Infinity } });
    } else {
      setPopover(null);
    }
  };
  const onHoverDatum = (d: MapDatum | null) => {
    if (d?.kind === 'answer') chat.setHoverRow(d.rowIndex ?? null);
    else if (chat.hoverRow !== null) chat.setHoverRow(null);
  };
  // Stable, because PlacePopover's Esc listener effect depends on it.
  const closePopover = useCallback(() => setPopover(null), []);

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr 56px', minHeight: 0, minWidth: 0 }}>
      <div ref={mapArea} style={{ position: 'relative', minHeight: 0 }}>
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
            container={popover.container}
            canAsk={!chat.genieOff}
            onAsk={(name) => {
              chat.setDraft(genieQuestionFor(name));
              setPopover(null);
            }}
            onClose={closePopover}
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
          <div
            role="status"
            style={{
              position: 'absolute',
              bottom: 12,
              left: 14,
              zIndex: 3,
              background: 'var(--white)',
              border: '1px solid var(--gray-300)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: '0.8125rem',
            }}
          >
            Loading data
          </div>
        )}
      </div>
      <DateSlider start={SCRUB_START} end={end} date={date} events={dataset.events} onChange={m.setDate} />
    </div>
  );
}
