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
        <button type="button" onClick={() => onAsk(s.question)} disabled={!canAsk} style={{ ...btn, background: 'var(--lava-600)', border: '1px solid var(--lava-600)', color: 'var(--white)', opacity: canAsk ? 1 : 0.5 }}>
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
