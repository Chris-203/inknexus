import { useEffect, useState } from 'react';
import { useApp } from '../context';

/** How far the pages rise, in px, when pulling up at the end of a chapter to open the next one. */
export const PULL = 80;

/** How far the pages have risen for a finger that went down at `from` and is now at `y`: half as far as it moved up, up to PULL. */
export function pullBy(from: number, y: number): number {
  return Math.min(PULL, Math.max(0, (from - y) / 2));
}

/**
 * Pulling up at the end of a chapter of series `id` opens chapter `to`, as in webtoon apps: the pages rise by up to PULL
 * px, and a full pull opens the chapter. Only a finger pulls, so auto scroll stops at the end. Nothing pulls while `to`
 * is undefined. Gives how far the pages have risen.
 */
export function usePullNext(id: string, to: number | undefined): number {
  const { navigate } = useApp();
  const [pulled, setPulled] = useState(0);
  useEffect(() => {
    if (to === undefined) return;
    let from: number | null = null;
    const atEnd = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1 || (from === null && !atEnd())) {
        // Only a pull that started needs undoing; most moves are plain scrolling and change nothing.
        if (from !== null) setPulled(0);
        from = null;
        return;
      }
      const y = e.touches[0]!.clientY;
      from ??= y;
      const d = pullBy(from, y);
      setPulled(d);
      if (d < PULL) return;
      from = null;
      removeEventListener('touchmove', move);
      navigate({ name: 'reader', id, n: to }, true);
    };
    // The page's own bounce is off only while a finger is down, so a pull moves nothing but the pages, while a flick
    // that glides into the end after the finger lifts still bounces as everywhere else on iPhone.
    const hold = (on: boolean) => document.documentElement.classList.toggle('touching', on);
    const touch = () => hold(true);
    const release = () => {
      from = null;
      hold(false);
      setPulled(0);
    };
    addEventListener('touchstart', touch, { passive: true });
    addEventListener('touchmove', move, { passive: true });
    addEventListener('touchend', release, { passive: true });
    addEventListener('touchcancel', release, { passive: true });
    return () => {
      hold(false);
      removeEventListener('touchstart', touch);
      removeEventListener('touchmove', move);
      removeEventListener('touchend', release);
      removeEventListener('touchcancel', release);
    };
  }, [to, id, navigate]);
  return pulled;
}
