import { norm } from './format';
import type { Series } from './types';

/** What the Webtoon import knows about a series, to choose among several on AniList or MangaDex with its name. */
export interface MatchHint {
  /** Its title number on webtoons.com. */
  no: string;
  /** Its Webtoon genre as `norm()` gives it, such as 'fantasy' or 'sliceoflife'; '' when its link does not say. */
  genre: string;
  /** Its AniList id, once it has one. */
  al?: number;
}

/** What a candidate series offers to compare with a hint: the links it lists, its genres and tags, and its AniList id. */
export interface MatchFacts {
  urls: string[];
  tags: string[];
  al?: number | null;
}

const SITE = 'webtoons.com';

/** Whether `u` is a webtoons.com link. */
export function isWebtoon(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return h === SITE || h.endsWith('.' + SITE);
  } catch {
    return false;
  }
}

/** The title number in a webtoons.com series or episode link, or '' for any other link. */
export function webtoonNo(u: string): string {
  if (!isWebtoon(u)) return '';
  const q = new URL(u).searchParams;
  const no = q.get('title_no') || q.get('titleNo') || '';
  return /^\d+$/.test(no) ? no : '';
}

/**
 * The hint for a series with a Webtoon link, or undefined when it has none. Series links look like
 * /en/<genre>/<name>/list?title_no=<no>, and Webtoon's genre for science fiction is 'sf'.
 */
export function hintOf(x: Series): MatchHint | undefined {
  const l = x.links.find((l) => isWebtoon(l.url));
  if (!l || !webtoonNo(l.url)) return undefined;
  const parts = new URL(l.url).pathname.split('/');
  const genre = parts.length > 4 ? norm(parts[2]) : '';
  return { no: webtoonNo(l.url), genre: genre === 'sf' ? 'scifi' : genre, al: Number(x.al) || undefined };
}

/** A fit this high means the same series whatever its name: it links the same Webtoon series, or the AniList match. */
export const SURE = 4;

/** How well a candidate fits `h`: a link to the same Webtoon series counts most, then the same AniList id, then the genre, then MangaDex's long strip format. */
export function fit(h: MatchHint | undefined, f: MatchFacts): number {
  if (!h) return 0;
  const tags = f.tags.map(norm);
  return (
    (f.urls.some((u) => webtoonNo(u) === h.no) ? 8 : 0) +
    (h.al && f.al === h.al ? SURE : 0) +
    (h.genre && tags.includes(h.genre) ? 2 : 0) +
    (tags.includes('longstrip') ? 1 : 0)
  );
}

/** The items of `list` with the highest score, in their order. */
export function bestFits<T>(list: T[], score: (x: T) => number): T[] {
  const s = list.map(score);
  const top = Math.max(...s);
  return list.filter((_, i) => s[i] === top);
}
