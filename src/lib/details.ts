import { createDeviceCache } from './deviceCache';
import type { LikeOf } from './moreLikeThis';
import type { Details, Ranking } from './types';
import * as anilist from '../sources/anilist';
import * as mangadex from '../sources/mangadex';

/**
 * What a Browse result's details screen loads, kept for the series that were opened: Browse rows and More like this cards
 * keep only a title, cover and the start of the synopsis until then. Opening one again within a day shows it at once; after
 * that it loads again, so a chapter count does not fall behind.
 */
const saved = createDeviceCache<Details | Ranking | anilist.Trailer | null>('inknexus-details', 100, 864e5);

function detailsKey(x: LikeOf): string {
  return `${x.al}|${x.md}|${x.title}`;
}

/**
 * More about series `x`, whichever of its sources is shown: MangaDex's details with AniList's added, or either one alone,
 * or null when neither has the series. With MangaDex, AniList only adds to its details, so they show without AniList when it fails.
 */
export async function seriesDetails(x: LikeOf): Promise<Details | null> {
  const md = x.md ? mangadex.details(x.md) : null;
  const al = aniListDetails(x, md).catch((e) => {
    if (!md) throw e;
    return null;
  });
  const [m, a] = await Promise.all([md, al]);
  if (m && a) return { ...anilist.addDetails(m, a), al: a.al };
  return m ?? a;
}

/** AniList's details for `x`, with the id they are for: the one `x` has, else the one MangaDex links it to, else the series AniList has under its name. */
async function aniListDetails(x: LikeOf, md: Promise<Details> | null): Promise<Details | null> {
  const id = x.al || (await md)?.al || Number((await anilist.matchTitles([x.title]))[0]?.ref) || null;
  return id ? { ...(await anilist.details(id)), al: id } : null;
}

/** The details saved for `x` in the last day: null when neither source has it, undefined when not saved. */
export function savedDetails(x: LikeOf): Details | null | undefined {
  return saved.get(detailsKey(x)) as Details | null | undefined;
}

/** seriesDetails(), saved for next time. */
export async function loadDetails(x: LikeOf): Promise<Details | null> {
  const d = await seriesDetails(x);
  saved.set(detailsKey(x), d);
  return d;
}

/** The trailer saved for AniList id `al`: null when it has none, undefined when not saved. */
export function savedTrailer(al: number): anilist.Trailer | null | undefined {
  return saved.get(`trailer:${al}`) as anilist.Trailer | null | undefined;
}

/** The trailer of AniList series `al` or its anime, saved for next time. */
export async function loadTrailer(al: number): Promise<anilist.Trailer | null> {
  const t = await anilist.trailer(al);
  saved.set(`trailer:${al}`, t);
  return t;
}

/** The AniList ranking saved for `al` when a series not in My Series was opened; one in My Series keeps its own. */
export function savedRanking(al: number): Ranking | undefined {
  return saved.get(`ranking:${al}`) as Ranking | undefined;
}

export function saveRanking(al: number, r: Ranking) {
  saved.set(`ranking:${al}`, r);
}
