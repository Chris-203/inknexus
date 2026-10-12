import { useState } from 'react';
import { zoomedIn, type PageZoom } from '../lib/zoom';

/**
 * Shown while the browser has zoomed the whole app in the reader or site view: Reset zoom at normal size in the
 * corner. It caps the viewport at 100% for a moment, which snaps Safari back where it can, and otherwise says to pinch
 * out (the reader leaves pinches to the browser while it is zoomed, so that works over the pages too).
 */
export function ResetZoom({ z }: { z: PageZoom }) {
  const [failed, setFailed] = useState(false);
  const reset = () => {
    const m = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
    if (!m) return;
    const c = m.content;
    m.content = `${c}, maximum-scale=1`;
    setTimeout(() => {
      m.content = c;
      setTimeout(() => setFailed(zoomedIn(window.visualViewport)), 400);
    }, 300);
  };
  const pos = `translate(${z.left + z.width - 12 / z.scale}px,${z.top + z.height - 80 / z.scale}px) scale(${1 / z.scale}) translate(-100%,-100%)`;
  return (
    <button id="unzoom" className={z.moving ? 'btn moving' : 'btn'} style={{ transform: pos }} onClick={reset}>
      {failed ? 'Pinch out to zoom back' : 'Reset zoom'}
    </button>
  );
}
