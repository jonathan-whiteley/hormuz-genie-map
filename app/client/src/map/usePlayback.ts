import { useCallback, useEffect, useState } from 'react';
import { nextIndex, shouldPause, startIndex } from './playback';

interface Opts {
  steps: string[];
  tickMs: number;
  date: string;
  setDate: (d: string) => void;
}

/**
 * Plays the selected date through `steps`, one step per tick, stopping on the last step. A date
 * change that playback did not make itself (a slider drag, a tour step) pauses it.
 */
export function usePlayback({ steps, tickMs, date, setDate }: Opts) {
  const [playing, setPlaying] = useState(false);
  // The date playback last set. State, not a ref, so the render-time check below may read it.
  const [lastSet, setLastSet] = useState<string | null>(null);

  /** Starts on `steps[index]` (clamped), showing that step first. */
  const playFrom = useCallback(
    (index: number) => {
      if (steps.length === 0) return;
      const d = steps[Math.min(Math.max(index, 0), steps.length - 1)];
      setLastSet(d);
      setDate(d);
      setPlaying(true);
    },
    [steps, setDate]
  );
  const play = useCallback(() => playFrom(startIndex(steps, date)), [playFrom, steps, date]);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause]);

  // Someone else moved the date: stop.
  if (shouldPause(playing, lastSet, date)) {
    setLastSet(null);
    setPlaying(false);
  }

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      const i = nextIndex(steps, date);
      if (i < 0) {
        setPlaying(false);
        return;
      }
      setLastSet(steps[i]);
      setDate(steps[i]);
    }, tickMs);
    return () => window.clearTimeout(id);
  }, [playing, date, steps, tickMs, setDate]);

  return { playing, play, playFrom, pause, toggle };
}
