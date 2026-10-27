import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { AddByLinkSheet } from '../components/AddByLinkSheet';
import { ResultRow } from '../components/ResultRow';
import { why } from '../lib/api';
import { isWebUrl } from '../lib/links';
import * as mangadex from '../sources/mangadex';
import * as anilist from '../sources/anilist';

const SORTS: [mangadex.BrowseSort, string][] = [
  ['follows', 'Most followed'],
  ['latest', 'Latest upload'],
];

/** Where Browse was scrolled to, so coming back from a series' details lands on the same spot. */
let scrolled = 0;

export function Search() {
  const { navigate, toast, search, setSearch } = useApp();
  const [q, setQ] = useState(search.q);
  const [status, setStatus] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  // Counts loads, so only the newest one shows when taps overlap.
  const seq = useRef(0);
  const browsing = !search.q;
  const pasted = isWebUrl(q.trim());

  const browse = async (tag: string | null, sort: mangadex.BrowseSort) => {
    const id = ++seq.current;
    setQ('');
    setSearch({ q: '', res: null, tag, sort });
    setStatus('busy');
    try {
      const res = await mangadex.browse(tag, sort);
      if (id !== seq.current) return;
      setSearch({ q: '', res, tag, sort });
      setStatus('idle');
    } catch (e) {
      if (id !== seq.current) return;
      setError(why(e));
      setStatus('failed');
    }
  };

  useEffect(() => {
    if (!search.res) void browse(search.tag, search.sort);
    // Only on opening Search: results kept from before are shown as they are.
  }, []);

  useEffect(() => {
    // App puts every view at the top; results kept from before go back to where they were.
    if (search.res) window.scrollTo(0, scrolled);
    const keep = () => (scrolled = window.scrollY);
    addEventListener('scroll', keep, { passive: true });
    return () => removeEventListener('scroll', keep);
  }, []);

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    // A link is not a title: it opens Add by link instead of a search.
    if (pasted) return setLinkOpen(true);
    const id = ++seq.current;
    setSearch({ ...search, q: term, res: null });
    setStatus('busy');
    const [md, al] = await Promise.allSettled([mangadex.search(term), anilist.search(term)]);
    if (id !== seq.current) return;
    if (md.status === 'rejected' && al.status === 'rejected') return setStatus('failed');
    setStatus('idle');
    setSearch({ ...search, q: term, res: [...(md.status === 'fulfilled' ? md.value : []), ...(al.status === 'fulfilled' ? al.value : [])] });
    if (md.status === 'rejected') toast(`MangaDex failed (${why(md.reason)}). Showing AniList only.`);
    if (al.status === 'rejected') toast(`AniList failed (${why(al.reason)}). Showing MangaDex only.`);
  };

  let results;
  if (status === 'busy') results = <p className="hint">{browsing ? 'Loading…' : 'Searching…'}</p>;
  else if (status === 'failed')
    results = (
      <p className="hint">
        {browsing
          ? `Could not load MangaDex (${error}). Tap a genre to try again, or search by title.`
          : 'Could not reach MangaDex or AniList. Check your connection and try again, or add the series by link.'}
      </p>
    );
  else if (!search.res) results = null;
  else if (!search.res.length)
    results = <p className="hint">{browsing ? 'Nothing in this genre yet.' : 'No matches. Try another spelling, or add it by link.'}</p>;
  else
    results = search.res.map((o) => (
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
        <button className="ibtn plain" aria-label={`More about ${o.title}`} onClick={() => navigate({ name: 'details', o })}>
          ›
        </button>
      </ResultRow>
    ));

  return (
    <>
      <header>
        <h1>Browse</h1>
      </header>
      <form className="row" role="search" onSubmit={onSearch}>
        <div className="field">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m15.5 15.5 5 5" />
          </svg>
          <input
            id="q"
            type="search"
            enterKeyHint="search"
            aria-label="Search by title"
            placeholder="Search by title"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              // Clearing the field goes back to browsing.
              if (!e.target.value && !browsing) void browse(search.tag, search.sort);
            }}
            autoComplete="off"
          />
        </div>
      </form>
      {pasted && (
        <div className="row">
          <button className="btn ghost" aria-expanded={linkOpen} onClick={() => setLinkOpen(true)}>
            Add the series from this link
          </button>
        </div>
      )}
      {browsing && (
        <div className="seg" role="group" aria-label="Sort by">
          {SORTS.map(([sort, name]) => (
            <button key={sort} aria-pressed={search.sort === sort} onClick={() => void browse(search.tag, sort)}>
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="chips" role="group" aria-label="Genre">
        {[{ id: null, name: 'All' }, ...mangadex.GENRES].map((g) => {
          const on = browsing && search.tag === g.id;
          return (
            <button key={g.name} className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => void browse(g.id, search.sort)}>
              {g.name}
            </button>
          );
        })}
      </div>
      <div id="res">{results}</div>
      {!browsing && (status === 'failed' || search.res?.length === 0) && (
        <div className="row">
          <button className="btn ghost" aria-expanded={linkOpen} onClick={() => setLinkOpen(true)}>
            Add by link
          </button>
        </div>
      )}
      {linkOpen && <AddByLinkSheet url={pasted ? q.trim() : undefined} onClose={() => setLinkOpen(false)} />}
    </>
  );
}
