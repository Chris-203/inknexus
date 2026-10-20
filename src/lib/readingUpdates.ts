import { useSyncExternalStore } from 'react';
import { createChanges } from './changes';
import { readJson, writeJson } from './storage';

// Whether routine reading messages ("Chapter 5 marked read", "Zoom 150%") show, kept on this device only (not in backups).
const KEY = 'inknexus-reading-updates';
const changes = createChanges();

/** On unless turned off. */
export function showsReadingUpdates(): boolean {
  return readJson(KEY) !== false;
}

export function useShowsReadingUpdates(): boolean {
  return useSyncExternalStore(changes.subscribe, showsReadingUpdates);
}

export function setShowsReadingUpdates(on: boolean) {
  writeJson(KEY, on);
  changes.emit();
}
