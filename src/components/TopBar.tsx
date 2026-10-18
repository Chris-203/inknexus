import type { ReactNode } from 'react';
import { usePageZoom } from '../lib/zoom';
import { ResetZoom } from './ResetZoom';

/**
 * The reader's and site view's top bar. Pinching can zoom the whole app: always over another site shown in the app,
 * and in iPhone Safari also over the reader's pages when a scroll is still moving. While it is zoomed, the bar is
 * scaled back down and kept at the top of the screen, hidden while the zoom is changing, with Reset zoom in the corner.
 * `off` hides the bar (the reader does while scrolling down). `over` floats it over the content with no background,
 * so only its own controls show (the reader's and site view's).
 */
export function TopBar({ children, off = false, over = false }: { children: ReactNode; off?: boolean; over?: boolean }) {
  const pz = usePageZoom();
  const cls = ['rbar', over && 'over', off && 'off', pz && 'unzoom', pz?.moving && 'moving'].filter(Boolean).join(' ');
  return (
    <>
      <div className={cls} style={pz ? { transform: `translate(${pz.left}px,${pz.top}px) scale(${1 / pz.scale})` } : undefined}>
        {children}
      </div>
      {pz && <ResetZoom z={pz} />}
    </>
  );
}
