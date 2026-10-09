import { useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { LinkFields } from '../components/LinkFields';
import { fmt, norm, parseChUrl } from '../lib/links';
import { addSeries, updateSeries, useStore } from '../lib/store';
import type { SearchResult } from '../lib/types';
import * as mangadex from '../sources/mangadex';
import * as anilist from '../sources/anilist';

const reason = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' && r.reason instanceof Error && r.reason.message) || 'blocked';

export function Search() {
  const { navigate, toast, search, setSearch } = useApp();
  const { lib } = useStore();
  const [q, setQ] = useState(search.q);
  const [status, setStatus] = useState<'idle' | 'busy' | 'failed'>('idle');

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setStatus('busy');
    const [md, al] = await Promise.allSettled([mangadex.search(term), anilist.search(term)]);
    if (md.status === 'rejected' && al.status === 'rejected') {
      setStatus('failed');
      return;
    }
    setStatus('idle');
    setSearch({ q: term, results: [...(md.status === 'fulfilled' ? md.value : []), ...(al.status === 'fulfilled' ? al.value : [])] });
    if (md.status === 'rejected') toast(`MangaDex failed (${reason(md)}). Showing AniList only.`);
    if (al.status === 'rejected') toast(`AniList failed (${reason(al)}). Showing MangaDex only.`);
  };

  const existing = (o: SearchResult) =>
    o.src === 'md' ? lib.find((x) => x.md === o.ref) : lib.find((x) => x.al === o.ref || norm(x.title) === norm(o.title));

  const add = async (o: SearchResult) => {
    const n = addSeries({ title: o.title, cover: o.cover, md: o.src === 'md' ? String(o.ref) : null, al: o.src === 'al' ? o.ref : null, links: o.links || [] });
    let msg = 'Added to library';
    if (o.src === 'al') {
      try {
        const hit = (await mangadex.search(o.title)).find((k) => norm(k.title) === norm(o.title));
        if (hit) {
          updateSeries(n.id, () => ({ md: String(hit.ref) }));
          msg = 'Added. Found it on MangaDex too';
        }
      } catch {
        /* MangaDex is optional here: the series is added with its AniList links either way */
      }
    }
    toast(msg);
    navigate({ name: 'series', id: n.id });
  };

  const onAddByLink = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const raw = String(d.get('url') || '').trim();
    const r = parseChUrl(raw);
    const given = parseFloat(String(d.get('ch') || ''));
    const url = r?.idPrefixed ? r.series : raw;
    const n = addSeries({
      title: String(d.get('title') || '').trim(),
      links: [{ label: String(d.get('label') || '').trim(), url, tpl: r ? r.tpl : '', resume: r ? raw : '', rn: r ? r.num : 0 }],
      last: given || (r ? r.num : 0),
    });
    toast(r && !given ? `Added. Detected chapter ${fmt(r.num)} from the link` : 'Added to library');
    navigate({ name: 'series', id: n.id });
  };

  return (
    <>
      <header>
        <h1>Find</h1>
      </header>
      <form className="row" onSubmit={onSearch}>
        <input id="q" placeholder="Search by title" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <button className="btn">Search</button>
      </form>
      <div id="res">
        {status === 'busy' ? (
          <p className="hint">Searching…</p>
        ) : status === 'failed' ? (
          <p className="hint">Could not reach MangaDex or AniList. Check your connection and try again, or add the series by link.</p>
        ) : !search.results ? (
          <p className="hint">MangaDex gives you a built-in reader. AniList adds official reading links. For any other site, add it by link.</p>
        ) : !search.results.length ? (
          <p className="hint">No matches. Try another spelling, or add it by link below.</p>
        ) : (
          search.results.map((o) => {
            const ex = existing(o);
            return (
              <div className="res" key={`${o.src}:${o.ref}`}>
                <img src={o.cover} loading="lazy" alt="" />
                <div>
                  <b>{o.title}</b>
                  <span className="tag">{o.src === 'md' ? 'MangaDex' : 'AniList'}</span>
                  <p>{o.desc}</p>
                </div>
                <button className="btn sm" onClick={() => (ex ? navigate({ name: 'series', id: ex.id }) : void add(o))}>
                  {ex ? 'Open' : 'Add'}
                </button>
              </div>
            );
          })
        )}
      </div>
      <details className="manual">
        <summary>Add by link</summary>
        <form id="mf" className="stack" onSubmit={onAddByLink}>
          <input name="title" placeholder="Title" required />
          <LinkFields urlPlaceholder="https://…" />
          <input name="ch" type="number" step="any" min="0" placeholder="Chapter you're on (optional if the link has one)" />
          <button className="btn">Add to library</button>
        </form>
      </details>
    </>
  );
}
