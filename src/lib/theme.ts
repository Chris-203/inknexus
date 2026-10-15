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

/** Save and show a theme. The page fades into it over the time iPhone Safari takes to fade its status bar and toolbar, so they change together. */
export function setTheme(t: Theme) {
  writeJson(KEY, t);
  const show = () => {
    applyTheme();
    changes.emit();
  };
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(show);
  else show();
}
