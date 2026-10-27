import { useEffect, useSyncExternalStore } from 'react';
import { why } from './api';
import { createChanges } from './changes';
import { saveData } from './preload';
import { isObj, readJson, writeJson } from './storage';
import type { ChapterList } from './types';
import { chapters as fetchChapters } from '../sources/mangadex';

/**
 * Chapter lists per MangaDex id, shared by the series and reader screens and kept on the device under their own key,
 * never in the library or backups. A list is used as is for 30 minutes, then shown while it reloads, and dropped after
 * a day so chapters MangaDex removed (for example at a scanlation group's request) do not linger.
 */
const KEY = 'inknexus-chapters';
const FRESH = 30 * 60 * 1000;
const MAX_AGE = 24 * 60 * 60 * 1000;
/** How many lists are kept on the device, newest first; long series have big lists and storage is small. */
const KEEP = 30;

type Entry = { at: number; list: ChapterList };

function isEntry(v: unknown): v is Entry {
  return isObj(v) && typeof v.at === 'number' && isObj(v.list) && Array.isArray(v.list.chapters) && typeof v.list.listed === 'number';
}

/** The saved lists younger than a day, from [md, entry] pairs. Anything unreadable is skipped. */
function loadSaved(): Map<string, Entry> {
  const saved = readJson(KEY);
  const pairs = Array.isArray(saved) ? saved.filter((v): v is [string, Entry] => Array.isArray(v) && typeof v[0] === 'string' && isEntry(v[1])) : [];
  return new Map(pairs.filter(([, e]) => Date.now() - e.at < MAX_AGE));
}

/** Oldest first, so the last ones are the ones to keep. */
const cache = loadSaved();
const errors = new Map<string, string>();
const pending = new Set<string>();
const changes = createChanges();

export const subscribeChapters = changes.subscribe;

export type ChaptersState = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; list: ChapterList };

/** A list younger than `age`. */
function listFor(md: string, age: number): ChapterList | undefined {
  const e = cache.get(md);
  return e && Date.now() - e.at < age ? e.list : undefined;
}

/** Save the newest lists that fit. When storage is full, drop the oldest until they do. */
function save() {
  const keep = [...cache].filter(([, e]) => Date.now() - e.at < MAX_AGE).slice(-KEEP);
  while (keep.length && !writeJson(KEY, keep)) keep.shift();
}

/** The chapter list when it was loaded in the last 30 minutes. */
export function cachedChapters(md: string): ChapterList | undefined {
  return listFor(md, FRESH);
}

export function chapterState(md: string): ChaptersState {
  const list = listFor(md, MAX_AGE);
  if (list) return { status: 'ready', list };
  const error = errors.get(md);
  return error ? { status: 'error', error } : { status: 'loading' };
}

/** Load a series' chapter list and tell every subscriber when it finishes. A failure is kept only with `keepError`. */
function fetchList(md: string, keepError: boolean): Promise<void> {
  pending.add(md);
  return fetchChapters(md)
    .then((list) => {
      cache.delete(md);
      cache.set(md, { at: Date.now(), list });
      save();
    })
    .catch((e) => {
      if (keepError) errors.set(md, why(e));
      throw e;
    })
    .finally(() => {
      pending.delete(md);
      changes.emit();
    });
}

/**
 * Load a series' chapter list unless it is fresh, failed, or already loading. Every subscriber hears when it finishes.
 * A failed reload keeps the older list and is not tried again until retried, so a rate limit is not piled on.
 */
export function loadChapters(md: string) {
  if (cachedChapters(md) || errors.has(md) || pending.has(md)) return;
  fetchList(md, true).catch(() => {});
}

/** Series whose lists are loaded ahead, next first. */
const ahead: string[] = [];
let loadingAhead = false;

/**
 * Load the lists of the first `mds` ahead, one at a time, so they open without "Loading chapters…". Only as many series
 * as lists are kept, so loading ahead never pushes out a list it loaded itself; only lists missing from the device; none
 * on slow or data-saving connections. Replaces the series still waiting from an earlier call. The first failure stops
 * the queue and is not kept, so opening that series tries again.
 */
export function prefetchChapters(mds: string[]) {
  if (saveData()) return;
  ahead.splice(0, ahead.length, ...mds.slice(0, KEEP));
  if (loadingAhead) return;
  loadingAhead = true;
  void (async () => {
    try {
      for (let md = ahead.shift(); md; md = ahead.shift()) {
        if (listFor(md, MAX_AGE) || errors.has(md) || pending.has(md)) continue;
        await fetchList(md, false);
      }
    } catch {
      ahead.length = 0;
    }
    loadingAhead = false;
  })();
}

/** Forget a failed load and try again. */
export function retryChapters(md: string) {
  errors.delete(md);
  changes.emit();
}

/** A series' chapter list as it stands, without loading it, for screens that leave loading to prefetchChapters(). */
export function useChapterState(md: string | null | undefined): ChaptersState | null {
  useSyncExternalStore(changes.subscribe, changes.version);
  return md ? chapterState(md) : null;
}

/** The chapter list for a MangaDex series, reloaded when it is older than 30 minutes. */
export function useChapters(md: string | null | undefined): ChaptersState | null {
  const v = useSyncExternalStore(changes.subscribe, changes.version);
  useEffect(() => {
    if (md) loadChapters(md);
  }, [md, v]);
  return md ? chapterState(md) : null;
}
