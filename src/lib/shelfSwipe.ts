import { useCallback, useEffect, useRef, useState } from 'react';
import type { LibraryTab } from './libraryView';
import { useSwipe } from './swipe';

/**
 * Sideways swipes between My Series' shelves: a swipe to the left opens the shelf on the right of `shelf`, and a swipe to
 * the right the one on its left. Gives where `shelf` is among `tabs` (`at`), the tab to light up (`lit`), and the refs
 * for the track of shelves (`setTrack`) and the row of tabs (`tabsRef`).
 */
export function useShelfSwipe(tabs: readonly { k: LibraryTab }[], shelf: LibraryTab, openShelf: (k: LibraryTab) => void) {
  const at = tabs.findIndex((q) => q.k === shelf);
  // The shelf a swipe is settling on: its tab lights up as the finger lets go, not once the shelf has slid into place.
  const [aim, setAim] = useState<LibraryTab | null>(null);
  const lit = aim ?? shelf;
  const swipe = useSwipe(
    (dir) => !!tabs[at - dir],
    (dir) => {
      setAim(null);
      openShelf(tabs[at - dir]!.k);
    },
    false,
    (dir) => setAim(tabs[at - dir]!.k),
  );
  // A shelf pulled in by a swipe shows from its top, where it opens, however far down this one is scrolled (`.swiping` in styles.css).
  const trackRef = useRef<HTMLDivElement | null>(null);
  const setTrack = useCallback(
    (el: HTMLDivElement | null) => {
      trackRef.current = el;
      return swipe(el);
    },
    [swipe],
  );
  useEffect(() => {
    const down = () => trackRef.current?.style.setProperty('--scrolled', `${scrollY}px`);
    addEventListener('pointerdown', down, true);
    return () => removeEventListener('pointerdown', down, true);
  }, []);
  // A swipe can open a shelf whose tab is scrolled out of the row.
  const tabsRef = useRef<HTMLDivElement>(null);
  // Braces matter: newer Chrome returns a Promise from scrollIntoView, and React would call it as the cleanup.
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-pressed=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [lit]);
  return { at, lit, setTrack, tabsRef };
}
