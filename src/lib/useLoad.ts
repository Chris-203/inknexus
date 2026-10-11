import { useEffect, useState } from 'react';
import { why } from './api';

export type Load<T> = { state: 'busy' } | { state: 'error'; error: string } | { state: 'done'; value: T };

/** Run `load` whenever `key` changes and return its progress; null while `key` is null. A result for an old key is dropped. */
export function useLoad<T>(key: string | null, load: () => Promise<T>): Load<T> | null {
  const [res, setRes] = useState<Load<T> | null>(key === null ? null : { state: 'busy' });
  useEffect(() => {
    if (key === null) return setRes(null);
    let live = true;
    setRes({ state: 'busy' });
    load().then(
      (value) => live && setRes({ state: 'done', value }),
      (e) => live && setRes({ state: 'error', error: why(e) }),
    );
    return () => {
      live = false;
    };
    // `load` belongs to the render that set `key`, so only `key` decides when to run it again.
  }, [key]);
  return res;
}
