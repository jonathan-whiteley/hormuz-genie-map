import { useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { GeniePanel } from '../genie/GeniePanel';
import { useGenieMap } from '../genie/useGenieMap';
import { QUESTIONS } from '../story/scenes';
import { ALL_ON, buildLayers, type LayerToggles, type Vessel } from '../map/layers';
import { MapView, type PickedFeature, type ViewState } from '../map/MapView';
import { Legend } from '../map/Legend';
import { LeftRail } from './LeftRail';
import { TimeScrubber } from './TimeScrubber';
import { INITIAL_VIEW, SCRUB_START, fmtShort, latestPortDate, scrubEnd } from './dates';

const EXPLORE_QUESTIONS = QUESTIONS.slice(0, 3);

export function ExplorePage({ initialDate }: { initialDate?: string }) {
  const { dataset, loading } = useData();
  const latestPort = useMemo(() => latestPortDate(dataset), [dataset]);
  // The scrubber runs to the latest PortWatch or AIS day, so the AIS layer is reachable at the end.
  const end = useMemo(() => scrubEnd(dataset), [dataset]);
  const [picked, setPicked] = useState<string | null>(initialDate ?? null);
  // Default to the overall latest day (PortWatch or AIS) so the AIS layer shows on first load.
  const date = picked ?? end;
  const [vessel, setVessel] = useState<Vessel>('total');
  const [toggles, setToggles] = useState<LayerToggles>({ ...ALL_ON, regions: false });
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const [laneId, setLaneId] = useState<string | undefined>(undefined);
  const { genieLayers, prefill, askAbout } = useGenieMap(setToggles);

  const layers = useMemo(
    () =>
      buildLayers({
        dataset,
        date,
        vessel,
        visible: toggles,
        highlightLaneIds: laneId ? [laneId] : [],
        genieLayers,
      }),
    [dataset, date, vessel, toggles, laneId, genieLayers]
  );

  const onPick = (f: PickedFeature) => {
    if (f.kind === 'lane' && f.laneId) setLaneId(f.laneId);
    else if (f.kind === 'port' || f.kind === 'chokepoint') askAbout(f.name);
  };

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
          laneId={laneId}
          onLane={setLaneId}
        />
      </div>
      <div style={{ position: 'relative', minHeight: 0 }}>
        <MapView layers={layers} viewState={view} onViewStateChange={setView} onPick={onPick} />
        <Legend />
        {loading && (
          <div
            role="status"
            style={{
              position: 'absolute',
              top: 12,
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
        <GeniePanel suggested={EXPLORE_QUESTIONS} prefill={prefill} />
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
