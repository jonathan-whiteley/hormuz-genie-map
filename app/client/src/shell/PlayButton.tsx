/** Play/pause button used by the date slider and the answer pill. */
export function PlayButton({ playing, onToggle, label }: { playing: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={playing ? `Pause ${label}` : `Play ${label}`}
      aria-pressed={playing}
      onClick={onToggle}
      style={{
        width: 30,
        height: 30,
        flexShrink: 0,
        borderRadius: 8,
        border: '1px solid var(--gray-300)',
        background: playing ? 'var(--navy-900)' : 'var(--white)',
        color: playing ? 'var(--white)' : 'var(--navy-900)',
        cursor: 'pointer',
        fontSize: 12,
        lineHeight: 1,
      }}
    >
      {playing ? '❚❚' : '▶'}
    </button>
  );
}
