import { why } from './api';
import type { ChapterList } from './types';
import { chapters as fetchChapters } from '../sources/mangadex';

/** Chapter lists per MangaDex id, kept for the session so the series and reader screens share them. */
const cache = new Map<string, ChapterList>();
const errors = new Map<string, string>();
const pending = new Set<string>();

export type ChaptersState = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; list: ChapterList };

export const cachedChapters = (md: string): ChapterList | undefined => cache.get(md);

/**
 * The chapter list for a MangaDex series. Starts one load when needed, never two at once for the same series,
 * and calls `done` when that load finishes.
 */
export function chapterState(md: string, done: () => void): ChaptersState {
  const list = cache.get(md);
  if (list) return { status: 'ready', list };
  const error = errors.get(md);
  if (error) return { status: 'error', error };
  if (!pending.has(md)) {
    pending.add(md);
    fetchChapters(md)
      .then((l) => void cache.set(md, l))
      .catch((e) => void errors.set(md, why(e)))
      .finally(() => {
        pending.delete(md);
        done();
      });
  }
  return { status: 'loading' };
}

/** Forget a failed load so the next `chapterState` tries again. */
export const forgetError = (md: string) => errors.delete(md);
