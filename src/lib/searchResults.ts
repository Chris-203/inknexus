import { saveData } from './preload';
import { isObj, readJson, writeJson } from './storage';
import type { SearchResult } from './types';
import { browse, type BrowseSort } from '../sources/mangadex';

/**
 * Search and browse results kept on the device under their own key, never in the library or backups, so the Search tab
 * opens on results instead of "Loading…". Results are used as is for 30 minutes, then shown while they reload, and
 * dropped after a day.
 */
const KEY = 'inknexus-search';
const FRESH = 30 * 60 * 1000;
const MAX_AGE = 24 * 60 * 60 * 1000;
/** How many result lists are kept, newest last; descriptions make them big and storage is shared with chapter lists. */
const KEEP = 10;

type Entry = { at: number; res: SearchResult[] };

function isEntry(v: unknown): v is Entry {
  return isObj(v) && typeof v.at === 'number' && Array.isArray(v.res);
}

function loadSaved(): Map<string, Entry> {
  const saved = readJson(KEY);
  const pairs = Array.isArray(saved) ? saved.filter((v): v is [string, Entry] => Array.isArray(v) && typeof v[0] === 'string' && isEntry(v[1])) : [];
  return new Map(pairs.filter(([, e]) => Date.now() - e.at < MAX_AGE));
}

/** Oldest first, so the last ones are the ones to keep. */
const cache = loadSaved();
const pending = new Map<string, Promise<SearchResult[]>>();

export function browseKey(tag: string | null, sort: BrowseSort): string {
  return `browse:${tag ?? ''}:${sort}`;
}

export function searchKey(term: string): string {
  return `search:${term.toLowerCase()}`;
}

/** The results saved under `key` in the last day. */
export function savedResults(key: string): SearchResult[] | undefined {
  return cache.get(key)?.res;
}

/** True when the results under `key` were saved in the last 30 minutes. */
export function isFresh(key: string): boolean {
  const e = cache.get(key);
  return !!e && Date.now() - e.at < FRESH;
}

/** Save results under `key`. When storage is full, drop the oldest until they fit. */
export function saveResults(key: string, res: SearchResult[]) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), res });
  const keep = [...cache].slice(-KEEP);
  while (keep.length && !writeJson(KEY, keep)) keep.shift();
}

/** Load the browse results for a genre and order and save them. Asked again while loading, it waits for the same load. */
export function loadBrowse(tag: string | null, sort: BrowseSort): Promise<SearchResult[]> {
  const key = browseKey(tag, sort);
  let p = pending.get(key);
  if (!p) {
    p = browse(tag, sort)
      .then((res) => {
        saveResults(key, res);
        return res;
      })
      .finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

/**
 * Load the browse results the Search tab opens on, unless they are fresh, so they are ready before it opens. None on
 * slow or data-saving connections. A failure is left for the Search tab, which loads and reports it again.
 */
export function preloadBrowse(tag: string | null, sort: BrowseSort) {
  if (saveData() || isFresh(browseKey(tag, sort))) return;
  loadBrowse(tag, sort).catch(() => {});
}
