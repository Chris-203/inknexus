import type { Link, Series, State } from './types';

/** Stays 'longstrip' on purpose: libraries saved before the rename to InkNexus live under this key. */
export const STORAGE_KEY = 'longstrip';

type KV = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): KV | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadState(store: KV | undefined = defaultStore()): State {
  let s: State = { lib: [] };
  try {
    const parsed = JSON.parse(store?.getItem(STORAGE_KEY) || '');
    if (parsed && Array.isArray(parsed.lib)) s = parsed;
  } catch {
    /* nothing saved yet, or unreadable: start empty */
  }
  // An old #proxy= setup link saved a worker address here; MangaDex now goes through /api/mangadex.
  if ('proxy' in s) {
    delete (s as State & { proxy?: unknown }).proxy;
    saveState(s, store);
  }
  return s;
}

export function saveState(s: State, store: KV | undefined = defaultStore()): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the in-memory state still works for this session */
  }
}

/** Parse an exported backup. Throws if the text is not an InkNexus backup. */
export function parseBackup(text: string): State {
  const j = JSON.parse(text);
  if (!j || !Array.isArray(j.lib)) throw new Error('not an InkNexus backup');
  delete j.proxy;
  return j as State;
}

const uid = () => (typeof globalThis.crypto?.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()) + Math.random());

export function newSeries(o: { title: string; cover?: string; md?: string | null; al?: number | string | null; links?: Link[]; last?: number }): Series {
  return { id: uid(), title: o.title, cover: o.cover || '', md: o.md || null, al: o.al || null, links: o.links || [], last: o.last || 0, t: Date.now() };
}
