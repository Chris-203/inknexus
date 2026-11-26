import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { pastSlop } from '../lib/swipe';

type Tab = 'library' | 'search';

const TABS: Tab[] = ['library', 'search'];
/** The bar's padding and the gap between its tabs, in px, as in `#nav` in styles.css. */
const PAD = 4;

/** How far the highlight moves from one tab to the next, in px, on a bar `width` px wide inside its border. */
function stepOf(width: number): number {
  return (width - PAD) / TABS.length;
}

/** The floating tab bar: tap a tab, or drag the highlight along the bar and let go on another tab. */
export function TabBar({ tab, hidden, go }: { tab: Tab; hidden: boolean; go: (t: Tab) => void }) {
  const drag = useRef<{ x: number; from: number; step: number; moved: boolean } | null>(null);
  // The highlight's offset in px while it is dragged
  const [x, setX] = useState<number | null>(null);
  const at = TABS.indexOf(tab);
  const lit = x === null || !drag.current ? at : Math.round(x / drag.current.step);

  const down = (e: PointerEvent<HTMLElement>) => {
    const step = stepOf(e.currentTarget.clientWidth);
    drag.current = { x: e.clientX, from: at * step, step, moved: false };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (!pastSlop(dx, 0)) return;
      // The bar keeps the pointer, so letting go over a tab does not also tap it.
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setX(Math.min(Math.max(d.from + dx, 0), d.step * (TABS.length - 1)));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && x !== null) go(TABS[Math.round(x / d.step)]!);
    setX(null);
  };

  return (
    <nav
      id="nav"
      hidden={hidden}
      className={x === null ? undefined : 'dragging'}
      style={{ '--at': at, ...(x !== null && { '--x': `${x}px` }) } as CSSProperties}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <span className="navpill" aria-hidden="true" />
      <button aria-current={tab === 'library' || undefined} className={lit === 0 ? 'lit' : undefined} onClick={() => go('library')}>
        {/* a comic book: cover, spine, and a speech bubble */}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="2.5" width="16" height="19" rx="2" />
          <path d="M8 2.5v19" />
          <path d="M14 6.5c2.2 0 3.5 1.3 3.5 3s-1.3 3-3.5 3c-.4 0-.8 0-1.2-.1L11 13.5l.4-2c-.6-.5-.9-1.2-.9-2 0-1.7 1.3-3 3.5-3z" />
        </svg>
        My Series
      </button>
      <button aria-current={tab === 'search' || undefined} className={lit === 1 ? 'lit' : undefined} onClick={() => go('search')}>
        {/* a compass */}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="m15.5 8.5-2 5-5 2 2-5z" />
        </svg>
        Browse
      </button>
    </nav>
  );
}
