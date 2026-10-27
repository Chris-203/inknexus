import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { LinkFields } from '../components/LinkFields';
import { ResultRow } from '../components/ResultRow';
import { Sheet, useSheet } from '../components/Sheet';
import { why } from '../lib/api';
import { fmt } from '../lib/format';
import { linkFrom, NOT_WEB } from '../lib/links';
import { addSeries } from '../lib/store';
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
        <button className="ibtn" aria-label={`More about ${o.title}`} onClick={() => navigate({ name: 'details', o })}>
          ›
        </button>
      </ResultRow>
    ));

  return (
    <>
      <header>
        <h1>Browse</h1>
        <button className="btn ghost sm" aria-expanded={linkOpen} onClick={() => setLinkOpen(true)}>
          Add by link
        </button>
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
      {linkOpen && <AddByLinkSheet onClose={() => setLinkOpen(false)} />}
    </>
  );
}

/** Add a series from any other site by its link, opened from the Browse header. */
function AddByLinkSheet({ onClose }: { onClose: () => void }) {
  const { navigate, toast } = useApp();
  const sheet = useSheet(onClose);

  const onAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const field = (k: string) => String(d.get(k) || '').trim();
    const made = linkFrom(field('url'), field('label'));
    if (!made) return toast(NOT_WEB);
    const given = parseFloat(field('ch'));
    const n = addSeries({ title: field('title'), links: [made.link], last: given || made.r?.num || 0 });
    toast(made.r && !given ? `Added. Detected chapter ${fmt(made.r.num)} from the link` : 'Added to My Series');
    navigate({ name: 'series', id: n.id });
  };

  return (
    <Sheet label="Add by link" sheet={sheet}>
      <h2>Add by link</h2>
      <p className="hint">For any site besides MangaDex and AniList: paste a series or chapter link.</p>
      <form className="stack" onSubmit={onAdd}>
        <input name="title" aria-label="Title" placeholder="Title" required />
        <LinkFields urlPlaceholder="https://…" />
        <input name="ch" type="number" step="any" min="0" aria-label="Chapter you're on" placeholder="Chapter you're on (optional if the link has one)" />
        <button className="btn">Add to My Series</button>
      </form>
      <button className="btn ghost" onClick={sheet.close}>
        Close
      </button>
    </Sheet>
  );
}
