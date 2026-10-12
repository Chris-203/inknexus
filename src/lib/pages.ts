import type { Page } from './types';
import { pages as fetchPages } from '../sources/mangadex';

/** MangaDex@Home links carry a token MangaDex only promises for 15 minutes, so reuse them for 10. */
const FRESH = 10 * 60_000;

/** Page lists per MangaDex chapter id for this session; `retry` marks a list from a fresh server on port 443. */
const cache = new Map<string, { at: number; retry: boolean; pages: Promise<Page[]> }>();

/**
 * A chapter's page images, reused while fresh. With `retry`, after a page failed to load, ask for a
 * different server on port 443 unless that was already done recently, so a whole chapter of failures makes one request.
 */
export function chapterPages(id: string, retry = false): Promise<Page[]> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < FRESH && (hit.retry || !retry)) return hit.pages;
  const entry = { at: Date.now(), retry, pages: fetchPages(id, retry) };
  cache.set(id, entry);
  entry.pages.catch(() => cache.get(id) === entry && cache.delete(id));
  return entry.pages;
}

/** Load the chapters' images in order, one at a time, so pages show at once when reached. Stops when `signal` aborts. */
export async function preload(ids: string[], signal: AbortSignal) {
  for (const id of ids) {
    if (signal.aborted) return;
    const list = await chapterPages(id).catch(() => []);
    for (const p of list) {
      if (signal.aborted) return;
      await new Promise((done) => {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.fetchPriority = 'low';
        img.onload = img.onerror = done;
        img.src = p.a;
      });
    }
  }
}
