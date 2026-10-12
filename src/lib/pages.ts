import type { Page } from './types';
import { pages as fetchPages } from '../sources/mangadex';

/** MangaDex@Home links carry a token MangaDex only promises for 15 minutes, so reuse them for 10. */
const FRESH = 10 * 60_000;

/** Page lists per MangaDex chapter id for this session; `fresh` marks a list asked for after a page failed. */
const cache = new Map<string, { at: number; fresh: boolean; pages: Promise<Page[]> }>();

/**
 * A chapter's page images, reused for 10 minutes. With `fresh`, after a page failed to load, ask MangaDex again
 * (often a different server) unless that was already done recently, so a whole chapter of failures makes one request.
 */
export function chapterPages(id: string, fresh = false): Promise<Page[]> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < FRESH && (hit.fresh || !fresh)) return hit.pages;
  const entry = { at: Date.now(), fresh, pages: fetchPages(id) };
  cache.set(id, entry);
  entry.pages.catch(() => cache.get(id) === entry && cache.delete(id));
  return entry.pages;
}

/**
 * The next address to try for page `i` of chapter `id` after it failed `tries` times, or '' once out of tries:
 * full quality from the same server, then data-saver and full quality from fresh links, in case the server is down
 * or its links expired.
 */
export async function retrySrc(id: string, i: number, tries: number): Promise<string> {
  if (tries > 2) return '';
  const p = (await chapterPages(id, tries > 0).catch(() => undefined))?.[i];
  return (tries === 1 ? p?.a : p?.b) || '';
}
