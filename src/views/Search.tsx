import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp, type SearchState } from '../context';
import { AddByLinkSheet } from '../components/AddByLinkSheet';
import { ResultRow } from '../components/ResultRow';
import { why } from '../lib/api';
import { isWebUrl } from '../lib/links';
import { browseKey, isFresh, loadBrowse, loadSearch, savedResults, searchKey, type Sort } from '../lib/searchResults';
import type { SearchResult } from '../lib/types';
import * as mangadex from '../sources/mangadex';

const SORTS: [Sort, string][] = [
  ['follows', 'Most followed'],
  ['latest', 'Latest upload'],
  ['trending', 'Trending'],
];

/** Where Browse was scrolled to, so coming back from a series' details lands on the same spot. */
let scrolled = 0;

/** `on` is false while Search stays mounted under another view. */
export function Search({ on }: { on: boolean }) {
  const { navigate, toast, search, setSearch } = useApp();
  const [q, setQ] = useState(search.q);
  const [status, setStatus] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  // Counts loads, so only the newest one shows when taps overlap.
  const seq = useRef(0);
  const browsing = !search.q;
  const pasted = isWebUrl(q.trim());

  /** Show the results saved under `key` at once, or "Loading…" without them, then load them unless they are fresh enough to keep. */
  const show = async (key: string, next: Omit<SearchState, 'res'>, load: () => Promise<SearchResult[]>) => {
    const id = ++seq.current;
    const saved = savedResults(key);
    setSearch({ ...next, res: saved ?? null });
    setStatus(saved ? 'idle' : 'busy');
    if (saved && isFresh(key)) return;
    try {
      const res = await load();
      if (id !== seq.current) return;
      setSearch({ ...next, res });
      setStatus('idle');
    } catch (e) {
      if (id !== seq.current) return;
      // A failed reload keeps the results already shown.
      if (saved) return toast(`Could not reload MangaDex (${why(e)}). Showing results from earlier.`);
      setError(why(e));
      setStatus('failed');
    }
  };

  const browse = (tag: string | null, sort: Sort, filter = search.filter) => {
    setQ('');
    return show(browseKey(tag, sort, filter), { q: '', tag, sort, filter }, () => loadBrowse(tag, sort, filter));
  };

  useEffect(() => {
    if (!search.res) void browse(search.tag, search.sort);
    // Only on opening Search: results kept from before are shown as they are.
  }, []);

  useEffect(() => {
    if (!on) return;
    // App puts every view at the top; results kept from before go back to where they were.
    if (search.res) window.scrollTo(0, scrolled);
    const keep = () => (scrolled = window.scrollY);
    addEventListener('scroll', keep, { passive: true });
    return () => removeEventListener('scroll', keep);
  }, [on]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    // A link is not a title: it opens Add by link instead of a search.
    if (pasted) return setLinkOpen(true);
    void show(searchKey(term), { ...search, q: term }, () => loadSearch(term));
  };

  let results;
  if (status === 'busy') results = <p className="hint">{browsing ? 'Loading…' : 'Searching…'}</p>;
  else if (status === 'failed')
    results = (
      <p className="hint">
        {browsing
          ? `Could not load MangaDex (${error}). Tap a genre to try again, or search by title.`
          : `Could not search MangaDex (${error}). Check your connection and try again, or add the series by link.`}
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
            {o.status && <span className="tag">{o.status}</span>}
            {o.score && (
              <span className="tag" role="img" aria-label={`AniList score ${o.score}%`}>
                ★ {o.score}%
              </span>
            )}
            <p>{o.desc}</p>
          </>
        }
      >
        <button className="ibtn plain whole" aria-label={`More about ${o.title}`} onClick={() => navigate({ name: 'details', o })}>
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
            <button key={sort} aria-pressed={search.sort === sort} onClick={() => void browse(sort === 'trending' ? null : search.tag, sort)}>
              {name}
            </button>
          ))}
        </div>
      )}
      {browsing && (
        <div className="chips" role="group" aria-label="Type">
          {mangadex.ORIGINS.map((o) => {
            const on = search.filter.origin === o.id;
            return (
              <button
                key={o.id}
                className={`chip${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => void browse(search.tag, search.sort, { ...search.filter, origin: on ? undefined : o.id })}
              >
                {o.name}
              </button>
            );
          })}
        </div>
      )}
      {/* Trending is for every genre, so picking a genre from it shows that genre's most followed. */}
      <div className="chips" role="group" aria-label="Genre">
        {[{ id: null, name: 'All' }, ...mangadex.GENRES].map((g) => {
          const on = browsing && search.tag === g.id;
          return (
            <button
              key={g.name}
              className={`chip${on ? ' on' : ''}`}
              aria-pressed={on}
              onClick={() => void browse(g.id, g.id && search.sort === 'trending' ? 'follows' : search.sort)}
            >
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
