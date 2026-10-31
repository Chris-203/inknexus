import { isObj, readJson, writeJson } from './storage';

/**
 * Values by key, kept on the device under storage key `key`, never in the library or backups. Each is dropped a week
 * after it was saved, and only the `keep` newest are saved; when storage is full, the oldest go until the rest fit.
 */
export function createDeviceCache<T>(key: string, keep: number, maxAge = 7 * 864e5) {
  type Entry = { at: number; v: T };
  const isEntry = (e: unknown): e is Entry => isObj(e) && typeof e.at === 'number' && 'v' in e;
  const saved = readJson(key);
  const pairs = Array.isArray(saved) ? saved.filter((p): p is [string, Entry] => Array.isArray(p) && typeof p[0] === 'string' && isEntry(p[1])) : [];
  // Oldest first, so the last ones are the ones to keep.
  const cache = new Map(pairs.filter(([, e]) => Date.now() - e.at < maxAge));
  return {
    /** The value saved under `k` less than `age` ago. */
    get(k: string, age = maxAge): T | undefined {
      const e = cache.get(k);
      return e && Date.now() - e.at < age ? e.v : undefined;
    },
    set(k: string, v: T) {
      cache.delete(k);
      cache.set(k, { at: Date.now(), v });
      const kept = [...cache].filter(([, e]) => Date.now() - e.at < maxAge).slice(-keep);
      while (kept.length && !writeJson(key, kept)) kept.shift();
    },
  };
}
