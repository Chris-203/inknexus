import { useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';

/** Which way the finger moves: 1 to the right, toward what is before it (going back, the shelf on the left), -1 to the left. */
export type Dir = 1 | -1;

interface Swipe {
  el: HTMLElement;
  can: (dir: Dir) => boolean;
  go: (dir: Dir) => void;
  aim: (dir: Dir) => void;
  leaves: boolean;
}

/** How close to a side of the screen a touch starts for Safari to take it as a swipe back or forward through history. */
const EDGE = 24;
/** How close to the left side a swipe that closes a view starts, as on iPhone: about a thumb's width, wider than Safari's own. */
const BACK_EDGE = 40;
/** How far a finger moves before its touch is a swipe or a scroll rather than a tap. */
const SLOP = 10;
/** How long a page takes to settle after the finger lets go, in ms: about as long as WEBTOON's tabs take. */
const SETTLE = 350;

let target: Swipe | null = null;
let unpeek = 0;

/** Where a sideways swipe that ends at `dx` (px), moving at `v` (px/ms), takes the page: `dir` when it went far or fast enough, otherwise 0. */
export function swipeEnd(dx: number, v: number, width: number): Dir | 0 {
  const dir: Dir = dx > 0 ? 1 : -1;
  return Math.abs(dx) > width / 4 || dir * v > 0.5 ? dir : 0;
}

/** Whether a finger that has moved `dx` and `dy` px since it touched down is swiping or scrolling, no longer tapping or holding. */
export function pastSlop(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= SLOP;
}

/** Whether a touch that starts `x` px from the left side can swipe a view: one that closes only from the side, like a swipe back on iPhone. */
export function swipeStarts(x: number, leaves: boolean): boolean {
  return !leaves || x < BACK_EDGE;
}

/**
 * How far the page follows a finger `dx` px along: all the way, or a third of it where there is nothing to swipe to, so it gives and bounces back.
 * A view that closes stays still the other way, as nothing is beside it.
 */
export function swipeFollow(dx: number, can: boolean, leaves = false): number {
  if (can) return dx;
  return leaves ? 0 : dx / 3;
}

/** The nearest element from `el` up that scrolls along `axis`. */
function scroller(el: Element | null, axis: 'x' | 'y'): Element | null {
  for (; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el)[axis === 'x' ? 'overflowX' : 'overflowY'];
    const more = axis === 'x' ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight;
    if (more && (s === 'auto' || s === 'scroll')) return el;
  }
  return null;
}

function slide(el: HTMLElement, x: number, ms: number) {
  el.style.transition = ms ? `transform ${ms}ms ease` : '';
  el.style.transform = x ? `translateX(${x}px)` : '';
}

/** Shows the view that a closing view goes back to under it while it slides (`.peek` in styles.css). */
function peek(on: boolean) {
  clearTimeout(unpeek);
  document.body.classList.toggle('peek', on);
}

/** Moves a swiped element back into place, and hides the view under it once it is there. */
function settle(sw: Swipe, ms: number) {
  slide(sw.el, 0, ms);
  unpeek = window.setTimeout(() => peek(false), ms);
}

/**
 * Sideways swipes for the views with the bottom bar. Safari and Chrome would take them as back and forward through history
 * (overscroll-behavior-x in styles.css stops Chrome's); instead the element given to useSwipe follows the finger.
 * Returns the cleanup.
 */
export function catchSwipes(): () => void {
  let g: { x: number; y: number; t: number; at: Element; edge: boolean; axis: 'x' | 'y' | null; dx: number; v: number; sw: Swipe | null } | null = null;

  const start = (e: TouchEvent) => {
    const t = e.touches[0]!;
    const edge = t.clientX < EDGE || t.clientX > innerWidth - EDGE;
    // Safari's swipe through history starts at the screen's sides and only a cancelled touchstart stops it.
    // A cancelled touch neither taps nor scrolls, so end() and move() do that for it.
    if (edge) e.preventDefault();
    if (g?.axis === 'x' && g.sw) settle(g.sw, SETTLE);
    g = null;
    if (e.touches.length !== 1) return;
    const at = e.target as Element;
    // Sheets and rows that scroll sideways keep their own touches.
    // Under a short shelf, the touch lands on the page itself.
    const page = at === document.documentElement || at === document.body || at.id === 'app';
    const on = target && (target.el.contains(at) || (page && t.clientY > target.el.getBoundingClientRect().top));
    const ok = on && !at.closest('#modal') && !scroller(at, 'x') && swipeStarts(t.clientX, target!.leaves);
    g = { x: t.clientX, y: t.clientY, t: e.timeStamp, at, edge, axis: null, dx: 0, v: 0, sw: ok ? target : null };
  };

  const move = (e: TouchEvent) => {
    if (!g) return;
    const t = e.touches[0]!;
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (!g.axis) {
      if (!pastSlop(dx, dy)) return;
      g.axis = g.sw && Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (g.axis === 'y') {
      if (g.edge) (scroller(g.at, 'y') ?? document.scrollingElement)?.scrollBy(0, g.y - t.clientY);
      g.y = t.clientY;
      return;
    }
    // Once a touch is a swipe, the page does not scroll or bounce along with it.
    if (e.cancelable) e.preventDefault();
    g.v = (dx - g.dx) / Math.max(1, e.timeStamp - g.t);
    g.t = e.timeStamp;
    g.dx = dx;
    if (g.sw!.leaves) peek(true);
    slide(g.sw!.el, swipeFollow(dx, g.sw!.can(dx > 0 ? 1 : -1), g.sw!.leaves), 0);
  };

  const end = (e: TouchEvent) => {
    if (!g || e.touches.length) return;
    const { sw, axis, dx, v, edge, at } = g;
    g = null;
    if (!axis && edge) {
      if (at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement) at.focus();
      else at.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
    if (axis !== 'x' || !sw) return;
    const ms = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : SETTLE;
    const w = sw.el.offsetWidth;
    const dir = e.type === 'touchend' ? swipeEnd(dx, v, w) : 0;
    if (!dir || !sw.can(dir)) return settle(sw, ms);
    // The element moves a whole width, which brings in what sits beside it.
    slide(sw.el, dir * w, ms);
    sw.aim(dir);
    setTimeout(() => {
      if (sw.leaves) return sw.go(dir);
      // The element now shows what was beside it in its own place, in the same frame as it moves back.
      flushSync(() => sw.go(dir));
      slide(sw.el, 0, 0);
    }, ms);
  };

  addEventListener('touchstart', start, { passive: false });
  addEventListener('touchmove', move, { passive: false });
  addEventListener('touchend', end, { passive: true });
  addEventListener('touchcancel', end, { passive: true });
  return () => {
    removeEventListener('touchstart', start);
    removeEventListener('touchmove', move);
    removeEventListener('touchend', end);
    removeEventListener('touchcancel', end);
  };
}

/**
 * A ref for the element a sideways swipe moves. `can` says whether there is something that way; `go` goes there.
 * The element holds what is beside it, which `go` moves into its place, or with `leaves` it slides out, for a view that closes.
 * `aim` is told where a swipe goes as the finger lets go, before `go` once the element has settled there.
 */
export function useSwipe(can: (dir: Dir) => boolean, go: (dir: Dir) => void, leaves = false, aim?: (dir: Dir) => void) {
  const latest = useRef({ can, go, aim });
  latest.current = { can, go, aim };
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const sw: Swipe = { el, can: (dir) => latest.current.can(dir), go: (dir) => latest.current.go(dir), aim: (dir) => latest.current.aim?.(dir), leaves };
      target = sw;
      return () => {
        if (target === sw) target = null;
        // A view that a swipe closed hides the view under it as it goes, in the same frame as that view takes its place.
        if (leaves) peek(false);
      };
    },
    [leaves],
  );
}
