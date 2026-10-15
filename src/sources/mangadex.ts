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

export async function search(q: string): Promise<SearchResult[]> {
  const r = await api(`${MD}/manga?title=${encodeURIComponent(q)}&limit=20&includes[]=cover_art&order[relevance]=desc${RATING}`);
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
