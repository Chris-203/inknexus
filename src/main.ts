import './styles.css';
import { why } from './lib/api';
import { cachedChapters, forgetError } from './lib/chapters';
import { fmt, linkFrom, nextWhole, norm, parseChUrl, PRESETS, stepChapter } from './lib/links';
import { langName, type Name } from './lib/names';
import { parseBackup } from './lib/storage';
import type { SearchResult, Series } from './lib/types';
import { checkUpdates } from './lib/updates';
import * as anilist from './sources/anilist';
import * as mangadex from './sources/mangadex';
import { addSeries, find, removeSeries, replaceState, S, save, setHidden, setLast, sourcesOf } from './state';
import { $, closeSheet, esc, hint, openSheet, toast } from './ui';
import { go, goBack, onPop, pageFailed, presetHtml, previewLast, render, resList, resRow, search, V } from './views';

/** Results shown in the add-source sheet, and names in the rename sheet. */
let picks: SearchResult[] = [];
let names: Name[] = [];

const current = (): Series | undefined => ('id' in V ? find(V.id) : undefined);
const NOT_WEB = 'That is not a web link. Paste a link that starts with https://';

/** Read a chapter link from the clipboard (or a prompt), set the chapter from it, and teach link source `i` its URL pattern. */
async function pasteLink(x: Series, i: number) {
  let t = '';
  try {
    t = await navigator.clipboard.readText();
  } catch {
    t = prompt('Paste the chapter link') || '';
  }
  t = t.trim();
  const r = parseChUrl(t);
  if (!r) return toast('No chapter number found. Copy a chapter link first.');
  const l = x.links[i];
  if (l) Object.assign(l, { tpl: r.tpl, resume: t, rn: r.num }, r.idPrefixed ? { url: r.series } : {});
  setLast(x, r.num);
  toast(`Now on chapter ${fmt(r.num)}`);
  if (V.name !== 'frame') render();
}

function addSourceSheet(x: Series) {
  const hid = sourcesOf(x).filter((q) => q.h);
  openSheet(`<h2>Add a source</h2>
    ${hid.length ? hint('Hidden sources') + hid.map((q) => `<button class="btn ghost" data-a="unhide" data-id="${q.k}">Show ${esc(q.n)}</button>`).join('') + hint('Or add a new one') : ''}
    ${!x.md ? `<button class="btn" data-a="findmd">Find it on MangaDex</button>` : ''}
    <button class="btn ghost" data-a="findal">Find official links (AniList)</button><div id="mres"></div>
    <form id="lf" class="stack">${presetHtml()}<input name="label" aria-label="Site name" placeholder="Site name (optional)"><input name="url" type="url" aria-label="Link" required placeholder="Series or chapter link"><button class="btn">Save link</button></form>
    <button class="btn ghost" data-a="close">Close</button>`);
}

async function namesSheet(x: Series) {
  openSheet(`<h2>Change name</h2><div id="nres">${x.md ? hint('Loading names from MangaDex…') : ''}</div>
    <form id="nf" class="stack"><input name="title" value="${esc(x.title)}" required aria-label="Name"><button class="btn">Save this name</button></form>
    <button class="btn ghost" data-a="close">Close</button>`);
  if (!x.md) return;
  let html: string;
  try {
    names = await mangadex.names(x.md);
    html = names.length
      ? hint('Pick a name, or type your own below.') +
        names.map((o, i) => `<button class="ch" data-a="pickname" data-i="${i}"><b class="nm">${esc(o.n)}${o.n === x.title ? ' ✓' : ''}</b><span>${esc(langName(o.l))}</span></button>`).join('')
      : hint('MangaDex lists no other names. Type your own below.');
  } catch (e) {
    html = hint(`Could not load names from MangaDex (${esc(why(e))}). Type a name below, or try again later.`);
  }
  const box = document.getElementById('nres');
  if (box) box.innerHTML = html;
}

async function findIn(x: Series, kind: 'md' | 'al') {
  const box = $('#mres');
  const site = kind === 'md' ? 'MangaDex' : 'AniList';
  box.innerHTML = hint('Searching…');
  try {
    picks = await (kind === 'md' ? mangadex.search(x.title) : anilist.search(x.title));
    box.innerHTML = picks.length
      ? picks
          .map((o, i) => {
            const n = o.links?.length || 0;
            return resRow(o, kind === 'al' ? `<p>${n} official link${n === 1 ? '' : 's'}</p>` : '', `<button class="btn sm" data-a="pick${kind}" data-i="${i}">Use</button>`);
          })
          .join('')
      : hint(`No match on ${site}.`);
  } catch (e) {
    box.innerHTML = hint(`Could not reach ${site} (${esc(why(e))}).`);
  }
}

function exportBackup() {
  const u = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = u;
  a.download = 'inknexus-backup.json';
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking right away can cancel the download on iOS Safari.
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

/* ---------- clicks ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t.id === 'modal') return closeSheet();
  const b = t.closest<HTMLElement>('[data-a]');
  if (!b) return;
  const a = b.dataset.a!;
  const id = b.dataset.id || '';
  const i = +(b.dataset.i || 0);
  const x = current();

  if (a === 'tab') {
    if (V.name !== id) go({ name: id as 'library' | 'search' });
  } else if (a === 'series') go({ name: 'series', id });
  else if (a === 'export') exportBackup();
  else if (a === 'import') $('#imp').click();
  else if (a === 'recheck') {
    checkUpdates(S.lib, true, () => V.name === 'library' && render());
    render();
  }
  else if (a === 'close') closeSheet();
  else if (a === 'add') {
    const o = search.res?.[i];
    if (!o) return;
    b.setAttribute('disabled', '');
    const n = addSeries({ title: o.title, cover: o.cover, md: o.src === 'md' ? String(o.ref) : null, al: o.src === 'al' ? o.ref : null, links: o.links || [] });
    let msg = 'Added to library';
    if (o.src === 'al') {
      try {
        const hit = (await mangadex.search(o.title)).find((k) => norm(k.title) === norm(o.title));
        if (hit) {
          n.md = String(hit.ref);
          save();
          msg = 'Added. Found it on MangaDex too';
        }
      } catch {
        /* MangaDex is optional here: the series is added with its AniList links either way */
      }
    }
    toast(msg);
    go({ name: 'series', id: n.id });
  } else if (a === 'preset') {
    const [name, addr] = PRESETS[i]!;
    const f = b.closest('form')!;
    const url = f.querySelector<HTMLInputElement>('[name=url]')!;
    f.querySelector<HTMLInputElement>('[name=label]')!.value = name;
    // Fill the address unless a real link was already pasted.
    if (!url.value.trim() || PRESETS.some((p) => p[1] === url.value.trim())) {
      url.value = addr;
      url.focus();
    }
  }
  if (!x) return;

  /* ---------- actions on the current series ---------- */
  if (a === 'sback') goBack({ name: 'library' });
  else if (a === 'back') goBack({ name: 'series', id: x.id });
  else if (a === 'fback') goBack({ name: 'series', id: x.id });
  else if (a === 'src') {
    x.src = id;
    save();
    render();
  } else if (a === 'hide') {
    setHidden(x, id, true);
    x.src = '';
    save();
    toast('Hidden. Bring it back from + Source');
    render();
  } else if (a === 'unhide') {
    setHidden(x, id, false);
    x.src = id;
    save();
    closeSheet();
    render();
  } else if (a === 'inc' || a === 'dec') {
    setLast(x, stepChapter(x.last || 0, a === 'inc' ? 1 : -1));
    render();
  } else if (a === 'sort') {
    S.sort = S.sort === 'asc' ? 'desc' : 'asc';
    save();
    render();
  } else if (a === 'retrych') {
    forgetError(x.md!);
    render();
  } else if (a === 'read') {
    const chs = (x.md && cachedChapters(x.md)?.chapters) || [];
    let n = parseFloat(b.dataset.n || '');
    if (b.dataset.cont) {
      const nx = chs.find((c) => c.num > (x.last || 0));
      if (!nx) return toast('No later chapter on this source');
      n = nx.num;
    }
    const c = chs.find((k) => k.num === n);
    if (c?.ext) {
      window.open(c.ext, '_blank', 'noopener');
      return toast(`Chapter ${fmt(n)} opens on the official site`);
    }
    go({ name: 'reader', id: x.id, n }, V.name === 'reader');
  } else if (a === 'frame') {
    const l = x.links[i];
    if (!l) return;
    const mode = b.dataset.mode;
    const n = mode === 'cont' ? nextWhole(x.last || 0) : mode === 'resume' ? l.rn || 0 : 0;
    const url = mode === 'resume' ? l.resume || '' : n && l.tpl ? l.tpl.replace('{n}', String(n)) : '';
    go({ name: 'frame', id: x.id, i, ch: n, url });
  } else if (a === 'fnext' && V.name === 'frame') {
    const l = x.links[V.i];
    if (!l?.tpl) return;
    const n = V.ch + 1;
    setLast(x, Math.max(x.last || 0, V.ch));
    toast(`Chapter ${fmt(V.ch)} marked read`);
    go({ ...V, ch: n, url: l.tpl.replace('{n}', String(n)) }, true);
  } else if (a === 'finc') {
    setLast(x, nextWhole(x.last || 0));
    toast(`Now on chapter ${fmt(x.last)}`);
  } else if (a === 'paste') await pasteLink(x, i);
  else if (a === 'rm') {
    if (confirm('Remove this series from your library?')) {
      removeSeries(x.id);
      go({ name: 'library' }, true);
    }
  } else if (a === 'rmlink') {
    x.links.splice(i, 1);
    x.src = '';
    save();
    render();
  } else if (a === 'addsrc') addSourceSheet(x);
  else if (a === 'names') await namesSheet(x);
  else if (a === 'pickname') {
    x.title = names[i]!.n;
    save();
    closeSheet();
    render();
    toast('Name changed');
  } else if (a === 'findmd' || a === 'findal') await findIn(x, a === 'findmd' ? 'md' : 'al');
  else if (a === 'pickmd') {
    const o = picks[i]!;
    Object.assign(x, { md: String(o.ref), mdh: false, src: 'md', cover: x.cover || o.cover });
    save();
    closeSheet();
    render();
  } else if (a === 'pickal') {
    const o = picks[i]!;
    const fresh = (o.links || []).filter((l) => !x.links.some((k) => k.url === l.url));
    Object.assign(x, { al: o.ref, cover: x.cover || o.cover });
    x.links.push(...fresh);
    save();
    closeSheet();
    toast(fresh.length ? `Added ${fresh.length} official link${fresh.length === 1 ? '' : 's'}` : 'No official links listed for this one');
    render();
  }
});

/* ---------- forms ---------- */
document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target as HTMLFormElement;
  const d = new FormData(f);
  const field = (k: string) => String(d.get(k) || '').trim();
  if (f.id === 'sf') {
    const q = $<HTMLInputElement>('#q').value.trim();
    if (!q) return;
    search.q = q;
    $('#res').innerHTML = hint('Searching…');
    const [md, al] = await Promise.allSettled([mangadex.search(q), anilist.search(q)]);
    search.res = md.status === 'rejected' && al.status === 'rejected' ? null : [...(md.status === 'fulfilled' ? md.value : []), ...(al.status === 'fulfilled' ? al.value : [])];
    if (V.name !== 'search') return;
    if (!search.res) return void ($('#res').innerHTML = hint('Could not reach MangaDex or AniList. Check your connection and try again, or add the series by link.'));
    $('#res').innerHTML = resList(search.res);
    if (md.status === 'rejected') toast(`MangaDex failed (${why(md.reason)}). Showing AniList only.`);
    if (al.status === 'rejected') toast(`AniList failed (${why(al.reason)}). Showing MangaDex only.`);
  } else if (f.id === 'mf') {
    const made = linkFrom(field('url'), field('label'));
    if (!made) return toast(NOT_WEB);
    const given = parseFloat(field('ch'));
    const n = addSeries({ title: field('title'), links: [made.link], last: given || made.r?.num || 0 });
    toast(made.r && !given ? `Added. Detected chapter ${fmt(made.r.num)} from the link` : 'Added to library');
    go({ name: 'series', id: n.id });
  } else if (f.id === 'nf') {
    const x = current();
    const t = field('title');
    if (!x || !t) return;
    x.title = t;
    save();
    closeSheet();
    render();
    toast('Name changed');
  } else if (f.id === 'lf') {
    const x = current();
    const made = linkFrom(field('url'), field('label'));
    if (!x) return;
    if (!made) return toast(NOT_WEB);
    x.links.push(made.link);
    x.src = 'l' + (x.links.length - 1);
    if (made.r && made.r.num > (x.last || 0)) {
      setLast(x, made.r.num);
      toast(`Detected chapter ${fmt(made.r.num)} from the link`);
    }
    save();
    closeSheet();
    render();
  }
});

/* ---------- last-chapter field and backup import ---------- */
document.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  const x = current();
  if (t.id === 'last' && x) previewLast(x, parseFloat(t.value) || 0);
});
document.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  const x = current();
  if (t.id === 'last' && x) {
    const n = parseFloat(t.value);
    // An emptied field keeps the saved chapter instead of resetting it to 0.
    if (isNaN(n)) {
      t.value = String(x.last || 0);
      return previewLast(x, x.last || 0);
    }
    setLast(x, n);
    render();
  } else if (t.id === 'imp') {
    const file = t.files?.[0];
    t.value = '';
    if (!file) return;
    file
      .text()
      .then(parseBackup)
      .then((next) => {
        if (S.lib.length && !confirm(`Replace your library (${S.lib.length} series) with this backup (${next.lib.length} series)?`)) return;
        replaceState(next);
        render();
        toast('Backup imported');
      })
      .catch(() => toast('That file is not an InkNexus backup'));
  }
});

/* ---------- reader images: data-saver first, full quality once, then say so ---------- */
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.closest('#pages')) return;
    if (!img.dataset.t && img.dataset.b) {
      img.dataset.t = '1';
      img.src = img.dataset.b;
    } else pageFailed();
  },
  true,
);

document.addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());
addEventListener('popstate', (e) => {
  closeSheet();
  onPop(e.state);
});

try {
  void navigator.storage?.persist?.();
} catch {
  /* not supported: the library still saves, the browser may just clear it under storage pressure */
}

render();
