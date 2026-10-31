import { createDeviceCache } from './deviceCache';
import type { Details, Ranking, SearchResult } from './types';
import * as anilist from '../sources/anilist';
import * as mangadex from '../sources/mangadex';

/**
 * What a series' details screen loads, kept for the series that were opened: Browse rows and More like this cards keep
 * only a title, cover and the start of the synopsis until then. Opening one again within a day shows it at once; after
 * that it loads again, so a chapter count does not fall behind.
 */
const saved = createDeviceCache<Details | Ranking | anilist.Trailer | null>('inknexus-details', 100, 864e5);

function detailsKey(o: SearchResult): string {
  return `${o.src}:${o.ref}`;
}

/** The details saved for `o` in the last day. */
export function savedDetails(o: SearchResult): Details | undefined {
  return saved.get(detailsKey(o)) as Details | undefined;
}

/** More about a result, saved for next time. On MangaDex, AniList's score and tags are added when MangaDex links the series to AniList. */
export async function loadDetails(o: SearchResult): Promise<Details> {
  let d: Details;
  if (o.src === 'al') d = await anilist.details(Number(o.ref));
  else {
    const [md, al] = await Promise.all([
      mangadex.details(String(o.ref)),
      // AniList only adds to MangaDex's details, so the page shows without it when AniList fails.
      o.al ? anilist.details(o.al).catch(() => null) : null,
    ]);
    d = al ? anilist.addDetails(md, al) : md;
  }
  saved.set(detailsKey(o), d);
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
