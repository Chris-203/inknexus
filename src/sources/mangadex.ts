import { api, MD } from '../lib/api';
import { mdNames, pickTitle, type Name } from '../lib/names';
import type { Chapter, ChapterList, Latest, Page, SearchResult } from '../lib/types';

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
interface MdManga {
  id: string;
  attributes: { title?: Record<string, string>; altTitles?: Record<string, string>[]; description?: Record<string, string> };
  relationships?: Rel[];
}
export interface MdChapter {
  id: string;
  attributes: { chapter?: string | null; title?: string | null; pages?: number; externalUrl?: string | null };
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

/** Up to 20 series from a /manga query, with covers. */
async function mangaList(q: string): Promise<SearchResult[]> {
  const r = await api(`${MD}/manga?${q}&limit=20&includes[]=cover_art${RATING}`);
  const j: { data?: MdManga[] } = await r.json();
  return (j.data || []).map((m) => {
    const c = m.relationships?.find((x) => x.type === 'cover_art')?.attributes;
    return {
      src: 'md',
      ref: m.id,
      title: pickTitle(m.attributes),
      desc: m.attributes.description?.en || '',
      cover: c?.fileName ? `https://uploads.mangadex.org/covers/${m.id}/${c.fileName}.256.jpg` : '',
    };
  });
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
    byNum.set(n, { id: c.id, num: n, title: c.attributes.title || '', ext, grp });
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
