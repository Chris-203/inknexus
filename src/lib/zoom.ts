import { useEffect, useState } from 'react';

/**
 * Pinch or double-tap zooms the chapter pages only (1x to 4x), keeping the point under your fingers in place.
 * Zooming widens `pages` (CSS variable --z), so normal scrolling pans up, down and sideways,
 * and it never shrinks below the screen width. A single tap or click calls `onTap` with how far down the screen it was,
 * but not a touch that only stops the pages gliding. While the browser has zoomed the
 * whole page anyway (iPhone Safari can, see TopBar), pinches and double-taps are left to the browser, so they can bring
 * it back to 100%.
 * Returns `zoomBy`, which zooms around the middle of the screen and returns the new zoom, and `stop`, which removes the listeners.
 */
export function zoomable(wrap: HTMLElement, pages: HTMLElement, onTap: (y: number) => void): { zoomBy: (d: number) => number; stop: () => void } {
  let z = 1;
  let pinch: { d: number; z: number } | null = null;
  let tap: { x: number; y: number; at: number } | null = null;
  let last: { x: number; y: number; at: number } | null = null;
  let raf = 0;
  let single = 0;
  let touchedAt = 0;
  // Where a single tap was, until the click it fires.
  let pending: number | null = null;
  let browserZoomed = false;

  // #zwrap.pagezoom drops touch-action: pan-x pan-y, which would also stop the browser zooming back out.
  const onViewport = () => {
    browserZoomed = isPageZoomed(window.visualViewport);
    wrap.classList.toggle('pagezoom', browserZoomed);
    if (browserZoomed) endPinch();
  };

  const set = (target: number, cx: number, cy: number) => {
    const nz = Math.min(4, Math.max(1, target));
    if (Math.abs(nz - z) < 0.001) return;
    const r = nz / z;
    const top = pages.getBoundingClientRect().top + scrollY;
    const ox = cx - wrap.getBoundingClientRect().left;
    const px = wrap.scrollLeft + ox;
    const py = scrollY + cy - top;
    z = nz;
    pages.style.setProperty('--z', String(z));
    wrap.classList.toggle('zoomed', z > 1);
    wrap.scrollLeft = px * r - ox;
    window.scrollTo(0, top + py * r - cy);
  };
  const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);

  // Only a pinch cancels touchmove. iPhone waits for a non-passive touchmove listener before it starts each scroll, so
  // one is added only while two fingers are down.
  const hold = (e: TouchEvent) => {
    if (pinch && e.touches.length === 2) e.preventDefault();
  };
  const endPinch = () => {
    pinch = null;
    wrap.removeEventListener('touchmove', hold);
  };

  const start = (e: TouchEvent) => {
    if (browserZoomed) return;
    if (e.touches.length === 2) {
      pinch = { d: dist(e.touches) || 1, z };
      tap = null;
      wrap.addEventListener('touchmove', hold, { passive: false });
    } else if (e.touches.length === 1 && !pinch) {
      const t = e.touches[0]!;
      tap = { x: t.clientX, y: t.clientY, at: Date.now() };
    }
  };
  const move = (e: TouchEvent) => {
    if (tap) {
      const t = e.touches[0]!;
      if (Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 10) tap = null;
    }
    if (!pinch || e.touches.length !== 2) return;
    const t = e.touches;
    const nz = (pinch.z * dist(t)) / pinch.d;
    const cx = (t[0]!.clientX + t[1]!.clientX) / 2;
    const cy = (t[0]!.clientY + t[1]!.clientY) / 2;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => set(nz, cx, cy));
  };
  const end = (e: TouchEvent) => {
    touchedAt = Date.now();
    if (pinch) {
      if (!e.touches.length) endPinch();
      return;
    }
    if (!tap || e.touches.length || Date.now() - tap.at > 250) {
      tap = null;
      return;
    }
    const now = Date.now();
    if (last && now - last.at < 320 && Math.hypot(tap.x - last.x, tap.y - last.y) < 30) {
      clearTimeout(single);
      pending = null;
      set(z > 1.05 ? 1 : 2.5, tap.x, tap.y);
      last = null;
    } else {
      last = { ...tap, at: now };
      pending = tap.y;
    }
    tap = null;
  };
  // A single tap goes by the click it fires: a touch that only stops the pages gliding fires none, so it is not a tap.
  // It waits out a possible second tap, so a double tap only zooms. Mouse clicks count at once.
  const click = (e: MouseEvent) => {
    if (Date.now() - touchedAt > 800) return onTap(e.clientY);
    if (pending === null) return;
    single = window.setTimeout(onTap, 320, pending);
    pending = null;
  };

  onViewport();
  window.visualViewport?.addEventListener('resize', onViewport);
  wrap.addEventListener('touchstart', start, { passive: true });
  wrap.addEventListener('touchmove', move, { passive: true });
  wrap.addEventListener('touchend', end, { passive: true });
  wrap.addEventListener('click', click);
  return {
    zoomBy: (d) => {
      set(z + d, innerWidth / 2, innerHeight / 2);
      return z;
    },
    stop: () => {
      cancelAnimationFrame(raf);
      clearTimeout(single);
      window.visualViewport?.removeEventListener('resize', onViewport);
      wrap.removeEventListener('touchstart', start);
      wrap.removeEventListener('touchmove', move);
      wrap.removeEventListener('touchmove', hold);
      wrap.removeEventListener('touchend', end);
      wrap.removeEventListener('click', click);
    },
  };
}

/**
 * Keeps the whole app from zooming, like a native app; only the reader's pages zoom (see zoomable). touch-action on
 * html stops pinch and double-tap zoom, and cancelling Safari's gesture events stops the pinches it still lets through.
 * If the browser has zoomed the page anyway (over another site in the site view), both are lifted so it can get back
 * to 100%.
 */
export function lockPageZoom(): void {
  const vv = window.visualViewport;
  const sync = () => document.documentElement.classList.toggle('pagezoom', isPageZoomed(vv));
  const gesture = (e: Event) => {
    if (!isPageZoomed(vv)) e.preventDefault();
  };
  sync();
  vv?.addEventListener('resize', sync);
  document.addEventListener('gesturestart', gesture);
  document.addEventListener('gesturechange', gesture);
}

/**
 * The browser's own zoom of the whole page: its scale, where the part on screen starts and how big it is, in CSS
 * pixels, and whether it is still changing.
 */
export type PageZoom = { scale: number; left: number; top: number; width: number; height: number; moving: boolean };

/** Whether the browser has zoomed the whole page in or out, more than about 5% away from 100%. */
export function isPageZoomed(vv: VisualViewport | null | undefined): boolean {
  return !!vv && Math.abs(vv.scale - 1) > 0.05;
}

/** The browser's zoom of the whole page, or null when it is at about 100%. */
export function pageZoom(vv: VisualViewport, moving: boolean): PageZoom | null {
  return isPageZoomed(vv) ? { scale: vv.scale, left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height, moving } : null;
}

/**
 * Calls `set` with the browser's zoom of the whole page now and as it changes. The browser reports the zoom only
 * after each step, so controls placed from it lag behind a pinch or pan: while it changes, `set` gets one zoom marked
 * `moving` so they can hide, then the settled zoom a moment after the last change. Returns a function that stops.
 */
export function followPageZoom(vv: VisualViewport, set: (z: PageZoom | null) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let moving = false;
  const settle = () => {
    moving = false;
    set(pageZoom(vv, false));
  };
  const change = () => {
    clearTimeout(timer);
    const z = pageZoom(vv, true);
    if (!z) return settle();
    timer = setTimeout(settle, 200);
    if (!moving) set(z);
    moving = true;
  };
  settle();
  vv.addEventListener('resize', change);
  vv.addEventListener('scroll', change);
  return () => {
    clearTimeout(timer);
    vv.removeEventListener('resize', change);
    vv.removeEventListener('scroll', change);
  };
}

/**
 * Pinching over another site shown in the app zooms the whole app, and the app can neither block that nor see the
 * touches; iPhone Safari also does it over the reader's pages when a scroll is still moving. Following the zoom lets
 * the top bar stay at normal size on screen (see TopBar).
 */
export function usePageZoom(): PageZoom | null {
  const [z, setZ] = useState<PageZoom | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    return vv ? followPageZoom(vv, setZ) : undefined;
  }, []);
  return z;
}
