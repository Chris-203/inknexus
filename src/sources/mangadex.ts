import { api, MD } from '../lib/api';
import { norm } from '../lib/format';
import { mdNames, pickTitle, type Name } from '../lib/names';
import type { Chapter, ChapterList, Details, Latest, Page, SearchResult } from '../lib/types';

/** Only safe and suggestive titles, matching what the app has always shown. */
const RATING = '&contentRating[]=safe&contentRating[]=suggestive';

/** A series' English chapter feed, with scanlation groups. No includeExternalUrl: '=1' means only external chapters. */
function feedUrl(ref: string, q: string): string {
  return `${MD}/manga/${ref}/feed?translatedLanguage[]=en&includes[]=scanlation_group${RATING}&${q}`;
}

interface Rel {
  id: string;
  type: string;
  attributes?: { name?: string; fileName?: string };
}
export interface MdManga {
  id: string;
  attributes: {
    title?: Record<string, string>;
    altTitles?: Record<string, string>[];
    description?: Record<string, string>;
    tags?: { attributes: { name: Record<string, string>; group: string } }[];
    status?: string;
    year?: number | null;
    /** Ids on other sites, such as `al` for AniList. */
    links?: Record<string, string> | null;
  };
  relationships?: Rel[];
}
/** /manga/{id}/aggregate: chapter numbers by volume, with chapters MangaDex no longer has marked unavailable. MangaDex sends an empty array instead of an empty object. */
export interface MdAggregate {
  volumes?: Record<string, { chapters?: Record<string, { chapter: string; isUnavailable?: boolean }> }>;
}
export interface MdChapter {
  id: string;
  attributes: { chapter?: string | null; title?: string | null; pages?: number; externalUrl?: string | null; readableAt?: string };
  relationships?: Rel[];
}

/** MangaDex's genre tags (its "genre" tag group), A to Z. Ids from /manga/tag. */
export const GENRES = [
  { id: '391b0423-d847-456f-aff0-8b0cfc03066b', name: 'Action' },
  { id: '87cc87cd-a395-47af-b27a-93258283bbc6', name: 'Adventure' },
  { id: '5920b825-4181-4a17-beeb-9918b0ff7a30', name: "Boys' Love" },
  { id: '4d32cc48-9f00-4cca-9b5a-a839f0764984', name: 'Comedy' },
  { id: '5ca48985-9a9d-4bd8-be29-80dc0303db72', name: 'Crime' },
  { id: 'b9af3a63-f058-46de-a9a0-e0c13906197a', name: 'Drama' },
  { id: 'cdc58593-87dd-415e-bbc0-2ec27bf404cc', name: 'Fantasy' },
  { id: 'a3c67850-4684-404e-9b7f-c69850ee5da6', name: "Girls' Love" },
  { id: '33771934-028e-4cb3-8744-691e866a923e', name: 'Historical' },
  { id: 'cdad7e68-1419-41dd-bdce-27753074a640', name: 'Horror' },
  { id: 'ace04997-f6bd-436e-b261-779182193d3d', name: 'Isekai' },
  { id: '81c836c9-914a-4eca-981a-560dad663e73', name: 'Magical Girls' },
  { id: '50880a9d-5440-4732-9afb-8f457127e836', name: 'Mecha' },
  { id: 'c8cbe35b-1b2b-4a3f-9c37-db84c4514856', name: 'Medical' },
  { id: 'ee968100-4191-4968-93d3-f82d72be7e46', name: 'Mystery' },
  { id: 'b1e97889-25b4-4258-b28b-cd7f4d28ea9b', name: 'Philosophical' },
  { id: '3b60b75c-a2d7-4860-ab56-05f391bb889c', name: 'Psychological' },
  { id: '423e2eae-a7a2-4a8b-ac03-a8351462d71d', name: 'Romance' },
  { id: '256c8bd9-4904-4360-bf4f-508a76d67183', name: 'Sci-Fi' },
  { id: 'e5301a23-ebd9-49dd-a0cb-2add944c7fe9', name: 'Slice of Life' },
  { id: '69964a64-2f90-4d33-beeb-f3ed2875eb4c', name: 'Sports' },
  { id: '7064a261-a137-4d3a-8848-2d385de3a99c', name: 'Superhero' },
  { id: '07251805-a27e-4d59-b488-f0bfbec15168', name: 'Thriller' },
  { id: 'f8f62932-27da-4fe4-8ee1-6779a8c5edba', name: 'Tragedy' },
  { id: 'acc803a4-c95a-4c22-86fc-eb6b582d82a2', name: 'Wuxia' },
];

/** How browse orders a genre: most followed of all time, or newest chapter upload first. */
export type BrowseSort = 'follows' | 'latest';

/** Up to `limit` series from a /manga query, with covers. */
async function mangas(q: string, limit: number): Promise<MdManga[]> {
  const r = await api(`${MD}/manga?${q}&limit=${limit}&includes[]=cover_art${RATING}`);
  const j: { data?: MdManga[] } = await r.json();
  return j.data || [];
}

function toResult(m: MdManga): SearchResult {
  const c = m.relationships?.find((x) => x.type === 'cover_art')?.attributes;
  return {
    src: 'md',
    ref: m.id,
    title: pickTitle(m.attributes),
    desc: m.attributes.description?.en || '',
    cover: c?.fileName ? `https://uploads.mangadex.org/covers/${m.id}/${c.fileName}.256.jpg` : '',
    al: Number(m.attributes.links?.al) || undefined,
    status: STATUS[m.attributes.status || ''] || undefined,
  };
}

async function mangaList(q: string): Promise<SearchResult[]> {
  return (await mangas(q, 20)).map(toResult);
}

/** The series among `list` named exactly `title` (any of its names, comparing letters and digits only), or null. */
export function mdMatch(title: string, list: MdManga[]): SearchResult | null {
  const t = norm(title);
  const m = t && list.find((m) => mdNames(m.attributes).some((n) => norm(n.n) === t));
  return m ? toResult(m) : null;
}

/** The MangaDex series with exactly the name `title`, or null. */
export async function matchTitle(title: string): Promise<SearchResult | null> {
  return mdMatch(title, await mangas(`title=${encodeURIComponent(title)}`, 5));
}

/** The MangaDex series with English chapters that MangaDex links to AniList series `al`, looked up by its first name; or, with no such link, the one with exactly one of `names`. Null when there is none. */
export async function findAniList(al: number, names: string[]): Promise<SearchResult | null> {
  const list = await mangas(`title=${encodeURIComponent(names[0] ?? '')}&availableTranslatedLanguage[]=en`, 5);
  const m = list.find((m) => Number(m.attributes.links?.al) === al);
  if (m) return toResult(m);
  for (const n of names) {
    const hit = mdMatch(n, list);
    if (hit) return hit;
  }
  return null;
}

export function search(q: string): Promise<SearchResult[]> {
  return mangaList(`title=${encodeURIComponent(q)}&order[relevance]=desc`);
}

/** Series with English chapters in a genre (null for every genre), in the chosen order. */
export function browse(tag: string | null, sort: BrowseSort): Promise<SearchResult[]> {
  const order = sort === 'latest' ? 'latestUploadedChapter' : 'followedCount';
  return mangaList(`availableTranslatedLanguage[]=en&order[${order}]=desc${tag ? `&includedTags[]=${tag}` : ''}`);
}

/**
 * One chapter per number, sorted. Drops chapters MangaDex cannot show (no pages and no official link).
 * When a number has several uploads, the first one readable on MangaDex wins over official-site links.
 */
export function toChapterList(raw: MdChapter[]): ChapterList {
  const byNum = new Map<number, Chapter>();
  for (const c of raw) {
    const n = parseFloat(c.attributes.chapter ?? '');
    if (isNaN(n)) continue;
    const ext = c.attributes.externalUrl || '';
    if (!ext && !((c.attributes.pages ?? 0) > 0)) continue;
    const cur = byNum.get(n);
    if (cur && (!cur.ext || ext)) continue;
    const grp = (c.relationships || [])
      .filter((r) => r.type === 'scanlation_group' && r.attributes?.name)
      .map((r) => r.attributes!.name)
      .join(' & ');
    byNum.set(n, { id: c.id, num: n, title: c.attributes.title || '', ext, grp, date: c.attributes.readableAt });
  }
  return { chapters: [...byNum.values()].sort((a, b) => a.num - b.num), listed: raw.length };
}

/** English chapters for a series, up to 3000. */
export async function chapters(ref: string): Promise<ChapterList> {
  const out: MdChapter[] = [];
  let off = 0;
  let total = 1;
  while (off < total && off < 3000) {
    const r = await api(feedUrl(ref, `order[chapter]=asc&limit=500&offset=${off}`));
    const j: { data?: MdChapter[]; total?: number } = await r.json();
    total = j.total || 0;
    off += 500;
    out.push(...(j.data || []));
  }
  return toChapterList(out);
}

/** How many of the newest chapters the library checks per series. */
export const LATEST = 20;

/** The newest readable chapter numbers for a series, in one small request. */
export async function latest(ref: string): Promise<Latest> {
  const j: { data?: MdChapter[] } = await (await api(feedUrl(ref, `order[chapter]=desc&limit=${LATEST}`))).json();
  const raw = j.data || [];
  return { nums: toChapterList(raw).chapters.map((c) => c.num), full: raw.length >= LATEST, at: Date.now() };
}

/** How long an at-home answer is reused. Its baseUrl lasts about 15 minutes. */
export const PAGES_TTL = 10 * 60_000;

/**
 * at-home answers by chapter id, with when they were asked for. Each answer has its own baseUrl, so reusing one keeps
 * the image URLs, and with them the browser cache, the same for a chapter loaded ahead.
 */
const pageCache = new Map<string, { at: number; list: Promise<Page[]> }>();

/** Image URLs for a chapter from MangaDex@Home: data-saver first, full quality as fallback. Reused for PAGES_TTL; a failed load is not. */
export function pages(id: string): Promise<Page[]> {
  const now = Date.now();
  for (const [k, e] of pageCache) if (now - e.at >= PAGES_TTL) pageCache.delete(k);
  const hit = pageCache.get(id);
  if (hit) return hit.list;
  const list = fetchPages(id);
  pageCache.set(id, { at: now, list });
  list.catch(() => {
    if (pageCache.get(id)?.list === list) pageCache.delete(id);
  });
  return list;
}

async function fetchPages(id: string): Promise<Page[]> {
  const j: { baseUrl: string; chapter: { hash: string; data: string[]; dataSaver: string[] } } = await (await api(`${MD}/at-home/server/${id}`)).json();
  return j.chapter.dataSaver.map((f, i) => ({
    a: `${j.baseUrl}/data-saver/${j.chapter.hash}/${f}`,
    b: j.chapter.data[i] ? `${j.baseUrl}/data/${j.chapter.hash}/${j.chapter.data[i]}` : '',
  }));
}

/** The tag groups a details screen shows, in this order; content warnings and the rest are left out. */
const TAG_GROUPS = ['genre', 'format', 'theme'];
const STATUS: Record<string, string> = { ongoing: 'Ongoing', completed: 'Completed', hiatus: 'On hiatus', cancelled: 'Cancelled' };

export function toDetails(m: MdManga, agg: MdAggregate): Details {
  const a = m.attributes;
  const group = (t: { attributes: { group: string } }) => TAG_GROUPS.indexOf(t.attributes.group);
  const tags = (a.tags || [])
    .filter((t) => group(t) >= 0)
    .sort((x, y) => group(x) - group(y))
    .flatMap((t) => t.attributes.name.en || []);
  const nums = Object.values(agg.volumes || {}).flatMap((v) => Object.values(v.chapters || {}).flatMap((c) => (c.isUnavailable ? [] : c.chapter)));
  const authors = (m.relationships || []).filter((r) => (r.type === 'author' || r.type === 'artist') && r.attributes?.name).map((r) => r.attributes!.name!);
  return {
    tags,
    status: STATUS[a.status || ''] || '',
    year: a.year || null,
    chapters: new Set(nums.filter((n) => !isNaN(parseFloat(n)))).size || null,
    authors: [...new Set(authors)],
  };
}

/** Tags, status, year, authors and English chapter count for a series. */
export async function details(ref: string): Promise<Details> {
  const [m, agg] = await Promise.all([
    api(`${MD}/manga/${ref}?includes[]=author&includes[]=artist`).then((r) => r.json() as Promise<{ data: MdManga }>),
    api(`${MD}/manga/${ref}/aggregate?translatedLanguage[]=en`).then((r) => r.json() as Promise<MdAggregate>),
  ]);
  return toDetails(m.data, agg);
}

/** Every name MangaDex has for a series. */
export async function names(ref: string): Promise<Name[]> {
  const j: { data: MdManga } = await (await api(`${MD}/manga/${ref}`)).json();
  return mdNames(j.data.attributes);
}

export function mangaUrl(ref: string): string {
  return `https://mangadex.org/title/${ref}`;
}

export function chapterUrl(id: string): string {
  return `https://mangadex.org/chapter/${id}`;
}
