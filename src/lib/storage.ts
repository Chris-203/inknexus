import { isWebUrl } from './links';
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

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const web = (v: unknown): string => (isWebUrl(str(v)) ? str(v) : '');
const uid = () => (typeof globalThis.crypto?.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()) + Math.random());

function toLink(v: unknown): Link | null {
  if (!isObj(v) || !web(v.url)) return null;
  const l: Link = { label: str(v.label), url: str(v.url) };
  if ('tpl' in v) l.tpl = web(v.tpl);
  if ('resume' in v) l.resume = web(v.resume);
  if ('rn' in v) l.rn = num(v.rn);
  if (v.h === true) l.h = true;
  return l;
}

function toSeries(v: unknown): Series | null {
  if (!isObj(v)) return null;
  const s: Series = {
    id: str(v.id) || uid(),
    title: str(v.title).trim() || 'Untitled',
    cover: web(v.cover),
    md: /^[0-9a-f-]{36}$/i.test(str(v.md)) ? str(v.md) : null,
    al: typeof v.al === 'number' || (typeof v.al === 'string' && v.al) ? (v.al as number | string) : null,
    links: Array.isArray(v.links) ? v.links.map(toLink).filter((l): l is Link => !!l) : [],
    last: num(v.last),
    t: num(v.t),
  };
  if (v.mdh === true) s.mdh = true;
  if (typeof v.src === 'string') s.src = v.src;
  return s;
}

/** A library from saved or imported data, with every field checked. Null when it is not an InkNexus library. */
export function toState(v: unknown): State | null {
  if (!isObj(v) || !Array.isArray(v.lib)) return null;
  const s: State = { lib: v.lib.map(toSeries).filter((x): x is Series => !!x) };
  if (v.sort === 'asc' || v.sort === 'desc') s.sort = v.sort;
  return s;
}

export function loadState(store: KV | undefined = defaultStore()): State {
  let raw: unknown = null;
  try {
    raw = JSON.parse(store?.getItem(STORAGE_KEY) || '');
  } catch {
    /* nothing saved yet, or unreadable: start empty */
  }
  const s = toState(raw) || { lib: [] };
  // An old #proxy= setup link saved a worker address here; MangaDex now goes through /api/mangadex.
  if (isObj(raw) && 'proxy' in raw) saveState(s, store);
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
  const s = toState(JSON.parse(text));
  if (!s) throw new Error('not an InkNexus backup');
  return s;
}

export function newSeries(o: { title: string; cover?: string; md?: string | null; al?: number | string | null; links?: Link[]; last?: number }): Series {
  return { id: uid(), title: o.title, cover: o.cover || '', md: o.md || null, al: o.al || null, links: o.links || [], last: o.last || 0, t: Date.now() };
}
