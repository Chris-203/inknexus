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

/** The JSON saved under `key`, or undefined when nothing readable is there. */
export function readJson(key: string, store: KV | undefined = defaultStore()): unknown {
  try {
    return JSON.parse(store?.getItem(key) || 'null') ?? undefined;
  } catch {
    return undefined;
  }
}

/** Save `value` as JSON under `key`. When storage is full or blocked, it still works for this visit. */
export function writeJson(key: string, value: unknown, store: KV | undefined = defaultStore()) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing else to do: the value stays in memory until the page closes.
  }
}

export function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

function web(v: unknown): string {
  return isWebUrl(str(v)) ? str(v) : '';
}

function uid(): string {
  return typeof globalThis.crypto?.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()) + Math.random();
}

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
  const raw = readJson(STORAGE_KEY, store);
  const s = toState(raw) || { lib: [] };
  // An old #proxy= setup link saved a worker address here; MangaDex now goes through /api/mangadex.
  if (isObj(raw) && 'proxy' in raw) saveState(s, store);
  return s;
}

export function saveState(s: State, store: KV | undefined = defaultStore()) {
  writeJson(STORAGE_KEY, s, store);
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
