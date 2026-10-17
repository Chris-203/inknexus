import { useSyncExternalStore } from 'react';
import { createChanges } from './changes';
import { readJson, writeJson } from './storage';

// The color theme, kept on this device only (not in the library or backups). Its colors are in styles.css.
const KEY = 'inknexus-theme';
export const THEMES = [
  { id: 'canvas', name: 'Deep Canvas' },
  { id: 'midnight', name: 'Midnight Manga' },
  { id: 'eink', name: 'E-Ink' },
  { id: 'pulp', name: 'Vintage Pulp' },
] as const;
export type Theme = (typeof THEMES)[number]['id'];
const changes = createChanges();
const COLORS = ['--bg', '--surface', '--line', '--text', '--muted', '--accent', '--on-accent', '--danger'];
// A quick fade through lighter in-between colors than CSS blends, the way iPhone Safari fades its bars into a new color
// (fitted from iPhone screen recordings).
const FADE_MS = 90;
const FADE_GAMMA = 1.6;
let fading = 0;
let settling = 0;

/** The saved theme, or Deep Canvas. */
export function getTheme(): Theme {
  const v = readJson(KEY);
  return THEMES.find((t) => t.id === v)?.id ?? 'canvas';
}

export function useTheme(): Theme {
  return useSyncExternalStore(changes.subscribe, getTheme);
}

/** Show the saved theme: set it on the page, and give the browser bar its background. */
export function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = getTheme();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
}

/** Save and show a theme, fading the page into it the way iPhone Safari fades its bars (see FADE_MS). */
export function setTheme(t: Theme) {
  writeJson(KEY, t);
  // The fade runs on body, so html keeps the theme's own colors. iPhone Safari picks black or white status bar icons
  // from html's background, which then changes once, straight to the new color, instead of through every frame of the fade.
  const page = document.body;
  const from = COLORS.map((k) => rgbOf(getComputedStyle(page).getPropertyValue(k)));
  cancelAnimationFrame(fading);
  COLORS.forEach((k) => page.style.removeProperty(k));
  applyTheme();
  changes.emit();
  // Safari can still keep icons it picked from the color html had a moment before. html's background is nudged toward
  // gray until the switch has settled (data-settling in styles.css), so changing back makes Safari read the final color again.
  const root = document.documentElement;
  root.dataset.settling = '';
  clearTimeout(settling);
  settling = window.setTimeout(() => delete root.dataset.settling, FADE_MS + 150);
  const to = COLORS.map((k) => rgbOf(getComputedStyle(page).getPropertyValue(k)));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || [...from, ...to].some((c) => !c)) return;
  const start = performance.now();
  const step = (now: number) => {
    // a frame's time can be from just before the tap
    const p = Math.min(1, Math.max(0, (now - start) / FADE_MS));
    COLORS.forEach((k, i) => (p < 1 ? page.style.setProperty(k, blend(from[i]!, to[i]!, p)) : page.style.removeProperty(k)));
    if (p < 1) fading = requestAnimationFrame(step);
  };
  step(start);
}

/** The red, green and blue of a computed rgb() color, or null if it is not one. */
export function rgbOf(c: string): number[] | null {
  const v = c
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  return c.trim().startsWith('rgb') && v?.length === 3 ? v : null;
}

/** The color `p` of the way (0 to 1) from `a` to `b`, blended like Safari blends its bars: in linear light raised to 1/FADE_GAMMA. */
export function blend(a: number[], b: number[], p: number): string {
  return `rgb(${a.map((v, i) => Math.round(fromFade(toFade(v) + (toFade(b[i]!) - toFade(v)) * p))).join(' ')})`;
}

// A 0 to 255 sRGB channel to Safari's blending space (linear light raised to 1/FADE_GAMMA), and back.
function toFade(v: number): number {
  const c = v / 255;
  return (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) ** (1 / FADE_GAMMA);
}

function fromFade(f: number): number {
  const l = f ** FADE_GAMMA;
  return 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
}
