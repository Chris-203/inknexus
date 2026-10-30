import { norm } from '../lib/format';
import { isWebUrl } from '../lib/links';
import { bestFits, fit, SURE, type MatchHint } from '../lib/match';
import type { Details, Ranking, SearchResult } from '../lib/types';

export interface AlMedia {
  id: number;
  title: { romaji?: string; english?: string | null };
  synonyms?: string[];
  coverImage?: { large?: string };
  description?: string | null;
  averageScore?: number | null;
  externalLinks?: { site: string; url: string; type?: string; language?: string | null }[];
  /** 'MANGA' or 'ANIME'; asked for only where both can come back. */
  type?: string;
  /** 'MANGA', 'ONE_SHOT', 'NOVEL', …; asked for only where novels can come back. */
  format?: string | null;
  /** Asked for only when matching titles. */
  genres?: string[];
}

export interface AlDetails {
  genres?: string[];
  tags?: { name: string; rank: number; isMediaSpoiler: boolean }[];
  status?: string | null;
  chapters?: number | null;
  startDate?: { year?: number | null };
  averageScore?: number | null;
  staff?: { edges?: { role: string; node: { name: { full: string } } }[] };
}

export interface AlRanking {
  averageScore?: number | null;
  popularity?: number | null;
  rankings?: { rank: number; context: string; allTime?: boolean | null; year?: number | null }[];
}

interface AlTrailer {
  id: string;
  site: string;
}

interface AlVideo {
  title?: { romaji?: string; english?: string | null };
  trailer?: AlTrailer | null;
}

export interface AlTrailers extends AlVideo {
  relations?: { edges?: { relationType: string; node: AlVideo & { type: string } }[] };
}

/** Each video site AniList links: its name, its embeddable player and its own page, with {id} for the video. */
const TRAILER_SITES: Record<string, { name: string; embed: string; page: string }> = {
  youtube: { name: 'YouTube', embed: 'https://www.youtube-nocookie.com/embed/{id}?playsinline=1', page: 'https://www.youtube.com/watch?v={id}' },
  dailymotion: { name: 'Dailymotion', embed: 'https://www.dailymotion.com/embed/video/{id}', page: 'https://www.dailymotion.com/video/{id}' },
};

export interface Trailer {
  /** The series or anime the trailer is for, '' when AniList gives no title. */
  title: string;
  site: string;
  embed: string;
  page: string;
}

/** The series' own trailer or, as manga rarely have one, its anime adaptation's; null when there is none on a known site. */
export function toTrailer(m: AlTrailers): Trailer | null {
  const anime = (m.relations?.edges || []).filter((e) => e.relationType === 'ADAPTATION' && e.node.type === 'ANIME').map((e) => e.node);
  const v = [m, ...anime].find((a) => a.trailer && TRAILER_SITES[a.trailer.site]);
  const site = v?.trailer && TRAILER_SITES[v.trailer.site];
  if (!v?.trailer || !site) return null;
  const id = encodeURIComponent(v.trailer.id);
  return { title: v.title?.english || v.title?.romaji || '', site: site.name, embed: site.embed.replace('{id}', id), page: site.page.replace('{id}', id) };
}

/** Send a GraphQL query to AniList and return its `data`. */
async function query<T>(q: string, variables: Record<string, unknown>): Promise<T> {
  let r: Response;
  try {
    r = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: q, variables }),
    });
  } catch {
    throw new Error('network error; check your connection and try again');
  }
  if (!r.ok)
    throw new Error(`HTTP ${r.status}: ${r.status === 429 ? 'AniList is rate-limiting, wait a minute and try again' : 'AniList failed, try again later'}`);
  const j: { data?: T } = await r.json();
  if (!j.data) throw new Error('AniList sent an unexpected answer, try again later');
  return j.data;
}

const FIELDS = 'id title{romaji english} synonyms coverImage{large} description(asHtml:false) externalLinks{site url type language}';

/** An AniList synopsis as plain text. */
function plain(desc: string | null | undefined): string {
  return (desc || '').replace(/<[^>]+>/g, '');
}

/** A series as a search result: metadata plus official English reading links (Webtoon links skipped). */
function toResult(m: AlMedia): SearchResult {
  return {
    src: 'al',
    ref: m.id,
    title: m.title.english || m.title.romaji || 'Untitled',
    cover: m.coverImage?.large || '',
    desc: plain(m.description),
    links: (m.externalLinks || [])
      .filter((l) => l.type === 'STREAMING' && (!l.language || l.language === 'English') && !/webtoon/i.test(l.site) && isWebUrl(l.url))
      .map((l) => ({ label: l.site, url: l.url })),
  };
}

export async function search(q: string): Promise<SearchResult[]> {
  const data = await query<{ Page?: { media?: AlMedia[] } }>(`query($q:String){Page(perPage:15){media(search:$q,type:MANGA,sort:SEARCH_MATCH){${FIELDS}}}}`, {
    q,
  });
  const media = data.Page?.media;
  if (!media) throw new Error('AniList sent an unexpected answer, try again later');
  return media.map(toResult);
}

/** Every name AniList has for a series: its English and romaji titles and its synonyms. */
export function alNames(m: AlMedia): string[] {
  return [m.title.english, m.title.romaji, ...(m.synonyms || [])].filter((n): n is string => !!n);
}

/**
 * The series among `media` named exactly `title` (its English or romaji title or a synonym, comparing letters and digits
 * only), or null. With a hint from the Webtoon import, one that lists the same Webtoon series counts whatever its name,
 * and among several the best fit wins; on a tie, the first, as AniList ranks them.
 */
export function alMatch(title: string, media: AlMedia[], h?: MatchHint): SearchResult | null {
  const t = norm(title);
  const score = (m: AlMedia) => fit(h, { urls: (m.externalLinks || []).map((l) => l.url), tags: m.genres || [] });
  const found = media.filter((m) => (t && alNames(m).some((n) => norm(n) === t)) || score(m) >= SURE);
  const m = bestFits(found, score)[0];
  return m ? toResult(m) : null;
}

/** For each title, the AniList series with exactly that name, or null; `hints` go with the titles in order. All titles go in one request, so keep them to about 10. */
export async function matchTitles(titles: string[], hints: (MatchHint | undefined)[] = []): Promise<(SearchResult | null)[]> {
  const pages = titles.map((_, i) => `m${i}:Page(perPage:5){media(search:$q${i},type:MANGA,sort:SEARCH_MATCH){${FIELDS} genres}}`);
  const data = await query<Record<string, { media?: AlMedia[] } | undefined>>(
    `query(${titles.map((_, i) => `$q${i}:String`).join(',')}){${pages.join(' ')}}`,
    Object.fromEntries(titles.map((t, i) => ['q' + i, t])),
  );
  return titles.map((t, i) => alMatch(t, data['m' + i]?.media || [], hints[i]));
}

/** AniList's score and synopsis for each of `ids` it has, by id. All ids go in one request, so keep them to 50. */
export async function info(ids: number[]): Promise<Map<number, { score: number | null; desc: string }>> {
  const data = await query<{ Page?: { media?: AlMedia[] } }>(
    `query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:MANGA){id averageScore description(asHtml:false)}}}`,
    { ids },
  );
  const media = data.Page?.media;
  if (!media) throw new Error('AniList sent an unexpected answer, try again later');
  return new Map(media.map((m) => [m.id, { score: m.averageScore || null, desc: plain(m.description) }]));
}

/** The 20 series trending on AniList this week, safe for work, with their names; only those from `country` (such as 'KR') and with `status` (such as 'FINISHED') when given. */
export async function trending(country?: string, status?: string): Promise<AlMedia[]> {
  const data = await query<{ Page?: { media?: AlMedia[] } }>(
    `query($c:CountryCode,$s:MediaStatus){Page(perPage:20){media(type:MANGA,sort:TRENDING_DESC,isAdult:false,countryOfOrigin:$c,status:$s){id title{romaji english} synonyms}}}`,
    { c: country, s: status },
  );
  const media = data.Page?.media;
  if (!media) throw new Error('AniList sent an unexpected answer, try again later');
  return media;
}

const STATUS: Record<string, string> = {
  RELEASING: 'Ongoing',
  FINISHED: 'Completed',
  HIATUS: 'On hiatus',
  CANCELLED: 'Cancelled',
  NOT_YET_RELEASED: 'Not yet released',
};

/** Genres, then tags AniList ranks as fitting well (60% or more) that give nothing away. Authors are the staff credited for story or art. */
export function toDetails(m: AlDetails): Details {
  const tags = (m.tags || []).filter((t) => !t.isMediaSpoiler && t.rank >= 60).map((t) => t.name);
  const authors = (m.staff?.edges || []).filter((e) => /story|art/i.test(e.role)).map((e) => e.node.name.full);
  return {
    tags: [...(m.genres || []), ...tags],
    status: STATUS[m.status || ''] || '',
    year: m.startDate?.year || null,
    chapters: m.chapters || null,
    authors: [...new Set(authors)],
    score: m.averageScore || null,
  };
}

/** A MangaDex series' details with AniList's added: its score, and its genres and tags MangaDex does not have. */
export function addDetails(md: Details, al: Details): Details {
  const has = new Set(md.tags.map(norm));
  return { ...md, tags: [...md.tags, ...al.tags.filter((t) => !has.has(norm(t)))], score: al.score };
}

export async function details(id: number): Promise<Details> {
  const data = await query<{ Media?: AlDetails | null }>(
    `query($id:Int){Media(id:$id,type:MANGA){genres tags{name rank isMediaSpoiler} status chapters startDate{year} averageScore staff(perPage:6,sort:RELEVANCE){edges{role node{name{full}}}}}}`,
    { id },
  );
  if (!data.Media) throw new Error('AniList no longer has this series');
  return toDetails(data.Media);
}

export interface AlLikeThis {
  relations?: { edges?: { relationType: string; node: AlMedia }[] };
  recommendations?: { nodes?: { rating: number; mediaRecommendation: AlMedia | null }[] };
}

/** Comics to read, not anime or light novels. */
function readable(m: AlMedia | null): m is AlMedia {
  return !!m && m.type === 'MANGA' && m.format !== 'NOVEL';
}

/** Related series (sequels, prequels, spin-offs, …), then the ones AniList users recommend, best rated first. Comics only, each once. */
export function toLikeThis(m: AlLikeThis): SearchResult[] {
  const related = (m.relations?.edges || []).map((e) => e.node);
  const liked = (m.recommendations?.nodes || []).filter((r) => r.rating > 0).map((r) => r.mediaRecommendation);
  const all = [...related, ...liked].filter(readable);
  return all.filter((k, i) => all.findIndex((o) => o.id === k.id) === i).map(toResult);
}

export async function likeThis(id: number): Promise<SearchResult[]> {
  const f = `type format ${FIELDS}`;
  const data = await query<{ Media?: AlLikeThis | null }>(
    `query($id:Int){Media(id:$id,type:MANGA){relations{edges{relationType node{${f}}}} recommendations(sort:RATING_DESC,perPage:10){nodes{rating mediaRecommendation{${f}}}}}}`,
    { id },
  );
  if (!data.Media) throw new Error('AniList no longer has this series');
  return toLikeThis(data.Media);
}

/** A series' AniList score, popularity and rankings. AniList's context reads 'highest rated all time' for an all-time place but only 'highest rated' for a year's, so the year is added. */
export function toRanking(m: AlRanking): Ranking {
  const ranks = [...(m.rankings || [])]
    .sort((a, b) => Number(!!b.allTime) - Number(!!a.allTime))
    .map((r) => `#${r.rank} ${r.context.charAt(0).toUpperCase()}${r.context.slice(1)}${r.allTime || !r.year ? '' : ` of ${r.year}`}`);
  return { score: m.averageScore || null, lists: m.popularity || 0, ranks };
}

export async function ranking(id: number): Promise<Ranking> {
  const data = await query<{ Media?: AlRanking | null }>(
    `query($id:Int){Media(id:$id,type:MANGA){averageScore popularity rankings{rank context allTime year}}}`,
    { id },
  );
  if (!data.Media) throw new Error('AniList no longer has this series');
  return toRanking(data.Media);
}

/** The trailer for the AniList series `id`, or null when it has none. */
export async function trailer(id: number): Promise<Trailer | null> {
  const data = await query<{ Media?: AlTrailers | null }>(
    `query($id:Int){Media(id:$id,type:MANGA){title{romaji english} trailer{id site} relations{edges{relationType node{type title{romaji english} trailer{id site}}}}}}`,
    { id },
  );
  return data.Media ? toTrailer(data.Media) : null;
}
