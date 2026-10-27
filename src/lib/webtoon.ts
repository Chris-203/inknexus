import { planImport } from './importBackup';
import { setOpensInBrowser } from './siteSettings';
import { newSeries } from './storage';
import { getState, replaceState } from './store';
import type { Link, Series } from './types';

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
    document.querySelectorAll<HTMLAnchorElement>('a[href*="title_no="]').forEach((a) => {
      const title = clean(a.querySelector('.subj, .title, strong, h3')?.textContent) || clean(a.querySelector('img')?.alt) || clean(a.textContent);
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
    const titles = new Set([...seen.keys()].map((h) => new URL(h).searchParams.get('title_no')));
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
    const no = u.searchParams.get('title_no') || '';
    const parts = u.pathname.split('/');
    const at = parts.lastIndexOf('viewer');
    if (!/^\d+$/.test(no) || (at < 0 && parts.at(-1) !== 'list')) continue;
    const ep = u.searchParams.get('episode_no') || String(v[2] ?? '').match(/(?:ep(?:isode)?\.?|#)\s*(\d+)/i)?.[1];
    const n = Number(ep) || 0;
    const page = 'https://www.' + SITE + (at < 0 ? parts : parts.slice(0, at - 1).concat('list')).join('/');
    const item = {
      title: typeof v[1] === 'string' ? v[1].trim() : '',
      url: `${page}?title_no=${no}`,
      resume: at >= 0 && n ? `https://www.${SITE}${u.pathname}?title_no=${no}&episode_no=${n}` : '',
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
  return { lib: next, added: fresh.length, updated: lib.filter((x) => merged.has(x.id) && merged.get(x.id) !== x).length };
}

/** Import the Webtoon list in `text` into the library, and return what to tell the user. */
export function importWebtoon(text: string): string {
  let items: WebtoonItem[];
  try {
    items = webtoonListIn(text);
  } catch {
    return 'No Webtoon list found. On webtoons.com, tap the bookmark, then Send to InkNexus';
  }
  if (!items.length) return 'That Webtoon list has no series. Open your Recent list on webtoons.com and tap the bookmark there';
  const r = mergeWebtoon(getState().lib, items);
  replaceState({ ...getState(), lib: r.lib });
  // webtoons.com does not show inside other sites, and in the browser an iPhone opens its pages in the Webtoon app.
  setOpensInBrowser(SITE, true);
  const parts = [r.added && `${r.added} added`, r.updated && `${r.updated} updated`].filter(Boolean);
  return parts.length ? `Webtoon list imported: ${parts.join(', ')}` : 'Webtoon list imported. Nothing changed';
}
