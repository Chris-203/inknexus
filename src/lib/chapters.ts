import { useEffect, useSyncExternalStore } from 'react';
import { why } from './api';
import type { ChapterList } from './types';
import { chapters as fetchChapters } from '../sources/mangadex';

/** Chapter lists per MangaDex id, kept for the session so the series and reader screens share them. */
const cache = new Map<string, ChapterList>();
const errors = new Map<string, string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribeChapters(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export type ChaptersState = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; list: ChapterList };

export const cachedChapters = (md: string): ChapterList | undefined => cache.get(md);

export function chapterState(md: string): ChaptersState {
  const list = cache.get(md);
  if (list) return { status: 'ready', list };
  const error = errors.get(md);
  return error ? { status: 'error', error } : { status: 'loading' };
}

/** Start loading a series' chapter list unless it is loaded, failed, or already loading. Every subscriber hears when it finishes. */
export function loadChapters(md: string) {
  if (cache.has(md) || errors.has(md) || pending.has(md)) return;
  pending.add(md);
  fetchChapters(md)
    .then((l) => void cache.set(md, l))
    .catch((e) => void errors.set(md, why(e)))
    .finally(() => {
      pending.delete(md);
      emit();
    });
}

/** Forget a failed load and try again. */
export function retryChapters(md: string) {
  errors.delete(md);
  emit();
}

/** The chapter list for a MangaDex series, loaded once per session. */
export function useChapters(md: string | null | undefined): ChaptersState | null {
  const v = useSyncExternalStore(subscribeChapters, () => version);
  useEffect(() => {
    if (md) loadChapters(md);
  }, [md, v]);
  return md ? chapterState(md) : null;
}
