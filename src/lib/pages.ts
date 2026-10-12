import type { Page } from './types';
import { pages as fetchPages } from '../sources/mangadex';

/** Fresh links asked for after a page failed are shared by every page that fails within this long. */
const SHARE = 60_000;

/** The latest page links asked for per MangaDex chapter id; `retry` marks links asked for after a page failed. */
const latest = new Map<string, { at: number; retry: boolean; pages: Promise<Page[]> }>();

function ask(id: string, retry: boolean): Promise<Page[]> {
  const entry = { at: Date.now(), retry, pages: fetchPages(id) };
  latest.set(id, entry);
  entry.pages.catch(() => latest.get(id) === entry && latest.delete(id));
  return entry.pages;
}

/** A chapter's page links, asked for each time it is opened: older links can stop working (their token expires). */
export function chapterPages(id: string): Promise<Page[]> {
  return ask(id, false);
}

/**
 * The next address to try for page `i` of chapter `id` after it failed `tries` times, or '' once out of tries:
 * full quality from the same server, then data-saver and full quality from fresh links, in case the server is down
 * or its links expired. One request for fresh links covers every page that fails within a minute.
 */
export async function retrySrc(id: string, i: number, tries: number): Promise<string> {
  if (tries > 2) return '';
  const hit = latest.get(id);
  const shared = hit && (tries === 0 || (hit.retry && Date.now() - hit.at < SHARE));
  const p = (await (shared ? hit.pages : ask(id, true)).catch(() => undefined))?.[i];
  return (tries === 1 ? p?.a : p?.b) || '';
}
