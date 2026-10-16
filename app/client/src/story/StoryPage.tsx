import { useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { GeniePanel } from '../genie/GeniePanel';
import { useGenieMap } from '../genie/useGenieMap';
import { recOn } from '../data/kpi';
import { fmtShort, latestPortDate, scrubEnd, SCRUB_START } from '../explore/dates';
import { LeftRail } from '../explore/LeftRail';
import { TimeScrubber } from '../explore/TimeScrubber';
import { buildLayers, type LayerToggles, type Vessel } from '../map/layers';
import { Legend } from '../map/Legend';
import { MapView, type Padding, type PickedFeature, type ViewState } from '../map/MapView';
import { SceneCard } from './SceneCard';
import { SCENES, laneFilter, resolveSceneDate, sceneView } from './scenes';

/** The scene card is 360 px wide at left 12, so the camera centers on the map to its right. */
const STORY_PADDING: Partial<Padding> = { left: 384 };
/**
 * A regions fit spans about 110 degrees of longitude, too wide for the strip beside the card, so it
 * uses the full map width below the card instead (the scene 5 card is about 280 px tall at top 12).
 */
const FIT_PADDING: Partial<Padding> = { top: 300 };

interface Props {
  index: number;
  onIndex: (i: number) => void;
}

/** Story mode: the Explore pieces driven by one of five scenes. */
export function StoryPage({ index, onIndex }: Props) {
  const { dataset, loading } = useData();
  const scene = SCENES[index];
  const sceneDate = useMemo(() => resolveSceneDate(scene.date, dataset), [scene.date, dataset]);
  const end = useMemo(() => scrubEnd(dataset), [dataset]);
  const latestPort = useMemo(() => latestPortDate(dataset), [dataset]);

  // Scene changes reset every control; the scrubber, vessel and toggles can then be adjusted freely.
  const [picked, setPicked] = useState<string | null>(null);
  const [vessel, setVessel] = useState<Vessel>(scene.vessel);
  const [toggles, setToggles] = useState<LayerToggles>(scene.toggles);
  const [view, setView] = useState<ViewState>(() => sceneView(scene, dataset));
  const [shown, setShown] = useState(scene);
  const [shownRegions, setShownRegions] = useState(dataset.regions);
  if (shown !== scene) {
    setShown(scene);
    setShownRegions(dataset.regions);
    setPicked(null);
    setVessel(scene.vessel);
    setToggles(scene.toggles);
    setView(sceneView(scene, dataset));
  } else if (scene.fit && shownRegions !== dataset.regions) {
    // The region boxes arrived after the scene opened: fit them now.
    setShownRegions(dataset.regions);
    setView(sceneView(scene, dataset));
  }

  const { genieLayers, prefill, askAbout } = useGenieMap(setToggles);
  const onPick = (f: PickedFeature) => {
    if (f.kind === 'port' || f.kind === 'chokepoint') askAbout(f.name);
  };

  const date = picked ?? sceneDate;
  const highlight = useMemo(() => scene.highlightLaneIds ?? [], [scene]);

  const layers = useMemo(
    () =>
      buildLayers({
        dataset,
        date,
        vessel,
        visible: toggles,
        highlightLaneIds: highlight,
        genieLayers,
      }),
    [dataset, date, vessel, toggles, highlight, genieLayers]
  );

  const body = useMemo(() => scene.body(dataset, date), [scene, dataset, date]);
  const event = useMemo(() => scene.event?.(dataset, date), [scene, dataset, date]);
  const recs = useMemo(
    () =>
      dataset.recsAvailable && highlight.length > 0
        ? laneFilter(dataset, date, highlight).map((lane) => ({ lane, rec: recOn(dataset.recs, lane.lane_id, date) }))
        : undefined,
    [dataset, date, highlight]
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr 360px',
        gridTemplateRows: '1fr auto',
        height: 'calc(100vh - 64px)',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ gridRow: '1 / span 2', minHeight: 0, display: 'grid' }}>
        <LeftRail
          dataset={dataset}
          date={date}
          start={SCRUB_START}
          end={end}
          vessel={vessel}
          onVessel={setVessel}
          toggles={toggles}
          onToggles={setToggles}
        />
      </div>
      <div style={{ position: 'relative', minHeight: 0 }}>
        <MapView
          layers={layers}
          viewState={view}
          padding={scene.fit === 'regions' ? FIT_PADDING : STORY_PADDING}
          onViewStateChange={setView}
          onPick={onPick}
        />
        <Legend key={scene.id} defaultOpen={!scene.legendCollapsed} />
        <SceneCard scene={scene} body={body} event={event} index={index} onIndex={onIndex} recs={recs} />
        {loading && (
          <div
            role="status"
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              background: 'var(--white)',
              border: '1px solid var(--gray-300)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: '0.875rem',
            }}
          >
            Loading 2026 shipping data
          </div>
        )}
      </div>
      <aside
        aria-label="Genie"
        style={{
          gridRow: '1 / span 2',
          gridColumn: 3,
          borderLeft: '1px solid var(--gray-300)',
          background: 'var(--light)',
          minHeight: 0,
          minWidth: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <GeniePanel suggested={scene.questions} prefill={prefill} />
      </aside>
      <div style={{ gridColumn: 2 }}>
        <TimeScrubber
          start={SCRUB_START}
          end={end}
          date={date}
          onChange={setPicked}
          events={dataset.events}
          note={latestPort ? `PortWatch latest: ${fmtShort(latestPort)}` : undefined}
        />
      </div>
    </div>
  );
}
