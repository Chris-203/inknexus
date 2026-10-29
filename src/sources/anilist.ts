import { norm } from '../lib/format';
import { isWebUrl } from '../lib/links';
import type { Details, SearchResult } from '../lib/types';

export interface AlMedia {
  id: number;
  title: { romaji?: string; english?: string | null };
  synonyms?: string[];
  coverImage?: { large?: string };
  description?: string | null;
  externalLinks?: { site: string; url: string; type?: string; language?: string | null }[];
  /** 'MANGA' or 'ANIME'; asked for only where both can come back. */
  type?: string;
  /** 'MANGA', 'ONE_SHOT', 'NOVEL', …; asked for only where novels can come back. */
  format?: string | null;
}

export interface AlDetails {
  genres?: string[];
  tags?: { name: string; rank: number; isMediaSpoiler: boolean }[];
  status?: string | null;
  chapters?: number | null;
  startDate?: { year?: number | null };
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

/** A series as a search result: metadata plus official English reading links (Webtoon links skipped). */
function toResult(m: AlMedia): SearchResult {
  return {
    src: 'al',
    ref: m.id,
    title: m.title.english || m.title.romaji || 'Untitled',
    cover: m.coverImage?.large || '',
    desc: (m.description || '').replace(/<[^>]+>/g, ''),
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

/** The series among `media` named exactly `title` (its English or romaji title or a synonym, comparing letters and digits only), or null. */
export function alMatch(title: string, media: AlMedia[]): SearchResult | null {
  const t = norm(title);
  const m = t && media.find((m) => [m.title.english, m.title.romaji, ...(m.synonyms || [])].some((n) => norm(n) === t));
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
  };
}

export async function details(id: number): Promise<Details> {
  const data = await query<{ Media?: AlDetails | null }>(
    `query($id:Int){Media(id:$id,type:MANGA){genres tags{name rank isMediaSpoiler} status chapters startDate{year} staff(perPage:6,sort:RELEVANCE){edges{role node{name{full}}}}}}`,
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
