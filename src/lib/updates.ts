import { useEffect, useSyncExternalStore } from 'react';
import { statusOf, why } from './api';
import { cachedChapters } from './chapters';
import type { Latest, Series } from './types';
import { latest } from '../sources/mangadex';

/**
 * "New chapter" checks for the library. Each MangaDex series is checked with one small request, at most
 * two at a time, and at most every 30 minutes. Results are kept under their own key, never in the library or backups.
 */
const KEY = 'inknexus-updates';
const TTL = 30 * 60 * 1000;
const CONCURRENCY = 2;

const load = (): Record<string, Latest> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const saved = load();
/** When each series was last tried this session, so a failed check is not retried on every render. */
const tried = new Map<string, number>();

/** Newest chapter numbers for a series: this session's full list when it is loaded, else the last check. */
export function latestFor(md: string): Latest | undefined {
  const list = cachedChapters(md);
  return list ? { nums: list.chapters.map((c) => c.num), full: false, at: Date.now() } : saved[md];
}

/** How many chapters are past `last`; `more` when the check came back full and every chapter in it is new. */
export function newCount(l: Latest | undefined, last: number): { n: number; more: boolean } {
  if (!l) return { n: 0, more: false };
  const n = l.nums.filter((x) => x > last).length;
  return { n, more: l.full && n > 0 && n === l.nums.length };
}

export const updates = { checking: false, failed: [] as { title: string; error: string }[] };
const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version++;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Check the started MangaDex series that are due (all of them with `force`). */
export function checkUpdates(lib: Series[], force: boolean) {
  if (updates.checking) return;
  const now = Date.now();
  const due = (md: string) => force || now - Math.max(saved[md]?.at ?? 0, tried.get(md) ?? 0) > TTL;
  const queue = lib.filter((x) => x.md && !x.mdh && x.last && !cachedChapters(x.md) && due(x.md));
  if (!queue.length) return;
  for (const x of queue) tried.set(x.md!, now);
  updates.checking = true;
  updates.failed = [];
  emit();
  const worker = async () => {
    for (let x = queue.shift(); x; x = queue.shift()) {
      try {
        saved[x.md!] = await latest(x.md!);
      } catch (e) {
        updates.failed.push({ title: x.title, error: why(e) });
        // A rate limit applies to every request: stop this round rather than pile on.
        if (statusOf(e) === 429) queue.length = 0;
      }
    }
  };
  void Promise.all(Array.from({ length: CONCURRENCY }, worker)).then(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
      /* storage full or blocked: the results still show for this visit */
    }
    updates.checking = false;
    emit();
  });
}

/** Run the due checks for a library and re-render when they finish. */
export function useUpdates(lib: Series[]) {
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => checkUpdates(lib, false), [lib]);
  return updates;
}
