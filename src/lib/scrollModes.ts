import { useEffect, useState } from 'react';
import { useApp } from '../context';
import { getScrollSpeed, getTapScroll, scrollDistance, setScrollSpeed, setTapScroll, stepSpeed } from './autoScroll';

/**
 * The reader's auto scroll and tap to scroll, which are never on together: turning one on turns the other off.
 * `auto` shows auto scroll's controls and `paused` stops it there; it pauses itself at the end of the chapter. It runs
 * once the pages are `ready`, and waits while `waiting` (the chapter list is open).
 */
export function useScrollModes(ready: boolean, waiting: boolean) {
  const { toast } = useApp();
  const [auto, setAuto] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(getScrollSpeed);
  const [tapScroll, setTapScrollOn] = useState(getTapScroll);

  // Auto scroll moves the pages on each frame, and waits while a finger is on the screen or the chapter list is open.
  useEffect(() => {
    if (!auto || paused || waiting || !ready) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let held = false;
    const hold = (e: TouchEvent) => {
      held = e.touches.length > 0;
    };
    const frame = (t: number) => {
      if (!held) {
        const [px, rest] = scrollDistance(speed, t - last, carry);
        carry = rest;
        if (innerHeight + scrollY >= document.documentElement.scrollHeight - 1) return setPaused(true);
        if (px) scrollBy(0, px);
      }
      last = t;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    for (const ev of ['touchstart', 'touchend', 'touchcancel'] as const) addEventListener(ev, hold, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      for (const ev of ['touchstart', 'touchend', 'touchcancel'] as const) removeEventListener(ev, hold);
    };
  }, [auto, paused, waiting, ready, speed]);

  const tapScrollTo = (on: boolean) => {
    setTapScrollOn(on);
    setTapScroll(on);
  };
  return {
    auto,
    paused,
    setPaused,
    speed,
    tapScroll,
    toggleAuto() {
      if (!auto && tapScroll) {
        tapScrollTo(false);
        toast('Tap to scroll off');
      }
      setAuto(!auto);
      setPaused(false);
    },
    toggleTapScroll() {
      if (!tapScroll) setAuto(false);
      tapScrollTo(!tapScroll);
      toast(tapScroll ? 'Tap to scroll off' : 'Tap to scroll on: tap the bottom of the screen to go down, the top to go back');
    },
    changeSpeed(d: number) {
      const s = stepSpeed(speed, d);
      setSpeed(s);
      setScrollSpeed(s);
    },
  };
}
