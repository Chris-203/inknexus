import { stepIn } from './siteSettings';
import { readJson, writeJson } from './storage';

// The reader's auto scroll speed and tap to scroll, kept on this device only (never in the library or backups).
const KEY = 'inknexus-scroll-speed';
const TAP_KEY = 'inknexus-tap-scroll';
/** Speeds as multiples of 1×, an unhurried read of a long strip. */
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const PX_PER_SEC = 175;

/** The saved speed, 1× unless set. */
export function getScrollSpeed(): number {
  const s = readJson(KEY);
  return typeof s === 'number' && SPEEDS.includes(s) ? s : 1;
}

export function setScrollSpeed(s: number) {
  writeJson(KEY, s);
}

/** The speed `d` steps away from `s` (-1 slower, 1 faster), staying within 0.25×–3×. */
export function stepSpeed(s: number, d: number): number {
  return stepIn(SPEEDS, s, d);
}

/**
 * Whole pixels to scroll `ms` after the last frame at `speed`, and the fraction to carry into the next frame, since a
 * slow speed moves less than a pixel a frame. A long gap (the page was in the background) counts as a tenth of a second,
 * so the pages never jump.
 */
export function scrollDistance(speed: number, ms: number, carry: number): [px: number, carry: number] {
  const d = (speed * PX_PER_SEC * Math.min(ms, 100)) / 1000 + carry;
  const px = Math.floor(d);
  return [px, d - px];
}

/** Whether tapping the top or bottom of the pages scrolls them, rather than only showing the controls. Off unless set. */
export function getTapScroll(): boolean {
  return readJson(TAP_KEY) === true;
}

export function setTapScroll(on: boolean) {
  writeJson(TAP_KEY, on);
}

/**
 * With tap to scroll on, what a tap `y` px down a screen `h` px tall does: the top third scrolls up, the bottom third
 * scrolls down, and the middle shows or hides the controls.
 */
export function tapAction(y: number, h: number): 'up' | 'down' | 'bar' {
  if (y < h / 3) return 'up';
  return y > (h * 2) / 3 ? 'down' : 'bar';
}
