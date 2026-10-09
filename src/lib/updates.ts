import { useCallback, useEffect, useRef, useState } from 'react';
import { api, MD, why } from './api';
import type { Series } from './types';
import { toChapterList, type MdChapter } from '../sources/mangadex';

/**
 * "New chapter" checks for the library. Each MangaDex series is checked with one small request
 * (its newest 20 English chapters, filtered like the chapter list), at most two at a time so
 * MangaDex's rate limit is respected. Results are kept for 30 minutes under their own key,
 * separate from the library and never part of a backup.
 */
const KEY = 'inknexus-updates';
const TTL = 30 * 60 * 1000;
const PER_SERIES = 20;
const CONCURRENCY = 2;

export interface Latest {
  /** Newest readable chapter numbers, up to PER_SERIES. */
  nums: number[];
  at: number;
}
type Saved = Record<string, Latest>;

function loadSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: checks still work for this visit */
  }
}

/** How many chapters past `last`; `more` when every checked chapter is new, so there may be others. */
export function newCount(latest: Latest | undefined, last: number): { n: number; more: boolean } {
  if (!latest) return { n: 0, more: false };
  const n = latest.nums.filter((x) => x > last).length;
  return { n, more: n > 0 && n === latest.nums.length && n >= PER_SERIES };
}

export async function fetchLatest(md: string): Promise<Latest> {
  const r = await api(
    `${MD}/manga/${md}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=${PER_SERIES}&includes[]=scanlation_group&contentRating[]=safe&contentRating[]=suggestive`,
  );
  const j: { data?: MdChapter[] } = await r.json();
  return { nums: toChapterList(j.data || []).chapters.map((c) => c.num), at: Date.now() };
}

export interface Updates {
  latest: Saved;
  /** Series that could not be checked, with the reason. */
  failed: { title: string; error: string }[];
  checking: boolean;
  /** Check every MangaDex series again now, ignoring saved results. */
  recheck: () => void;
}

export function useUpdates(lib: Series[]): Updates {
  const [latest, setLatest] = useState<Saved>(loadSaved);
  const [failed, setFailed] = useState<Updates['failed']>([]);
  const [checking, setChecking] = useState(false);
  const [round, setRound] = useState(0);
  const force = useRef(false);
  const ids = lib
    .filter((x) => x.md && !x.mdh)
    .map((x) => x.md!)
    .sort()
    .join(',');

  useEffect(() => {
    const now = Date.now();
    const saved = loadSaved();
    const todo = lib.filter((x) => x.md && !x.mdh && (force.current || !saved[x.md] || now - saved[x.md]!.at > TTL));
    force.current = false;
    if (!todo.length) return;
    let live = true;
    const errors: Updates['failed'] = [];
    setChecking(true);
    const queue = [...todo];
    const worker = async () => {
      for (let x = queue.shift(); x && live; x = queue.shift()) {
        try {
          const l = await fetchLatest(x.md!);
          if (!live) return;
          const next = { ...loadSaved(), [x.md!]: l };
          save(next);
          setLatest(next);
        } catch (e) {
          errors.push({ title: x.title, error: why(e) });
          // A rate limit applies to every request: stop this round rather than pile on.
          if (/HTTP 429/.test(why(e))) queue.length = 0;
        }
      }
    };
    Promise.all(Array.from({ length: CONCURRENCY }, worker)).then(() => {
      if (!live) return;
      setFailed(errors);
      setChecking(false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when the set of MangaDex series changes or on recheck
  }, [ids, round]);

  const recheck = useCallback(() => {
    force.current = true;
    setFailed([]);
    setRound((n) => n + 1);
  }, []);
  return { latest, failed, checking, recheck };
}
