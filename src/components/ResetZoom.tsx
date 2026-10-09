import { useEffect, useState } from 'react';

/**
 * iPhone Safari zooms the whole app when you pinch over another site shown in the app, and the app cannot block
 * that. While the app is zoomed, show Reset zoom at normal size in the corner; it re-applies the viewport, which
 * snaps Safari back to 100% where it can, and otherwise says to pinch out.
 */
export function ResetZoom() {
  const [pos, setPos] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const place = () => {
      if (vv.scale > 1.05)
        setPos(`translate(${vv.offsetLeft + vv.width - 12 / vv.scale}px,${vv.offsetTop + vv.height - 80 / vv.scale}px) scale(${1 / vv.scale}) translate(-100%,-100%)`);
      else {
        setPos(null);
        setFailed(false);
      }
    };
    vv.addEventListener('resize', place);
    vv.addEventListener('scroll', place);
    return () => {
      vv.removeEventListener('resize', place);
      vv.removeEventListener('scroll', place);
    };
  }, []);
  if (!pos) return null;
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
  return (
    <button id="unzoom" className="btn on" style={{ transform: pos }} onClick={reset}>
      {failed ? 'Pinch out to zoom back' : 'Reset zoom'}
    </button>
  );
}
