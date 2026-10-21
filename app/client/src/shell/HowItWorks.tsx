import { lazy, Suspense, useEffect } from 'react';

// React Flow and html-to-image load in their own chunk, only when the modal opens.
const ArchitecturePage = lazy(() => import('../architecture/ArchitecturePage'));

/** The architecture diagram in a modal. Esc or a backdrop click closes it. */
export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How it works"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(11, 32, 38, 0.45)', display: 'grid', placeItems: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: '92vw', height: '88vh', background: 'var(--light)', borderRadius: 14, overflow: 'auto', boxShadow: '0 12px 40px rgba(11, 32, 38, 0.3)' }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{ position: 'absolute', top: 12, right: 12, zIndex: 2, width: 32, height: 32, borderRadius: 8, border: '1px solid var(--gray-300)', background: 'var(--white)', cursor: 'pointer' }}
        >
          ✕
        </button>
        <Suspense fallback={<p role="status" style={{ padding: 24 }}>Loading the architecture diagram</p>}>
          <ArchitecturePage />
        </Suspense>
      </div>
    </div>
  );
}
