import { useEffect, useState } from 'react';
import { why } from './api';

export type Load<T> = { state: 'busy' } | { state: 'error'; error: string } | { state: 'done'; value: T };

/**
 * Run `load` whenever `key` changes and return its progress; null while `key` is null. A result for an old key is never
 * shown. When `saved` has the value already, it is done from the first frame and `load` is not run, so a screen opened
 * again shows what it showed before instead of "Loading…" for a moment.
 */
export function useLoad<T>(key: string | null, load: () => Promise<T>, saved?: () => T | undefined): Load<T> | null {
  const [res, setRes] = useState<{ key: string; load: Load<T> } | null>(null);
  useEffect(() => {
    if (key === null || saved?.() !== undefined) return;
    let live = true;
    load().then(
      (value) => live && setRes({ key, load: { state: 'done', value } }),
      (e) => live && setRes({ key, load: { state: 'error', error: why(e) } }),
    );
    return () => {
      live = false;
    };
    // `load` and `saved` belong to the render that set `key`, so only `key` decides when to run it again.
  }, [key]);
  if (key === null) return null;
  if (res?.key === key) return res.load;
  const value = saved?.();
  return value === undefined ? { state: 'busy' } : { state: 'done', value };
}
