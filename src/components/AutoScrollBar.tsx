import { SPEEDS } from '../lib/autoScroll';

/** Auto scroll's controls in the reader: play or pause, slower and faster around the speed, and stop. */
export function AutoScrollBar({
  paused,
  speed,
  onPause,
  onSpeed,
  onStop,
}: {
  paused: boolean;
  speed: number;
  onPause: (paused: boolean) => void;
  onSpeed: (d: number) => void;
  onStop: () => void;
}) {
  return (
    <div id="autoscroll" className="chnav" role="toolbar" aria-label="Auto scroll">
      <button aria-label={paused ? 'Play' : 'Pause'} onClick={() => onPause(!paused)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={paused ? 'M8 5v14l11-7z' : 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z'} />
        </svg>
      </button>
      <button aria-label="Slower" disabled={speed === SPEEDS[0]} onClick={() => onSpeed(-1)}>
        −
      </button>
      <b aria-live="polite">{speed}×</b>
      <button aria-label="Faster" disabled={speed === SPEEDS.at(-1)} onClick={() => onSpeed(1)}>
        +
      </button>
      <button aria-label="Stop auto scroll" onClick={onStop}>
        ×
      </button>
    </div>
  );
}
