const MAX = 60;

/** Top-center pill naming the answer on the map, with a close button that clears it. */
export function AnswerPill({ question, onClear }: { question: string; onClear: () => void }) {
  const text = question.length > MAX ? `${question.slice(0, MAX - 1).trimEnd()}…` : question;
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 6px 6px 14px',
        background: 'var(--white)',
        border: '1px solid var(--lava-600)',
        borderRadius: 10,
        fontSize: '0.875rem',
        boxShadow: '0 2px 10px rgba(11, 32, 38, 0.08)',
        maxWidth: '60%',
      }}
    >
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--lava-600)', flexShrink: 0 }}
      />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Showing: {text}</span>
      <button
        type="button"
        aria-label="Clear the answer from the map"
        onClick={onClear}
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          border: 'none',
          background: 'var(--gray-100)',
          color: 'var(--gray-700)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}
