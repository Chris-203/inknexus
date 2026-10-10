import { useSyncExternalStore } from 'react';
import { createChanges } from './changes';
import { isObj, readJson, writeJson } from './storage';

// Per-site settings for link-only sources, kept on this device only (never in the library or backups).
const BROWSER_KEY = 'inknexus-open-in-browser';
const ZOOM_KEY = 'inknexus-frame-zoom';
export const ZOOM_STEPS = [1, 1.25, 1.5, 1.75, 2];
const changes = createChanges();

function browserSites(): string[] {
  const v = readJson(BROWSER_KEY);
  return Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string') : [];
}

/** Sites to open in the browser instead of in the app: ones that block being shown in the app, or that iPhone Safari zooms the whole app over. */
export function opensInBrowser(site: string): boolean {
  return browserSites().includes(site);
}

export function useOpensInBrowser(site: string): boolean {
  return useSyncExternalStore(changes.subscribe, () => opensInBrowser(site));
}

export function setOpensInBrowser(site: string, on: boolean) {
  writeJson(BROWSER_KEY, [...browserSites().filter((h) => h !== site), ...(on ? [site] : [])]);
  changes.emit();
}

/** The site view's zoom for a site: 100% unless set. */
export function getFrameZoom(site: string): number {
  const all = readJson(ZOOM_KEY);
  const z = isObj(all) ? all[site] : undefined;
  return typeof z === 'number' && ZOOM_STEPS.includes(z) ? z : 1;
}

export function setFrameZoom(site: string, z: number) {
  const all = readJson(ZOOM_KEY);
  writeJson(ZOOM_KEY, { ...(isObj(all) ? all : {}), [site]: z });
}

/** The next zoom step after `z`, back to 100% after 200%. One button steps through them, so the site bar fits a phone with 44px buttons. */
export function nextZoom(z: number): number {
  return ZOOM_STEPS.find((s) => s > z + 0.001) ?? ZOOM_STEPS[0]!;
}
