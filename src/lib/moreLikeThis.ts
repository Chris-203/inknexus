import { why } from './api';
import { norm } from './format';
import type { SearchResult } from './types';
import * as anilist from '../sources/anilist';
import * as mangadex from '../sources/mangadex';

/** How many series the row shows at most. */
export const MAX = 15;

export interface LikeThis {
  list: SearchResult[];
  /** What could not be asked and why, when only one of AniList and MangaDex answered; '' otherwise. */
  missed: string;
}

/** A series to find more like: its name, and its AniList and MangaDex ids when known. */
export interface LikeOf {
  title: string;
  al: number | null;
  md: string | null;
}

/** Answers by series for this session, so going back to a series page does not ask again. A failed load is not kept. */
const cache = new Map<string, Promise<LikeThis>>();

/**
 * Series like `x`: AniList's related and recommended series first, each opened from MangaDex when MangaDex has it under
 * the same name, then MangaDex's own recommendations to fill the row. Throws when neither source answers, or one fails and the other has none.
 */
export function moreLikeThis(x: LikeOf): Promise<LikeThis> {
  const key = `${x.al}|${x.md}|${norm(x.title)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = load(x);
  cache.set(key, res);
  res.catch(() => cache.delete(key));
  return res;
}

async function load(x: LikeOf): Promise<LikeThis> {
  const [al, md] = await Promise.allSettled([fromAniList(x), x.md ? mangadex.recommended(x.md) : []]);
  if (al.status === 'rejected' && md.status === 'rejected') throw new Error(`AniList: ${why(al.reason)}; MangaDex: ${why(md.reason)}`);
  const mdRecs = md.status === 'fulfilled' ? md.value : [];
  const self = (k: SearchResult) => (k.src === 'md' ? k.ref === x.md : k.ref === x.al) || norm(k.title) === norm(x.title);
  const list: SearchResult[] = [];
  // Matching one by one keeps to MangaDex's rate limit. After a failed match the rest stay AniList series, which still open.
  let matching = md.status === 'fulfilled';
  for (const k of al.status === 'fulfilled' ? al.value.filter((k) => !self(k)) : []) {
    let m: SearchResult | null = mangadex.mdMatches(k.title, mdRecs).map(mangadex.toResult)[0] ?? null;
    if (!m && matching)
      try {
        m = await mangadex.matchTitle(k.title);
      } catch {
        matching = false;
      }
    list.push(m ? { ...m, links: k.links } : k);
  }
  list.push(...mdRecs.map(mangadex.toResult));
  const once = list.filter((k, i) => !self(k) && list.findIndex((o) => o.src === k.src && o.ref === k.ref) === i);
  const failed = al.status === 'rejected' ? al : md.status === 'rejected' ? md : null;
  // With nothing to show, a failure is the whole answer.
  if (failed && !once.length) throw failed.reason;
  return { list: once.slice(0, MAX), missed: failed ? `${failed === al ? 'AniList' : 'MangaDex'} failed (${why(failed.reason)})` : '' };
}

/** AniList's related and recommended series, finding the series on AniList by name when its id is not known. */
async function fromAniList(x: LikeOf): Promise<SearchResult[]> {
  const id = x.al ?? (await anilist.matchTitles([x.title]))[0]?.ref;
  return id ? anilist.likeThis(Number(id)) : [];
}
