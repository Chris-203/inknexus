/**
 * Pinch or double-tap zooms the chapter pages only (1x to 4x), keeping the point under your fingers in place.
 * Zooming widens `pages` (CSS variable --z), so normal scrolling pans up, down and sideways,
 * and it never shrinks below the screen width. A single tap or click calls `onTap`.
 * Returns `zoomBy`, which zooms around the middle of the screen and returns the new zoom, and `stop`, which removes the listeners.
 */
export function zoomable(wrap: HTMLElement, pages: HTMLElement, onTap: () => void): { zoomBy: (d: number) => number; stop: () => void } {
  let z = 1;
  let pinch: { d: number; z: number } | null = null;
  let tap: { x: number; y: number; at: number } | null = null;
  let last: { x: number; y: number; at: number } | null = null;
  let raf = 0;
  let single = 0;
  let touchedAt = 0;

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
    touchedAt = Date.now();
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
      clearTimeout(single);
      set(z > 1.05 ? 1 : 2.5, tap.x, tap.y);
      last = null;
    } else {
      last = { ...tap, at: now };
      // Wait out a possible second tap, so a double tap only zooms.
      single = window.setTimeout(onTap, 320);
    }
    tap = null;
  };
  // Mouse clicks; the click a touch also fires is already handled above.
  const click = () => {
    if (Date.now() - touchedAt > 800) onTap();
  };

  wrap.addEventListener('touchstart', start, { passive: true });
  wrap.addEventListener('touchmove', move, { passive: false });
  wrap.addEventListener('touchend', end);
  wrap.addEventListener('click', click);
  return {
    zoomBy: (d) => {
      set(z + d, innerWidth / 2, innerHeight / 2);
      return z;
    },
    stop: () => {
      cancelAnimationFrame(raf);
      clearTimeout(single);
      wrap.removeEventListener('touchstart', start);
      wrap.removeEventListener('touchmove', move);
      wrap.removeEventListener('touchend', end);
      wrap.removeEventListener('click', click);
    },
  };
}
