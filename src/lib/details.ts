import type { LikeOf } from './moreLikeThis';
import type { Details } from './types';
import * as anilist from '../sources/anilist';
import * as mangadex from '../sources/mangadex';

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
