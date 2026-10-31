import { useSyncExternalStore } from 'react';
import { createChanges } from './changes';
import { readJson, writeJson } from './storage';
import type { Series, Shelf } from './types';

// How My Series shows the library, big cards or a compact list, and which tab is open, kept on this device only (not in backups).
const KEY = 'inknexus-library-view';
const SHELF_KEY = 'inknexus-library-shelf';
const changes = createChanges();

export type LibraryView = 'cards' | 'list';

/** My Series' shelves, in tab order. */
export const SHELVES: { k: Shelf; n: string }[] = [
  { k: 'reading', n: 'Reading' },
  { k: 'plan', n: 'Plan to read' },
  { k: 'done', n: 'Completed' },
  { k: 'drop', n: 'Dropped' },
];

/** A shelf's name, as its tab shows it. */
export function shelfName(k: Shelf): string {
  return SHELVES.find((q) => q.k === k)!.n;
}

/** A tab in My Series: a shelf, or the chapters saved for reading offline. */
export type LibraryTab = Shelf | 'downloads';

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

/** The open tab: Reading unless another one was chosen. */
export function libraryShelf(): LibraryTab {
  const v = readJson(SHELF_KEY);
  return v === 'downloads' ? v : (SHELVES.find((s) => s.k === v)?.k ?? 'reading');
}

export function useLibraryShelf(): LibraryTab {
  return useSyncExternalStore(changes.subscribe, libraryShelf);
}

export function setLibraryShelf(k: LibraryTab) {
  writeJson(SHELF_KEY, k);
  changes.emit();
}

/** The shelf a series is on. */
export function shelfOf(x: Series): Shelf {
  return x.shelf ?? 'reading';
}
