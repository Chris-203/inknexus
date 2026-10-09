import { useEffect, useState } from 'react';
import { why } from './api';
import type { ChapterList } from './types';
import { chapters as fetchChapters } from '../sources/mangadex';

/** Chapter lists per MangaDex id, kept for the session so the series and reader screens share them. */
const cache = new Map<string, ChapterList>();
const errors = new Map<string, string>();
const pending = new Map<string, Promise<void>>();

export type ChaptersState = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; list: ChapterList };

export const cachedChapters = (md: string | null | undefined) => (md ? cache.get(md) : undefined);

function load(md: string): Promise<void> {
  let p = pending.get(md);
  if (!p) {
    p = fetchChapters(md)
      .then((list) => {
        cache.set(md, list);
        errors.delete(md);
      })
      .catch((e) => void errors.set(md, why(e)))
      .finally(() => pending.delete(md));
    pending.set(md, p);
  }
  return p;
}

const read = (md: string): ChaptersState => {
  const list = cache.get(md);
  if (list) return { status: 'ready', list };
  const error = errors.get(md);
  return error ? { status: 'error', error } : { status: 'loading' };
};

/** Load (once per session) and return the chapter list for a MangaDex series. `retry` forgets an error and loads again. */
export function useChapters(md: string | null | undefined): [ChaptersState | null, () => void] {
  const [, bump] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!md || cache.has(md) || errors.has(md)) return;
    let live = true;
    load(md).then(() => live && bump((n) => n + 1));
    return () => {
      live = false;
    };
  }, [md, attempt]);
  const retry = () => {
    if (!md) return;
    errors.delete(md);
    setAttempt((n) => n + 1);
  };
  return [md ? read(md) : null, retry];
}
