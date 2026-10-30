import { saveData } from './preload';
import { isObj, readJson, writeJson } from './storage';
import type { SearchResult } from './types';
import { info } from '../sources/anilist';
import { browse, GENRES, search, type BrowseSort } from '../sources/mangadex';

/**
 * Search and browse results kept on the device under their own key, never in the library or backups, so the Search tab
 * and every genre and order open on results instead of "Loading…". Results are used as is for 30 minutes, then shown
 * while they reload, and dropped after a week.
 */
const KEY = 'inknexus-search';
const FRESH = 30 * 60 * 1000;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
/** How many result lists are kept, newest last: every genre in both orders, and the latest title searches. */
const KEEP = 80;
/** Descriptions show two lines, so only their start is kept; storage is shared with chapter lists. */
const DESC = 300;

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

/** The results saved under `key` in the last week. */
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
  cache.set(key, { at: Date.now(), res: res.map((o) => ({ ...o, desc: o.desc.slice(0, DESC) })) });
  const keep = [...cache].slice(-KEEP);
  while (keep.length && !writeJson(KEY, keep)) keep.shift();
}

/**
 * MangaDex results with AniList's score and synopsis for each series MangaDex links to AniList. AniList only adds to
 * them, so when it fails the results are kept as MangaDex sent them.
 */
export async function withAniList(res: SearchResult[]): Promise<SearchResult[]> {
  const ids = res.flatMap((o) => o.al || []);
  if (!ids.length) return res;
  let al: Awaited<ReturnType<typeof info>>;
  try {
    al = await info(ids);
  } catch {
    // The next reload asks AniList again.
    return res;
  }
  return res.map((o) => {
    const m = o.al ? al.get(o.al) : undefined;
    return m ? { ...o, score: m.score ?? undefined, desc: m.desc || o.desc } : o;
  });
}

/** Load results from MangaDex with AniList's added and save them under `key`. Asked again while loading, it waits for the same load. */
function load(key: string, get: () => Promise<SearchResult[]>): Promise<SearchResult[]> {
  let p = pending.get(key);
  if (!p) {
    p = get()
      .then(withAniList)
      .then((res) => {
        saveResults(key, res);
        return res;
      })
      .finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

/** Load the browse results for a genre and order and save them. */
export function loadBrowse(tag: string | null, sort: BrowseSort): Promise<SearchResult[]> {
  return load(browseKey(tag, sort), () => browse(tag, sort));
}

/** Search MangaDex by title and save the results. */
export function loadSearch(term: string): Promise<SearchResult[]> {
  return load(searchKey(term), () => search(term));
}

/**
 * Load the browse results the Search tab opens on unless they are fresh, then every other genre and order missing from
 * the device, one at a time, so switching between them never waits. None on slow or data-saving connections. The first
 * failure stops the queue and is left for the Search tab, which loads and reports it again.
 */
export function preloadBrowse(tag: string | null, sort: BrowseSort) {
  if (saveData()) return;
  const all = [null, ...GENRES.map((g) => g.id)].flatMap((t) => (['follows', 'latest'] as const).map((s): [string | null, BrowseSort] => [t, s]));
  void (async () => {
    try {
      if (!isFresh(browseKey(tag, sort))) await loadBrowse(tag, sort);
      for (const [t, s] of all) if (!savedResults(browseKey(t, s))) await loadBrowse(t, s);
    } catch {
      // Opening that genre loads it again and says what failed.
    }
  })();
}
