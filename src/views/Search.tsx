import { useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { LinkFields } from '../components/LinkFields';
import { ResultRow } from '../components/ResultRow';
import { why } from '../lib/api';
import { fmt, norm } from '../lib/format';
import { linkFrom, NOT_WEB } from '../lib/links';
import { addSeries, updateSeries, useStore } from '../lib/store';
import type { SearchResult } from '../lib/types';
import * as mangadex from '../sources/mangadex';
import * as anilist from '../sources/anilist';

export function Search() {
  const { navigate, toast, search, setSearch } = useApp();
  const { lib } = useStore();
  const [q, setQ] = useState(search.q);
  const [status, setStatus] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [adding, setAdding] = useState(false);

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setStatus('busy');
    const [md, al] = await Promise.allSettled([mangadex.search(term), anilist.search(term)]);
    if (md.status === 'rejected' && al.status === 'rejected') return setStatus('failed');
    setStatus('idle');
    setSearch({ q: term, res: [...(md.status === 'fulfilled' ? md.value : []), ...(al.status === 'fulfilled' ? al.value : [])] });
    if (md.status === 'rejected') toast(`MangaDex failed (${why(md.reason)}). Showing AniList only.`);
    if (al.status === 'rejected') toast(`AniList failed (${why(al.reason)}). Showing MangaDex only.`);
  };

  const existing = (o: SearchResult) => (o.src === 'md' ? lib.find((x) => x.md === o.ref) : lib.find((x) => x.al === o.ref || norm(x.title) === norm(o.title)));

  const add = async (o: SearchResult) => {
    setAdding(true);
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
        // MangaDex is optional here: the series is added with its AniList links either way.
      }
    }
    toast(msg);
    navigate({ name: 'series', id: n.id });
  };

  const onAddByLink = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const field = (k: string) => String(d.get(k) || '').trim();
    const made = linkFrom(field('url'), field('label'));
    if (!made) return toast(NOT_WEB);
    const given = parseFloat(field('ch'));
    const n = addSeries({ title: field('title'), links: [made.link], last: given || made.r?.num || 0 });
    toast(made.r && !given ? `Added. Detected chapter ${fmt(made.r.num)} from the link` : 'Added to library');
    navigate({ name: 'series', id: n.id });
  };

  let results;
  if (status === 'busy') results = <p className="hint">Searching…</p>;
  else if (status === 'failed')
    results = <p className="hint">Could not reach MangaDex or AniList. Check your connection and try again, or add the series by link.</p>;
  else if (!search.res)
    results = <p className="hint">MangaDex gives you a built-in reader. AniList adds official reading links. For any other site, add it by link.</p>;
  else if (!search.res.length) results = <p className="hint">No matches. Try another spelling, or add it by link below.</p>;
  else
    results = search.res.map((o) => {
      const ex = existing(o);
      return (
        <ResultRow
          key={`${o.src}:${o.ref}`}
          o={o}
          extra={
            <>
              <span className="tag">{o.src === 'md' ? 'MangaDex' : 'AniList'}</span>
              <p>{o.desc}</p>
            </>
          }
        >
          {ex ? (
            <button className="btn sm" onClick={() => navigate({ name: 'series', id: ex.id })}>
              Open
            </button>
          ) : (
            <button className="btn sm" disabled={adding} onClick={() => void add(o)}>
              Add
            </button>
          )}
        </ResultRow>
      );
    });

  return (
    <>
      <header>
        <h1>Find</h1>
      </header>
      <form className="row" role="search" onSubmit={onSearch}>
        <input id="q" aria-label="Search by title" placeholder="Search by title" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <button className="btn">Search</button>
      </form>
      <div id="res">{results}</div>
      <details className="manual">
        <summary>Add by link</summary>
        <form className="stack" onSubmit={onAddByLink}>
          <input name="title" aria-label="Title" placeholder="Title" required />
          <LinkFields urlPlaceholder="https://…" />
          <input name="ch" type="number" step="any" min="0" aria-label="Chapter you're on" placeholder="Chapter you're on (optional if the link has one)" />
          <button className="btn">Add to library</button>
        </form>
      </details>
    </>
  );
}
