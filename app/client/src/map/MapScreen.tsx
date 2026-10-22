import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '../chat/chatStore';
import { useData } from '../data/DataContext';
import { SCRUB_START, scrubEnd } from '../explore/dates';
import { featureBounds } from '../genie/answerFeatures';
import { genieQuestionFor } from '../genie/genieLayer';
import { fmtFrameDate, frameOn } from '../genie/timeSeries';
import { DateSlider } from '../shell/DateSlider';
import { SLIDER_HEIGHT } from '../shell/eventLabels';
import { LayersCard } from '../shell/LayersCard';
import { TOUR_PADDING_BOTTOM } from '../tour/steps';
import { TourBar } from '../tour/TourBar';
import { ANSWER_CAMERA_START, answerCamera, tourReset } from './answerCamera';
import { AnswerPill } from './AnswerPill';
import { buildAnswerLayers } from './answerLayer';
import { buildBaseLayers, type MapDatum } from './baseLayers';
import { roundZoom } from './columns';
import { SERIES_DATE_START, seriesDate } from './seriesDate';
import { MapLegend } from './MapLegend';
import { MapView } from './MapView';
import { PlacePopover } from './PlacePopover';
import { REDUCED_STEP_DAYS, REDUCED_TICK_MS, YEAR_TICK_MS, answerTickMs, dayStepsBetween } from './playback';
import { usePlayback } from './usePlayback';
import type { MapState } from './useMapState';

interface Popover {
  d: MapDatum;
  x: number;
  y: number;
  container: { w: number; h: number };
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** The map column: base layers, the Genie answer, floating cards, the date slider and the tour bar. */
export function MapScreen({ m }: { m: MapState }) {
  const { dataset, loading } = useData();
  const chat = useChat();
  // The camera zoom rounded to ZOOM_STEP: a flight re-renders only when the rounded value changes.
  const [zoom, setZoom] = useState(4);
  const onZoom = useCallback((z: number) => setZoom(roundZoom(z)), []);
  const [popover, setPopover] = useState<Popover | null>(null);
  const mapArea = useRef<HTMLDivElement | null>(null);
  const end = useMemo(() => scrubEnd(dataset), [dataset]);
  const date = m.date ?? end;
  const active = chat.active;
  // Layer thresholds (AIS cells, port labels) use the integer zoom; column heights use the rounded zoom.
  const zoomLevel = Math.floor(zoom);
  const reducedMotion = useReducedMotion();

  // Play the 2026 timeline: a day per tick (a week under reduced motion), ending on the latest data day.
  const yearSteps = useMemo(
    () => dayStepsBetween(SCRUB_START, end, reducedMotion ? REDUCED_STEP_DAYS : 1),
    [end, reducedMotion]
  );
  const year = usePlayback({
    steps: yearSteps,
    tickMs: reducedMotion ? REDUCED_TICK_MS : YEAR_TICK_MS,
    date,
    setDate: m.setDate,
  });
  const { pause: pauseYear } = year;

  // A time-series answer plays through its own dates; the slider follows its frame.
  const series = active?.series ?? null;
  const answerSteps = useMemo(() => series?.dates ?? [], [series]);
  const answerPlay = usePlayback({
    steps: answerSteps,
    tickMs: answerTickMs(answerSteps.length),
    date,
    setDate: m.setDate,
  });
  const { pause: pauseAnswer, playFrom: playAnswerFrom } = answerPlay;

  useEffect(() => {
    if (!m.tour) return;
    pauseYear();
    pauseAnswer();
  }, [m.tour, pauseYear, pauseAnswer]);

  // Each new series answer plays once from its first frame; any other answer (or none) stops answer playback.
  // The reader's date from before the series comes back when the series leaves the map (see seriesDate).
  const activeId = active?.id ?? null;
  const autoPlayed = useRef<string | null>(null);
  const seriesDateState = useRef(SERIES_DATE_START);
  const readerDate = useRef(m.date);
  // Declared before the autoplay effect, so it sees the date from before the autoplay starts.
  useEffect(() => {
    readerDate.current = m.date;
  }, [m.date]);
  const { setDate } = m;
  useEffect(() => {
    if (activeId === autoPlayed.current) return;
    autoPlayed.current = activeId;
    const sd = seriesDate(seriesDateState.current, activeId ? { id: activeId, series: !!series } : null, readerDate.current);
    seriesDateState.current = sd.state;
    if (series) {
      pauseYear();
      playAnswerFrom(0);
    } else {
      pauseAnswer();
      if (sd.restore) setDate(sd.restore.date);
    }
  }, [activeId, series, pauseYear, pauseAnswer, playAnswerFrom, setDate]);

  // Only one playback at a time.
  const toggleYear = () => {
    pauseAnswer();
    year.toggle();
  };
  const toggleAnswer = () => {
    pauseYear();
    answerPlay.toggle();
  };
  const frameDate = series ? fmtFrameDate(series, frameOn(series, date).date ?? date) : undefined;

  // Base and answer layers memoize apart, so hovering a table row or a mark rebuilds only the answer layers.
  const answerOn = !!active;
  // A series answer draws its own columns, so the base map leaves those places out.
  const hidePlaces = useMemo(() => series?.places.map((p) => p.position) ?? [], [series]);
  const base = useMemo(
    () =>
      buildBaseLayers({
        dataset,
        date,
        visible: m.toggles,
        zoom: zoomLevel,
        columnZoom: zoom,
        dimmed: answerOn,
        reducedMotion,
        hideLabels: answerOn,
        hidePlaces,
      }),
    [dataset, date, m.toggles, zoomLevel, zoom, answerOn, reducedMotion, hidePlaces]
  );
  const answer = useMemo(
    () =>
      active
        ? buildAnswerLayers({
            kind: active.spec.kind,
            features: active.features,
            highlightRow: chat.hoverRow,
            series,
            date,
            zoom,
            reducedMotion,
          })
        : [],
    [active, chat.hoverRow, series, date, zoom, reducedMotion]
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
    <div style={{ display: 'grid', gridTemplateRows: `1fr ${SLIDER_HEIGHT}px`, minHeight: 0, minWidth: 0 }}>
      <div ref={mapArea} style={{ position: 'relative', minHeight: 0 }}>
        <MapView
          layers={layers}
          viewState={view}
          padding={m.tour ? { bottom: TOUR_PADDING_BOTTOM } : undefined}
          onViewStateChange={setView}
          onZoom={onZoom}
          onPickAt={onPickAt}
          onHoverDatum={onHoverDatum}
        />
        <LayersCard toggles={m.toggles} onChange={m.setToggles} />
        {active && (
          <AnswerPill
            question={active.question}
            onClear={chat.clear}
            playing={answerPlay.playing}
            onTogglePlay={series ? toggleAnswer : undefined}
            frameDate={frameDate}
          />
        )}
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
      <DateSlider
        start={SCRUB_START}
        end={end}
        date={date}
        events={dataset.events}
        onChange={m.setDate}
        playing={year.playing}
        onTogglePlay={toggleYear}
      />
    </div>
  );
}
