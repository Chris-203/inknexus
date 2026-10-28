import { why } from './api';
import { planImport } from './importBackup';
import { setOpensInBrowser } from './siteSettings';
import { newSeries } from './storage';
import { findSeries, getState, replaceState, sourceFrom, updateSeries } from './store';
import type { Link, SearchResult, Series } from './types';
import * as anilist from '../sources/anilist';
import * as mangadex from '../sources/mangadex';

/** One Webtoon series from the list the bookmarklet sends: its series page, the last episode's page, and that episode number. */
export interface WebtoonItem {
  title: string;
  url: string;
  resume: string;
  n: number;
}

const SITE = 'webtoons.com';
const HASH = '#webtoon=';

function isWebtoon(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return h === SITE || h.endsWith('.' + SITE);
  } catch {
    return false;
  }
}

/**
 * The bookmarklet, run on webtoons.com. It scrolls the page until no more titles load, collects every link to a series
 * or episode with its title and the text of its list item, then shows a bar whose button copies the list and opens `app`
 * with it. Everything it uses is inside it, since it runs on webtoons.com as source text, and it spells # as a character
 * code because a bookmark address can lose what follows a #.
 */
function sendToInkNexus(app: string) {
  const seen = new Map<string, string[]>();
  const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const grab = () => {
    document.querySelectorAll<HTMLAnchorElement>('a[href*="title_no="], a[href*="titleNo="]').forEach((a) => {
      const title = clean(a.querySelector('.subject, .subj, .title, strong, h3')?.textContent) || clean(a.querySelector('img')?.alt) || clean(a.textContent);
      if (!seen.has(a.href) && title) seen.set(a.href, [a.href, title, clean((a.closest('li') || a).textContent)]);
    });
  };
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:black;color:white;font:16px/1.4 system-ui,sans-serif;display:flex;gap:12px;align-items:center';
  bar.textContent = 'Loading your list…';
  document.body.append(bar);
  let same = 0;
  let height = 0;
  const step = () => {
    grab();
    same = document.body.scrollHeight === height ? same + 1 : 0;
    height = document.body.scrollHeight;
    if (same < 3) {
      scrollTo(0, height);
      setTimeout(step, 700);
      return;
    }
    if (!seen.size) {
      bar.textContent = 'No Webtoon series on this page. Open your Recent list on webtoons.com, then tap the bookmark again.';
      return;
    }
    const url = app + '/' + String.fromCharCode(35) + 'webtoon=' + encodeURIComponent(JSON.stringify([...seen.values()]));
    const go = document.createElement('button');
    go.textContent = 'Send to InkNexus';
    go.style.cssText = 'min-height:44px;padding:0 16px;border:0;border-radius:10px;background:white;color:black;font:inherit;font-weight:700';
    go.onclick = () => {
      const t = document.createElement('textarea');
      t.value = url;
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
      location.href = url;
    };
    const titles = new Set([...seen.keys()].map((h) => h.match(/title_?no=(\d+)/i)?.[1]));
    bar.textContent = `${titles.size} series ready. `;
    bar.append(go);
  };
  step();
}

/** The bookmarklet as a bookmark address that sends the list to the InkNexus at `app` (its origin). */
export function bookmarklet(app: string): string {
  return `javascript:void((${sendToInkNexus.toString().replace(/\s*\n\s*/g, ' ')})(${JSON.stringify(app)}))`;
}

/** The series in a list the bookmarklet sent, in the list's order: one per title, at the furthest episode it links to. Series with no episode read, such as suggestions on the page, are left out. */
export function parseWebtoonList(raw: unknown): WebtoonItem[] {
  const byTitle = new Map<string, WebtoonItem>();
  for (const v of Array.isArray(raw) ? raw : []) {
    if (!Array.isArray(v) || typeof v[0] !== 'string' || !isWebtoon(v[0])) continue;
    const u = new URL(v[0]);
    const q = u.searchParams;
    const no = q.get('title_no') || q.get('titleNo') || '';
    const parts = u.pathname.split('/');
    const page = parts.pop();
    if (!/^\d+$/.test(no) || !['viewer', 'list', 'episodeList'].includes(page!)) continue;
    const ep = q.get('episode_no') || q.get('episodeNo') || String(v[2] ?? '').match(/(?:ep(?:isode)?\.?|#)\s*(\d+)/i)?.[1];
    const n = Number(ep) || 0;
    // Links are either /en/genre/series/(episode/viewer|list)?title_no= or, on the Recent list, /viewer?titleNo=&episodeNo=.
    const series = page === 'viewer' ? parts.slice(0, -1) : parts;
    const base = 'https://www.' + SITE;
    const item = {
      title: typeof v[1] === 'string' ? v[1].trim() : '',
      url: series.length > 1 ? `${base}${series.join('/')}/list?title_no=${no}` : `${base}/episodeList?titleNo=${no}`,
      resume: page === 'viewer' && n ? base + u.pathname + u.search : '',
      n,
    };
    const had = byTitle.get(no);
    if (!had) byTitle.set(no, item);
    else byTitle.set(no, { ...(item.n > had.n ? item : had), title: had.title || item.title });
  }
  return [...byTitle.values()].filter((w) => w.title && w.n);
}

/** The list in a link the bookmarklet made, opened or pasted. Throws when there is none. */
export function webtoonListIn(text: string): WebtoonItem[] {
  const at = text.indexOf(HASH);
  if (at < 0) throw new Error('no Webtoon list');
  return parseWebtoonList(JSON.parse(decodeURIComponent(text.slice(at + HASH.length).trim())));
}

/** Whether a link has a Webtoon list in it. */
export function hasWebtoonList(text: string): boolean {
  return text.includes(HASH);
}

function linkOf(w: WebtoonItem): Link {
  return { label: 'Webtoon', url: w.url, tpl: '', resume: w.resume, rn: w.n };
}

/** A series already in the library takes the Webtoon episode and link when the list is further along, or when it has no Webtoon link yet. */
function mergeOne(mine: Series, theirs: Series): Series {
  const l = theirs.links[0]!;
  const i = mine.links.findIndex((m) => isWebtoon(m.url));
  if (i >= 0 && theirs.last <= mine.last) return mine;
  const links = i < 0 ? [...mine.links, l] : mine.links.map((m, k) => (k === i ? { ...m, url: l.url, resume: l.resume, rn: l.rn } : m));
  return theirs.last > mine.last ? { ...mine, links, last: theirs.last, t: theirs.t } : { ...mine, links };
}

/** The library with a Webtoon list merged in. New series keep the list's order, most recent first. */
export function mergeWebtoon(lib: Series[], items: WebtoonItem[], now = Date.now()) {
  const incoming = items.map((w, i) => ({ ...newSeries({ title: w.title, links: [linkOf(w)], last: w.n }), t: now - i }));
  const { fresh, dupes } = planImport(lib, incoming);
  const merged = new Map(dupes.map((d) => [d.mine.id, mergeOne(d.mine, d.theirs)]));
  const next = [...lib.map((x) => merged.get(x.id) ?? x), ...fresh];
  return { lib: next, fresh: fresh.map((x) => x.id), updated: lib.filter((x) => merged.has(x.id) && merged.get(x.id) !== x).length };
}

/** `x` with its exact title matches on AniList and MangaDex added as sources, where it has none yet. Its Webtoon link stays the selected source. */
export function withMatches(x: Series, al: SearchResult | null, md: SearchResult | null): Series {
  let y = x;
  if (al && y.al === null) y = { ...y, ...sourceFrom(y, al) };
  if (md && !y.md) {
    const i = y.links.findIndex((l) => isWebtoon(l.url));
    y = { ...y, ...sourceFrom(y, md), src: y.src || (i >= 0 ? 'l' + i : '') };
  }
  return y;
}

/** How many titles go to AniList in one request. */
const BATCH = 10;

/** Look up newly imported series on AniList and MangaDex, a batch at a time, and add the exact title matches as sources. */
async function lookUp(ids: string[], toast: (m: string) => void) {
  const found = new Set<string>();
  const add = (x: Series, al: SearchResult | null, md: SearchResult | null) => {
    if (!al && !md) return;
    found.add(x.id);
    updateSeries(x.id, (cur) => withMatches(cur, al, md));
  };
  try {
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH).flatMap((id) => findSeries(id) ?? []);
      if (!batch.length) continue;
      const al = await anilist.matchTitles(batch.map((x) => x.title));
      batch.forEach((x, k) => add(x, al[k] ?? null, null));
      // One MangaDex search at a time stays well under its rate limit while the library checks for new chapters.
      for (const x of batch) add(x, null, await mangadex.matchTitle(x.title));
    }
  } catch (e) {
    return toast(`Stopped looking up series on AniList and MangaDex (${why(e)}). ${found.size} matched; add the rest from a series with + Source`);
  }
  toast(`Found ${found.size} of ${ids.length} Webtoon series on AniList or MangaDex`);
}

/** Import the Webtoon list in `text` into the library and say how it went, then look up the new series on AniList and MangaDex. */
export function importWebtoon(text: string, toast: (m: string) => void) {
  let items: WebtoonItem[];
  try {
    items = webtoonListIn(text);
  } catch {
    return toast('No Webtoon list found. On webtoons.com, tap the bookmark, then Send to InkNexus');
  }
  if (!items.length) return toast('That Webtoon list has no series. Open your Recent list on webtoons.com and tap the bookmark there');
  const r = mergeWebtoon(getState().lib, items);
  replaceState({ ...getState(), lib: r.lib });
  // webtoons.com does not show inside other sites, and in the browser an iPhone opens its pages in the Webtoon app.
  setOpensInBrowser(SITE, true);
  const parts = [r.fresh.length && `${r.fresh.length} added`, r.updated && `${r.updated} updated`].filter(Boolean);
  if (!parts.length) return toast('Webtoon list imported. Nothing changed');
  toast(`Webtoon list imported: ${parts.join(', ')}${r.fresh.length ? '. Looking up covers on AniList and MangaDex…' : ''}`);
  if (r.fresh.length) void lookUp(r.fresh, toast);
}
