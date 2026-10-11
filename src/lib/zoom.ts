import { useEffect, useState } from 'react';

/**
 * Pinch or double-tap zooms the chapter pages only (1x to 4x), keeping the point under your fingers in place.
 * Zooming widens `pages` (CSS variable --z), so normal scrolling pans up, down and sideways,
 * and it never shrinks below the screen width. Returns a function that removes the listeners.
 */
export function zoomable(wrap: HTMLElement, pages: HTMLElement): () => void {
  let z = 1;
  let pinch: { d: number; z: number } | null = null;
  let tap: { x: number; y: number; at: number } | null = null;
  let last: { x: number; y: number; at: number } | null = null;
  let raf = 0;

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
    wrap.scrollLeft = px * r - ox;
    window.scrollTo(0, top + py * r - cy);
  };
  const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);

  const start = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      pinch = { d: dist(e.touches) || 1, z };
      tap = null;
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
    e.preventDefault();
    const t = e.touches;
    const nz = (pinch.z * dist(t)) / pinch.d;
    const cx = (t[0]!.clientX + t[1]!.clientX) / 2;
    const cy = (t[0]!.clientY + t[1]!.clientY) / 2;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => set(nz, cx, cy));
  };
  const end = (e: TouchEvent) => {
    if (pinch) {
      if (!e.touches.length) pinch = null;
      return;
    }
    if (!tap || e.touches.length || Date.now() - tap.at > 250) {
      tap = null;
      return;
    }
    const now = Date.now();
    if (last && now - last.at < 320 && Math.hypot(tap.x - last.x, tap.y - last.y) < 30) {
      e.preventDefault();
      set(z > 1.05 ? 1 : 2.5, tap.x, tap.y);
      last = null;
    } else last = { ...tap, at: now };
    tap = null;
  };

  wrap.addEventListener('touchstart', start, { passive: true });
  wrap.addEventListener('touchmove', move, { passive: false });
  wrap.addEventListener('touchend', end);
  // Safari can still pinch the whole page over the pages despite touch-action; its gesture events stop that here only.
  const gesture = (e: Event) => e.preventDefault();
  wrap.addEventListener('gesturestart', gesture);
  wrap.addEventListener('gesturechange', gesture);
  return () => {
    cancelAnimationFrame(raf);
    wrap.removeEventListener('touchstart', start);
    wrap.removeEventListener('touchmove', move);
    wrap.removeEventListener('touchend', end);
    wrap.removeEventListener('gesturestart', gesture);
    wrap.removeEventListener('gesturechange', gesture);
  };
}

/** The browser's own zoom of the whole page: its scale, and where the part on screen starts and how big it is, in CSS pixels. */
export type PageZoom = { scale: number; left: number; top: number; width: number; height: number };

/** The browser's zoom of the whole page, or null when it is at about 100%. */
export function pageZoom(vv: VisualViewport): PageZoom | null {
  return vv.scale > 1.05 ? { scale: vv.scale, left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height } : null;
}

/**
 * Pinching over another site shown in the app zooms the whole app, and the app can neither block that nor see the
 * touches. Following the zoom lets the site view keep its own controls at normal size on screen.
 */
export function usePageZoom(): PageZoom | null {
  const [z, setZ] = useState<PageZoom | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setZ(pageZoom(vv));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return z;
}
