import { useSyncExternalStore } from 'react';
import { apiHint, imageSrc } from './api';
import { createChanges } from './changes';
import { isObj, readJson, writeJson } from './storage';
import type { Chapter, Page, Series } from './types';
import { pages } from '../sources/mangadex';

/**
 * MangaDex chapters saved for offline reading, kept on this device only (not in backups). Their data-saver images are in
 * Cache Storage under CACHE, where public/sw.js answers the image relay from; the list of saved chapters is under KEY.
 */
const KEY = 'inknexus-downloads';
const CACHE = 'inknexus-downloads';

export interface Download {
  /** The series' id, and its title so a series removed from the library is still named. */
  x: string;
  t: string;
  c: Chapter;
  /** The image URLs saved, with no full-quality fallback, which would need the network. */
  pages: Page[];
  bytes: number;
}

/** The chapter being saved, by id, and how many of its pages are. */
export interface Saving {
  id: string;
  done: number;
  total: number;
}

function isDownload(v: unknown): v is Download {
  return (
    isObj(v) &&
    typeof v.x === 'string' &&
    typeof v.t === 'string' &&
    isObj(v.c) &&
    typeof v.c.id === 'string' &&
    typeof v.c.num === 'number' &&
    Array.isArray(v.pages) &&
    v.pages.every((p) => isObj(p) && typeof p.a === 'string') &&
    typeof v.bytes === 'number'
  );
}

function loadSaved(): Download[] {
  const saved = readJson(KEY);
  return Array.isArray(saved) ? saved.filter(isDownload) : [];
}

/** The saved chapters, the one saving, and the ids of those waiting to save after it. */
let state: { saved: Download[]; saving: Saving | null; waiting: string[] } = { saved: loadSaved(), saving: null, waiting: [] };
const changes = createChanges();

function update(next: Partial<typeof state>) {
  state = { ...state, ...next };
  if (next.saved) writeJson(KEY, state.saved);
  changes.emit();
}

/** Saving needs Cache Storage and the service worker that reads from it, which only the built app registers. */
function canSave(): boolean {
  return typeof caches !== 'undefined' && !!globalThis.navigator?.serviceWorker?.controller;
}

globalThis.navigator?.serviceWorker?.addEventListener('controllerchange', changes.emit);

/** The saved chapters, the one saving, those waiting, and whether this browser can save any. */
export function useDownloads() {
  return { ...useSyncExternalStore(changes.subscribe, () => state), can: canSave() };
}

/** Chapter `n` of series `x` when it is saved and the service worker can show it. */
export function savedChapter(x: string, n: number): Download | undefined {
  return canSave() ? state.saved.find((d) => d.x === x && d.c.num === n) : undefined;
}

/** The last chapter asked to save; the next one starts after it. */
let lastSave: Promise<unknown> = Promise.resolve();

/**
 * Save chapter `c` of series `x`, after the chapters already waiting, one at a time. True once it is saved; false when it
 * already was, or when it was waiting behind a chapter that failed: a failure drops the waiting chapters, so a rate limit
 * is not piled on.
 */
export function saveChapter(x: Pick<Series, 'id' | 'title'>, c: Chapter): Promise<boolean> {
  if (state.saved.some((d) => d.c.id === c.id) || state.waiting.includes(c.id) || state.saving?.id === c.id) return Promise.resolve(false);
  update({ waiting: [...state.waiting, c.id] });
  const run = lastSave.then(async () => {
    if (!state.waiting.includes(c.id)) return false;
    update({ waiting: state.waiting.filter((id) => id !== c.id), saving: { id: c.id, done: 0, total: 0 } });
    try {
      const list = await pages(c.id);
      update({ saving: { id: c.id, done: 0, total: list.length } });
      const cache = await caches.open(CACHE);
      const bytes = await saveImages(cache, list, (done) => update({ saving: { id: c.id, done, total: list.length } }));
      update({ saved: [...state.saved, { x: x.id, t: x.title, c, pages: list.map((p) => ({ a: p.a, b: '' })), bytes }] });
      return true;
    } catch (e) {
      update({ waiting: [] });
      throw e;
    } finally {
      update({ saving: null });
    }
  });
  // Its failure is the caller's to show; the next chapter only waits for it to end.
  lastSave = run.catch(() => {});
  return run;
}

/** Save a chapter's images two at a time and add up their size. On a failure, the ones already saved are removed. */
async function saveImages(cache: Cache, list: Page[], step: (done: number) => void): Promise<number> {
  const srcs = list.map((p) => imageSrc(p.a));
  const queue = [...srcs];
  let bytes = 0;
  let done = 0;
  const worker = async () => {
    for (let src = queue.shift(); src; src = queue.shift()) {
      let size;
      try {
        size = await saveImage(cache, src);
      } catch (e) {
        queue.length = 0;
        throw e;
      }
      // Added after the wait: `bytes += await …` would add to the total as it was before the other worker's image.
      bytes += size;
      step(++done);
    }
  };
  const failed = (await Promise.allSettled([worker(), worker()])).find((r) => r.status === 'rejected');
  if (!failed) return bytes;
  await Promise.all(srcs.map((src) => cache.delete(src)));
  throw failed.reason;
}

async function saveImage(cache: Cache, src: string): Promise<number> {
  let r: Response;
  try {
    r = await fetch(src, { referrerPolicy: 'same-origin' });
  } catch {
    throw new Error('network error; check your connection and try again');
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${apiHint(r.status)}`);
  const blob = await r.blob();
  try {
    await cache.put(src, new Response(blob, { headers: { 'Content-Type': blob.type } }));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') throw new Error('this device has no room left; remove some saved chapters in Settings');
    throw e;
  }
  return blob.size;
}

/** Remove a saved chapter. It leaves the list at once; images that fail to delete are dropped by tidy() on the next launch. */
export function removeDownload(id: string) {
  const d = state.saved.find((k) => k.c.id === id);
  if (!d) return;
  update({ saved: state.saved.filter((k) => k !== d) });
  caches
    .open(CACHE)
    .then((cache) => Promise.all(d.pages.map((p) => cache.delete(imageSrc(p.a)))))
    .catch(() => {});
}

/** Remove every saved chapter. Not while one is saving, whose images would go too. */
export function removeAllDownloads() {
  update({ saved: [] });
  caches.delete(CACHE).catch(() => {});
}

/**
 * Keep the list and the images in step: drop chapters the browser cleared images of (Safari can clear a site's storage)
 * and images no saved chapter needs, such as those of a removal cut short.
 */
async function tidy() {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  // Images being saved are in the cache before their chapter is in the list.
  if (state.saving) return;
  const have = new Set(keys.map((r) => r.url));
  const url = (p: Page) => new URL(imageSrc(p.a), location.href).href;
  const kept = state.saved.filter((d) => d.pages.every((p) => have.has(url(p))));
  if (kept.length < state.saved.length) update({ saved: kept });
  const needed = new Set(kept.flatMap((d) => d.pages.map(url)));
  await Promise.all(keys.filter((r) => !needed.has(r.url)).map((r) => cache.delete(r)));
}

// A tidy that fails changes nothing and runs again on the next launch.
if (typeof caches !== 'undefined') tidy().catch(() => {});
