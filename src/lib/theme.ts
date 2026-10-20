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

/** The saved theme, or Sumi Ink (also for a theme that was removed). */
export function getTheme(): Theme {
  const v = readJson(KEY);
  return THEMES.find((t) => t.id === v)?.id ?? 'sumi';
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

/** Save and show a theme. Every color changes in the same frame, with no fade: iPhone Safari takes its bar color and its
 * black or white status bar icons from body's background, and an in-between color could leave it with the wrong icons. */
export function setTheme(t: Theme) {
  writeJson(KEY, t);
  applyTheme();
  changes.emit();
}
