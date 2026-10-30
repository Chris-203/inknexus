import { norm } from '../lib/format';
import { isWebUrl } from '../lib/links';
import type { Details, SearchResult } from '../lib/types';

export interface AlMedia {
  id: number;
  title: { romaji?: string; english?: string | null };
  synonyms?: string[];
  coverImage?: { large?: string };
  description?: string | null;
  averageScore?: number | null;
  externalLinks?: { site: string; url: string; type?: string; language?: string | null }[];
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

/** The series among `media` named exactly `title` (its English or romaji title or a synonym, comparing letters and digits only), or null. */
export function alMatch(title: string, media: AlMedia[]): SearchResult | null {
  const t = norm(title);
  const m = t && media.find((m) => alNames(m).some((n) => norm(n) === t));
  return m ? toResult(m) : null;
}

/** For each title, the AniList series with exactly that name, or null. All titles go in one request, so keep them to about 10. */
export async function matchTitles(titles: string[]): Promise<(SearchResult | null)[]> {
  const pages = titles.map((_, i) => `m${i}:Page(perPage:5){media(search:$q${i},type:MANGA,sort:SEARCH_MATCH){${FIELDS}}}`);
  const data = await query<Record<string, { media?: AlMedia[] } | undefined>>(
    `query(${titles.map((_, i) => `$q${i}:String`).join(',')}){${pages.join(' ')}}`,
    Object.fromEntries(titles.map((t, i) => ['q' + i, t])),
  );
  return titles.map((t, i) => alMatch(t, data['m' + i]?.media || []));
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

/** The 20 series trending on AniList this week, safe for work, with their names. */
export async function trending(): Promise<AlMedia[]> {
  const data = await query<{ Page?: { media?: AlMedia[] } }>(
    `{Page(perPage:20){media(type:MANGA,sort:TRENDING_DESC,isAdult:false){id title{romaji english} synonyms}}}`,
    {},
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
