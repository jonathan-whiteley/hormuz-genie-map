import type { ConflictEvent, LaneDay, LaneRec } from '../data/types';
import { RecChip } from '../decisions/RecChip';
import { fmtDate } from '../explore/dates';
import { SCENES, type Scene } from './scenes';

interface Props {
  scene: Scene;
  body: string;
  /** Event line under the body, linked to its source. */
  event?: ConflictEvent;
  index: number;
  onIndex: (i: number) => void;
  /** Highlighted lanes with their recommendation, only when recommendations are available. */
  recs?: { lane: LaneDay; rec: LaneRec | undefined }[];
}

const navButton = (disabled: boolean) => ({
  font: 'inherit',
  fontSize: '0.875rem',
  fontWeight: 500,
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--gray-300)',
  background: 'var(--white)',
  color: 'var(--navy-900)',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.45 : 1,
});

/** Story card overlaid at the top-left of the map: title, body, optional rec chips, Back and Next. */
export function SceneCard({ scene, body, event, index, onIndex, recs }: Props) {
  const last = index === SCENES.length - 1;
  return (
    <section
      aria-label={`Scene ${scene.id}: ${scene.title}`}
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        width: 360,
        maxWidth: 'calc(100% - 24px)',
        zIndex: 3,
        background: 'var(--white)',
        border: '1px solid var(--gray-300)',
        borderRadius: 12,
        padding: 'var(--space-2)',
        boxShadow: '0 4px 12px rgba(11, 32, 38, 0.12)',
      }}
    >
      <div style={{ fontSize: '0.75rem', color: 'var(--gray-700)', fontWeight: 700 }}>
        Scene {scene.id} of {SCENES.length}
      </div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '2px 0 8px' }}>{scene.title}</h2>
      <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.5 }}>{body}</p>
      {event && (
        <p style={{ margin: '6px 0 0', fontSize: '0.875rem', lineHeight: 1.45 }}>
          <strong>{fmtDate(event.event_date)}:</strong>{' '}
          {event.source_url ? (
            <a href={event.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--navy-900)' }}>
              {event.event}
            </a>
          ) : (
            event.event
          )}
          .
        </p>
      )}
      {recs && recs.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {recs.map(({ lane, rec }) => (
            <div key={lane.lane_id}>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-700)', marginBottom: 2 }}>
                {lane.lane_id}: {lane.lane}
              </div>
              <RecChip rec={rec} />
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <button disabled={index === 0} onClick={() => onIndex(index - 1)} style={navButton(index === 0)}>
          Back
        </button>
        <button
          disabled={last}
          onClick={() => onIndex(index + 1)}
          style={{
            ...navButton(last),
            background: 'var(--lava-600)',
            color: 'var(--white)',
            border: '1px solid var(--lava-600)',
          }}
        >
          Next
        </button>
      </div>
    </section>
  );
}
