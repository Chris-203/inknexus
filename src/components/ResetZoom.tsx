import { useState } from 'react';
import type { PageZoom } from '../lib/zoom';

/**
 * Shown while the browser has zoomed the whole app in the site view: Reset zoom at normal size in the corner. It
 * re-applies the viewport, which snaps Safari back to 100% where it can, and otherwise says to pinch out.
 */
export function ResetZoom({ z }: { z: PageZoom }) {
  const [failed, setFailed] = useState(false);
  const reset = () => {
    const m = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
    if (!m) return;
    const c = m.content;
    m.content = c.replace('initial-scale=1,', 'initial-scale=1.01,');
    setTimeout(() => {
      m.content = c;
      setTimeout(() => setFailed((window.visualViewport?.scale ?? 1) > 1.05), 400);
    }, 60);
  };
  const pos = `translate(${z.left + z.width - 12 / z.scale}px,${z.top + z.height - 80 / z.scale}px) scale(${1 / z.scale}) translate(-100%,-100%)`;
  return (
    <button id="unzoom" className={z.moving ? 'btn moving' : 'btn'} style={{ transform: pos }} onClick={reset}>
      {failed ? 'Pinch out to zoom back' : 'Reset zoom'}
    </button>
  );
}
