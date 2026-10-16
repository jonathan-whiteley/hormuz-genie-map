import { SCENES } from './scenes';

/** Five numbered dots, one per scene; the active one is Lava. */
export function SceneStepper({ index, onChange }: { index: number; onChange: (i: number) => void }) {
  return (
    <div role="group" aria-label="Story scenes" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {SCENES.map((s, i) => {
        const active = i === index;
        return (
          <button
            key={s.id}
            onClick={() => onChange(i)}
            aria-label={`Scene ${s.id}: ${s.title}`}
            aria-current={active ? 'step' : undefined}
            title={s.title}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: `1px solid ${active ? 'var(--lava-600)' : 'var(--gray-300)'}`,
              background: active ? 'var(--lava-600)' : 'var(--white)',
              color: active ? 'var(--white)' : 'var(--navy-900)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {s.id}
          </button>
        );
      })}
    </div>
  );
}
