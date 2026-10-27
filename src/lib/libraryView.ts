import { useSyncExternalStore } from 'react';
import { createChanges } from './changes';
import { readJson, writeJson } from './storage';

// How My Series shows the library, big cards or a compact list, kept on this device only (not in backups).
const KEY = 'inknexus-library-view';
const changes = createChanges();

export type LibraryView = 'cards' | 'list';

/** Cards unless the list was chosen. */
export function libraryView(): LibraryView {
  return readJson(KEY) === 'list' ? 'list' : 'cards';
}

export function useLibraryView(): LibraryView {
  return useSyncExternalStore(changes.subscribe, libraryView);
}

export function setLibraryView(v: LibraryView) {
  writeJson(KEY, v);
  changes.emit();
}
