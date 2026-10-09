import { cachedChapters, chapterState } from './lib/chapters';
import { fmt, host, nextWhole, norm, PRESETS } from './lib/links';
import type { SearchResult, Series } from './lib/types';
import { checkUpdates, latestFor, newCount, updates } from './lib/updates';
import { zoomable } from './lib/zoom';
import { chapterUrl, mangaUrl, pages as mdPages } from './sources/mangadex';
import { why } from './lib/api';
import { find, S, setLast, sourcesOf } from './state';
import { $, esc, hint, toast } from './ui';

export type View =
  | { name: 'library' }
  | { name: 'search' }
  | { name: 'series'; id: string }
  | { name: 'reader'; id: string; n: number }
  | { name: 'frame'; id: string; i: number; ch: number; url: string };

/* ---------- navigation ----------
   Views live in browser history as { v, back }, so the phone's back gesture moves through the app.
   `back` says there is an in-app view behind this one. */
const NAMES = ['library', 'search', 'series', 'reader', 'frame'];
const viewOf = (st: unknown): View | null => {
  const v = (st as { v?: View } | null)?.v;
  return v && NAMES.includes(v.name) ? v : null;
};
export let V: View = viewOf(history.state) || { name: 'library' };
history.replaceState({ v: V, back: !!(history.state as { back?: boolean } | null)?.back }, '');

/** Go to a view. `replace` swaps the current history entry, for moving chapter to chapter. */
export function go(v: View, replace = false) {
  if (replace) history.replaceState({ v, back: !!history.state?.back }, '');
  else history.pushState({ v, back: true }, '');
  show(v);
}
/** The in-app back button: step back through history when there is an app view behind, otherwise go to `fallback`. */
export function goBack(fallback: View) {
  if (history.state?.back) history.back();
  else go(fallback, true);
}
export function onPop(st: unknown) {
  show(viewOf(st) || { name: 'library' });
}
function show(v: View) {
  V = v;
  render();
  window.scrollTo(0, 0);
}

/* ---------- state kept between views ---------- */
export const search: { q: string; res: SearchResult[] | null } = { q: '', res: null };
/** The selected source on the series screen: 'md' or 'l<index>'. */
export let curSrc = '';
let teardown: (() => void)[] = [];
let readerTok = 0;
let pageFailToasted = false;

const app = $('#app');

export function render() {
  teardown.forEach((f) => f());
  teardown = [];
  const full = V.name === 'reader' || V.name === 'frame';
  $('#nav').hidden = full;
  document.body.classList.toggle('nonav', full);
  const tab = V.name === 'search' ? 'search' : 'library';
  document.querySelectorAll<HTMLElement>('#nav button').forEach((b) => b.toggleAttribute('aria-current', b.dataset.id === tab));
  switch (V.name) {
    case 'library':
      return vLibrary();
    case 'search':
      return vSearch();
    case 'series':
      return vSeries(V);
    case 'reader':
      return void vReader(V);
    case 'frame':
      return vFrame(V);
  }
}

/* ---------- shared templates ---------- */
export const presetHtml = () =>
  `<div class="presets">${PRESETS.map(([n], i) => `<button type="button" class="chip" data-a="preset" data-i="${i}">${esc(n)}</button>`).join('')}</div>`;

/** A search result row. `extra` follows the title; `btn` is the action button. */
export const resRow = (o: SearchResult, extra: string, btn: string) =>
  `<div class="res">${o.cover ? `<img src="${esc(o.cover)}" loading="lazy" alt="">` : '<span class="thumb"></span>'}<div><b>${esc(o.title)}</b>${extra}</div>${btn}</div>`;

const cover = (x: Series) => (x.cover ? `<img class="cover" src="${esc(x.cover)}" alt="">` : '<span class="cover"></span>');

/* ---------- library ---------- */
function vLibrary() {
  checkUpdates(S.lib, false, () => V.name === 'library' && render());
  const l = [...S.lib].sort((a, b) => (b.t || 0) - (a.t || 0));
  const f = updates.failed;
  app.innerHTML =
    `<header><h1>Library</h1><span class="sub">${l.length} series${updates.checking ? ' · checking for new chapters…' : ''}</span></header>` +
    (l.length
      ? `<div class="grid">${l.map(card).join('')}</div>
    ${f.length ? `<div class="pad"><p class="hint">Could not check ${f.length === 1 ? esc(f[0]!.title) : `${f.length} series`} for new chapters (${esc(f[0]!.error)}).</p><button class="btn ghost sm" data-a="recheck">Check again</button></div>` : ''}
    <div class="row foot"><button class="btn ghost sm" data-a="export">Export backup</button><button class="btn ghost sm" data-a="import">Import backup</button></div>`
      : `<div class="empty"><p>Your library is empty.</p><button class="btn" data-a="tab" data-id="search">Find a series</button>
    <p class="restore">Used InkNexus before, in another browser or on another device? Each one keeps its own library. Import the backup file you exported there.</p>
    <button class="btn ghost" data-a="import">Import backup</button></div>`);
}

function card(x: Series) {
  const last = x.last || 0;
  const fresh = x.md && !x.mdh && last ? newCount(latestFor(x.md), last) : null;
  return `<button class="card" data-a="series" data-id="${esc(x.id)}">${x.cover ? `<img src="${esc(x.cover)}" loading="lazy" alt="">` : '<span class="cover"></span>'}
    <span class="badges">${last ? `<span class="badge">Ch. ${fmt(last)}</span>` : ''}${fresh?.n ? `<span class="badge new">${fresh.n}${fresh.more ? '+' : ''} new</span>` : ''}</span>
    <span class="ct">${esc(x.title)}</span></button>`;
}

/* ---------- find ---------- */
export function resList(r: SearchResult[]) {
  if (!r.length) return hint('No matches. Try another spelling, or add it by link below.');
  return r
    .map((o, i) => {
      const ex = o.src === 'md' ? S.lib.find((x) => x.md === o.ref) : S.lib.find((x) => x.al === o.ref || norm(x.title) === norm(o.title));
      return resRow(
        o,
        `<span class="tag">${o.src === 'md' ? 'MangaDex' : 'AniList'}</span><p>${esc(o.desc)}</p>`,
        ex ? `<button class="btn sm" data-a="series" data-id="${esc(ex.id)}">Open</button>` : `<button class="btn sm" data-a="add" data-i="${i}">Add</button>`,
      );
    })
    .join('');
}

function vSearch() {
  app.innerHTML = `<header><h1>Find</h1></header>
  <form id="sf" class="row" role="search"><input id="q" aria-label="Search by title" placeholder="Search by title" value="${esc(search.q)}" autocomplete="off"><button class="btn">Search</button></form>
  <div id="res">${search.res ? resList(search.res) : hint('MangaDex gives you a built-in reader. AniList adds official reading links. For any other site, add it by link.')}</div>
  <details class="manual"><summary>Add by link</summary>
  <form id="mf" class="stack"><input name="title" aria-label="Title" placeholder="Title" required>
  ${presetHtml()}<input name="label" aria-label="Site name" placeholder="Site name (optional)"><input name="url" type="url" aria-label="Link" placeholder="https://…" required>
  <input name="ch" type="number" step="any" min="0" aria-label="Chapter you're on" placeholder="Chapter you're on (optional if the link has one)"><button class="btn">Add to library</button></form></details>`;
}

/* ---------- series ---------- */
function vSeries(v: Extract<View, { name: 'series' }>) {
  const x = find(v.id);
  if (!x) return go({ name: 'library' }, true);
  const all = sourcesOf(x);
  const vis = all.filter((q) => !q.h);
  curSrc = vis.some((q) => q.k === x.src) ? x.src! : vis[0]?.k || '';
  const last = x.last || 0;
  let body = '';
  let cta = '';
  if (curSrc === 'md' && x.md) {
    const st = chapterState(x.md, () => V.name === 'series' && V.id === x.id && render());
    if (st.status === 'loading') body = hint('Loading chapters…');
    else if (st.status === 'error')
      body = hint(`Could not load chapters from MangaDex (${esc(st.error)}).`) + `<div class="pad"><button class="btn ghost" data-a="retrych">Try again</button></div>`;
    else if (!st.list.chapters.length) {
      const n = st.list.listed;
      body = hint(
        n
          ? `MangaDex lists ${n} English chapter${n === 1 ? '' : 's'} for this title, but none can be read here (removed or hosted elsewhere). Add an official link with + Source.`
          : 'MangaDex has no English chapters for this title. Add an official link with + Source, or switch to another source.',
      );
    } else {
      const chs = st.list.chapters;
      const next = chs.find((c) => c.num > last);
      cta = next
        ? `<div class="pad"><button id="cont" class="btn" data-a="read" data-cont="1">${last ? 'Continue' : 'Start'} with ch. ${fmt(next.num)}</button></div>`
        : hint("You're caught up on this source.");
      const asc = S.sort === 'asc';
      const first = chs[0]!;
      body =
        `<div class="row mid"><button class="btn ghost sm" data-a="sort">Sort: ${asc ? 'oldest first' : 'newest first'}</button><span class="sub">${chs.length} chapters, ${fmt(first.num)} to ${fmt(chs[chs.length - 1]!.num)}</span></div>` +
        (first.num > 1 ? hint(`Chapters before ${fmt(first.num)} are not on MangaDex. Try another source for those.`) : '') +
        (asc ? chs : [...chs].reverse())
          .map(
            (c) =>
              `<button class="ch${c.num <= last ? ' read' : ''}" data-a="read" data-n="${c.num}"><b>Ch. ${fmt(c.num)}</b><span>${esc([c.ext ? 'Official site ↗' : c.title, c.grp].filter(Boolean).join(' · '))}</span></button>`,
          )
          .join('');
    }
    body += `<p class="credit">Chapters and data from MangaDex. Scanlation groups are credited on each chapter. <a href="${esc(mangaUrl(x.md))}" target="_blank" rel="noopener noreferrer">View on MangaDex ↗</a></p>`;
  } else if (curSrc.startsWith('l')) {
    const i = +curSrc.slice(1);
    const l = x.links[i];
    if (l)
      body = `<div class="pad">
      ${l.resume ? `<button class="btn" data-a="frame" data-i="${i}" data-mode="resume">Resume ch. ${fmt(l.rn || 0)} (saved link)</button>` : ''}
      ${l.tpl ? `<button id="cont" class="btn" data-a="frame" data-i="${i}" data-mode="cont">Continue with ch. ${nextWhole(last)}</button>` : ''}
      <button class="btn${l.tpl || l.resume ? ' ghost' : ''}" data-a="frame" data-i="${i}" data-mode="page">Open the series page in app</button>
      <button class="btn ghost" data-a="paste" data-i="${i}">Update chapter from a link</button>
      <details class="more"><summary>More</summary><div class="pad">
        <p class="hint">Copy a chapter link from the site, then tap Update. InkNexus reads the chapter number and, where the site's links allow it, learns the pattern so Continue works. If the in-app view is blank, the site blocks embedding: use Open in browser.</p>
        <a class="btn ghost" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Open in browser</a>
        <button class="btn danger sm" data-a="rmlink" data-i="${i}">Remove this source</button>
      </div></details></div>`;
  } else body = hint(all.length ? 'All sources are hidden. Bring one back with + Source.' : 'No sources yet. Add one with + Source.');

  app.innerHTML = `<div class="backbar"><button class="ibtn" data-a="sback" aria-label="Back">‹</button></div>
  <div class="top">${cover(x)}
  <div class="info"><h2>${esc(x.title)} <button class="ren" data-a="names" aria-label="Change name">✎</button></h2><div class="sub">Last chapter read</div>
  <div class="step"><button class="ibtn" data-a="dec" aria-label="Previous chapter">−</button><input id="last" type="number" step="any" min="0" aria-label="Last chapter read" value="${last}"><button class="ibtn" data-a="inc" aria-label="Next chapter">+</button></div></div></div>
  ${cta}
  <div class="chips">${vis.map((q) => `<button class="chip${curSrc === q.k ? ' on' : ''}" data-a="src" data-id="${q.k}">${esc(q.n)}</button>`).join('')}<button class="chip" data-a="addsrc">+ Source</button></div>
  ${curSrc ? `<div class="row tight"><button class="btn ghost sm" data-a="hide" data-id="${curSrc}">Hide this source</button></div>` : ''}
  ${body}
  <div class="pad end"><button class="btn danger sm" data-a="rm">Remove from library</button></div>`;
}

/** While the last-chapter field is being typed in, show what Continue and the chapter list would become. Saving waits for the change event. */
export function previewLast(x: Series, last: number) {
  const btn = document.getElementById('cont');
  if (btn) {
    if (curSrc === 'md') {
      const nx = (x.md && cachedChapters(x.md)?.chapters.find((c) => c.num > last)) || null;
      btn.textContent = nx ? `${last ? 'Continue' : 'Start'} with ch. ${fmt(nx.num)}` : 'No later chapter on this source';
    } else btn.textContent = `Continue with ch. ${nextWhole(last)}`;
  }
  document.querySelectorAll<HTMLElement>('.ch[data-n]').forEach((r) => r.classList.toggle('read', parseFloat(r.dataset.n!) <= last));
}

/* ---------- reader ---------- */
export function pageFailed() {
  if (pageFailToasted) return;
  pageFailToasted = true;
  toast('Some pages failed to load. Try another chapter or source.');
}

async function vReader(v: Extract<View, { name: 'reader' }>) {
  const x = find(v.id);
  if (!x?.md) return go({ name: 'library' }, true);
  const tok = ++readerTok;
  pageFailToasted = false;
  app.innerHTML = `<div class="rbar"><button class="ibtn" data-a="back" aria-label="Back to series">‹</button><b>${esc(x.title)} · Ch. ${fmt(v.n)}</b></div><div id="strip">${hint('Loading pages…')}</div>`;
  const st = chapterState(x.md, () => V === v && render());
  if (st.status === 'loading') return;
  const strip = $('#strip');
  if (st.status === 'error') return void (strip.innerHTML = hint(`Could not load this chapter (${esc(st.error)}). Go back and try again.`));
  const chs = st.list.chapters;
  const c = chs.find((k) => k.num === v.n);
  if (!c || c.ext) return void (strip.innerHTML = hint(`Chapter ${fmt(v.n)} can't be read here. Go back and pick another chapter or source.`));
  try {
    const pages = await mdPages(c.id);
    if (tok !== readerTok) return;
    const prev = [...chs].reverse().find((k) => k.num < v.n);
    const next = chs.find((k) => k.num > v.n);
    const credit = `<p class="credit">${c.grp ? `Scanlation by ${esc(c.grp)}` : 'No scanlation group credited'} · via MangaDex. <a href="${esc(chapterUrl(c.id))}" target="_blank" rel="noopener noreferrer">Read on MangaDex ↗</a></p>`;
    strip.innerHTML =
      credit +
      `<div id="zwrap"><div id="pages">${pages.map((u) => `<img src="${esc(u.a)}" data-b="${esc(u.b)}" referrerpolicy="no-referrer" loading="lazy" alt="Page failed to load">`).join('')}</div></div>` +
      `<div id="end" class="endbar">${prev ? `<button class="btn ghost" data-a="read" data-n="${prev.num}">‹ Ch. ${fmt(prev.num)}</button>` : ''}
       ${next ? `<button class="btn" data-a="read" data-n="${next.num}">Ch. ${fmt(next.num)} ›</button>` : `<button class="btn" data-a="back">Back to series</button>`}</div>` +
      credit;
    // Reaching the end of the chapter marks it read.
    const ob = new IntersectionObserver(
      (en) => {
        if (!en[0]?.isIntersecting) return;
        ob.disconnect();
        if (v.n > (x.last || 0)) {
          setLast(x, v.n);
          toast(`Chapter ${fmt(v.n)} marked read`);
        }
      },
      { threshold: 0.6 },
    );
    ob.observe($('#end'));
    teardown.push(() => ob.disconnect(), zoomable($('#zwrap'), $('#pages')));
  } catch (e) {
    if (tok === readerTok) strip.innerHTML = hint(`Could not load this chapter (${esc(why(e))}). Try again, or switch to a different source.`);
  }
}

/* ---------- in-app site view ---------- */
function vFrame(v: Extract<View, { name: 'frame' }>) {
  const x = find(v.id);
  const l = x?.links[v.i];
  if (!x || !l) return go({ name: 'library' }, true);
  const u = v.url || l.url;
  app.innerHTML = `<div class="fview"><div class="rbar"><button class="ibtn" data-a="fback" aria-label="Back to series">‹</button><b>${esc(l.label || host(l.url))}</b>
  ${v.ch && l.tpl ? `<button class="ibtn txt" data-a="fnext" aria-label="Mark read and open next chapter">Next ›</button>` : `<button class="ibtn txt" data-a="finc" aria-label="Mark next chapter read">+1 ch</button>`}
  <button class="ibtn txt" data-a="paste" data-i="${v.i}" aria-label="Update chapter from copied link">Paste</button>
  <a class="ibtn txt" href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="Open in browser">Browser</a></div>
  <iframe class="frame" src="${esc(u)}" sandbox="allow-scripts allow-same-origin allow-forms" referrerpolicy="no-referrer" title="${esc(x.title)}"></iframe></div>`;
}
