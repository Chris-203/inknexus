import type { ReactNode } from 'react';
import { usePageZoom } from '../lib/zoom';
import { ResetZoom } from './ResetZoom';

/**
 * The reader's and site view's top bar. Pinching can zoom the whole app: always over another site shown in the app,
 * and in iPhone Safari also over the reader's pages when a scroll is still moving. While it is zoomed, the bar is
 * scaled back down and kept at the top of the screen, hidden while the zoom is changing, with Reset zoom in the corner.
 */
export function TopBar({ children }: { children: ReactNode }) {
  const pz = usePageZoom();
  return (
    <>
      <div className={pz?.moving ? 'rbar moving' : 'rbar'} style={pz ? { transform: `translate(${pz.left}px,${pz.top}px) scale(${1 / pz.scale})` } : undefined}>
        {children}
      </div>
      {pz && <ResetZoom z={pz} />}
    </>
  );
}
