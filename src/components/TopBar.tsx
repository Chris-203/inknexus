import type { ReactNode } from 'react';
import { usePageZoom } from '../lib/zoom';
import { ResetZoom } from './ResetZoom';

/**
 * The reader's and site view's top bar. Pinching can zoom the whole app: always over another site shown in the app,
 * and in iPhone Safari also over the reader's pages when a scroll is still moving. While it is zoomed, the bar is
 * scaled back down and kept at the top of the screen, hidden while the zoom is changing, with Reset zoom in the corner.
 * `off` hides the bar (the reader does while scrolling down).
 */
export function TopBar({ children, off = false }: { children: ReactNode; off?: boolean }) {
  const pz = usePageZoom();
  const cls = ['rbar', off && 'off', pz && 'unzoom', pz?.moving && 'moving'].filter(Boolean).join(' ');
  return (
    <>
      <div className={cls} style={pz ? { transform: `translate(${pz.left}px,${pz.top}px) scale(${1 / pz.scale})` } : undefined}>
        {children}
      </div>
      {pz && <ResetZoom z={pz} />}
    </>
  );
}
