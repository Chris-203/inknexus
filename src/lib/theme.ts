import { useSyncExternalStore } from 'react';
import { createChanges } from './changes';
import { readJson, writeJson } from './storage';

// The color theme, kept on this device only (not in the library or backups). Its colors are in styles.css.
const KEY = 'inknexus-theme';
export const THEMES = [
  { id: 'midnight', name: 'Midnight Manga', dark: true },
  { id: 'sumi', name: 'Sumi Ink', dark: true },
  { id: 'neon', name: 'Neon Violet', dark: true },
  { id: 'matcha', name: 'Matcha', dark: true },
  { id: 'eink', name: 'E-Ink', dark: false },
  { id: 'washi', name: 'Washi Paper', dark: false },
  { id: 'mist', name: 'Violet Mist', dark: false },
  { id: 'sencha', name: 'Sencha', dark: false },
] as const;
export type Theme = (typeof THEMES)[number]['id'];
const changes = createChanges();

// A theme being tried in the Settings drawer, shown until it is made the default; reopening the app goes back to the default.
let trying: Theme | null = null;

/** The saved default theme, or Sumi Ink (also for a theme that was removed). */
export function getDefaultTheme(): Theme {
  const v = readJson(KEY);
  return THEMES.find((t) => t.id === v)?.id ?? 'sumi';
}

/** The theme on show: the one being tried, or the default. */
export function getTheme(): Theme {
  return trying ?? getDefaultTheme();
}

export function useTheme(): Theme {
  return useSyncExternalStore(changes.subscribe, getTheme);
}

export function useDefaultTheme(): Theme {
  return useSyncExternalStore(changes.subscribe, getDefaultTheme);
}

/** Show the theme: set it on the page, and give the browser bar its background. */
export function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = getTheme();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
}

/** Show a theme without saving it. Every color changes in the same frame, with no fade: iPhone Safari takes its bar color and
 * its black or white status bar icons from body's background, and an in-between color could leave it with the wrong icons. */
export function setTheme(t: Theme) {
  trying = t === getDefaultTheme() ? null : t;
  applyTheme();
  changes.emit();
}

/** Save the theme on show as the default. */
export function saveTheme() {
  writeJson(KEY, getTheme());
  trying = null;
  changes.emit();
}
