import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AppContext, type AppApi, type SearchState, type View } from './context';
import { ImportSheet } from './components/ImportSheet';
import { chaptersDiffer, mergeImport, planImport, type Duplicate } from './lib/importBackup';
import { showsReadingUpdates } from './lib/readingUpdates';
import { preloadBrowse } from './lib/searchResults';
import { parseBackup } from './lib/storage';
import { findSeries, getState, replaceState, useStore } from './lib/store';
import { catchSwipes } from './lib/swipe';
import type { Series as SeriesT } from './lib/types';
import { hasWebtoonList, importWebtoon, openWebtoonInBrowser } from './lib/webtoon';
import { Library } from './views/Library';
import { Search } from './views/Search';
import { Details } from './views/Details';
import { Series } from './views/Series';
import { Reader } from './views/Reader';
import { Frame } from './views/Frame';

// Views live in browser history as { v, back }, so the phone's back gesture moves through the app.
// `back` says there is an in-app view behind this one.
const NAMES = ['library', 'search', 'details', 'series', 'reader', 'frame'];

function viewOf(st: unknown): View | null {
  const v = (st as { v?: View } | null)?.v;
  return v && NAMES.includes(v.name) ? v : null;
}

function hasBack(): boolean {
  return !!(history.state as { back?: boolean } | null)?.back;
}

/** The series a view shows, or undefined when it is gone (removed, or its MangaDex source or link is). */
function seriesFor(view: View): SeriesT | undefined {
  if (!('id' in view)) return undefined;
  const x = findSeries(view.id);
  if (view.name === 'reader' && !x?.md) return undefined;
  if (view.name === 'frame' && !x?.links[view.i]) return undefined;
  return x;
}

export function App() {
  const [view, setView] = useState<View>(() => viewOf(history.state) || { name: 'library' });
  const [search, setSearch] = useState<SearchState>({ q: '', res: null, tag: null, sort: 'follows', filter: {} });
  const [message, setMessage] = useState({ text: '', on: false });
  const [importing, setImporting] = useState<ReturnType<typeof planImport> | null>(null);
  const toastTimer = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  useStore(); // re-render when the library changes
  const x = seriesFor(view);
  const gone = 'id' in view && !x;

  useEffect(() => {
    // The app places every view itself. Left to the browser, going back could scroll the reader, which is still showing,
    // to where the previous view was, down to the end of the chapter, and mark it read.
    history.scrollRestoration = 'manual';
    history.replaceState({ v: view, back: hasBack() }, '');
    const pop = (e: PopStateEvent) => setView(viewOf(e.state) || { name: 'library' });
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
    // Only on mount: this records the first view in history; later views are recorded by navigate().
  }, []);

  // The bookmarklet opens the app with a Webtoon list in the address; import it once and take it out of the address.
  useEffect(() => {
    if (!hasWebtoonList(location.hash)) return;
    const list = location.hash;
    history.replaceState(history.state, '', location.pathname + location.search);
    importWebtoon(list, toast);
  }, []);

  // Only on opening the app, so the Search tab opens on its results.
  useEffect(() => preloadBrowse(search.tag, search.sort), []);

  // Braces matter: newer Chrome returns a Promise from scrollTo, and React would call it as the cleanup.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const full = view.name === 'reader' || view.name === 'frame';
  // A series' page and a Browse result cover the bottom bar, like a page opened from a list in a native app.
  const info = view.name === 'series' || view.name === 'details';
  useEffect(() => void document.body.classList.toggle('nonav', full), [full]);
  useEffect(() => void document.body.classList.toggle('info', info), [info]);
  // The reader and the site view have their own touches.
  useEffect(() => (full ? undefined : catchSwipes()), [full]);

  const navigate = useCallback((v: View, replace = false) => {
    if (replace) history.replaceState({ v, back: hasBack() }, '');
    else history.pushState({ v, back: true }, '');
    setView(v);
  }, []);

  useEffect(() => {
    if (gone) navigate({ name: 'library' }, true);
  }, [gone, navigate]);

  // history.back() would first step back through the pages a site in the site view went to, one at a time.
  // navigation.back() skips those and goes to the app's previous view; older browsers without it use history.back().
  const goBack = useCallback(
    (fallback: View) => {
      if (!hasBack()) navigate(fallback, true);
      else if (window.navigation) navigation.back();
      else history.back();
    },
    [navigate],
  );

  const toast = useCallback((text: string, update = false) => {
    if (update && !showsReadingUpdates()) return;
    setMessage({ text, on: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setMessage((m) => ({ ...m, on: false })), 3200);
  }, []);

  const api: AppApi = useMemo(
    () => ({ navigate, goBack, toast, importBackup: () => fileRef.current?.click(), search, setSearch }),
    [navigate, goBack, toast, search],
  );

  // New series are added; duplicates are merged, taking the backup's reading progress only where chosen.
  const finishImport = (plan: ReturnType<typeof planImport>, fromBackup: Duplicate[]) => {
    const lib = getState().lib;
    const next = mergeImport(lib, plan.fresh, plan.dupes, fromBackup);
    replaceState({ ...getState(), lib: next });
    openWebtoonInBrowser(next.flatMap((x) => x.links));
    const updated = lib.filter((x, i) => JSON.stringify(x) !== JSON.stringify(next[i])).length;
    const parts = [plan.fresh.length && `${plan.fresh.length} added`, updated && `${updated} updated`].filter(Boolean);
    toast(parts.length ? `Backup imported: ${parts.join(', ')}` : 'Backup imported. Nothing changed');
  };

  const onImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file
      .text()
      .then(parseBackup)
      .then((next) => {
        const plan = planImport(getState().lib, next.lib);
        if (plan.dupes.some(chaptersDiffer)) setImporting(plan);
        else finishImport(plan, []);
      })
      .catch(() => toast('That file is not an InkNexus backup'));
  };

  const tab = view.name === 'search' || view.name === 'details' ? 'search' : 'library';
  // My Series and Browse stay mounted once opened, hidden under the other views, so coming back to one shows its covers
  // at once instead of making each cover load again, a gray box and then the image. The reader and the site view let
  // them go, so a hidden My Series never checks for new chapters while a chapter loads.
  const [kept, setKept] = useState<(typeof tab)[]>([]);
  const keep: typeof kept = full ? [] : kept.includes(tab) ? kept : [...kept, tab];
  if (keep.length !== kept.length) setKept(keep);
  return (
    <AppContext.Provider value={api}>
      <div id="app">
        {kept.includes('library') && (
          <div hidden={view.name !== 'library'}>
            <Library />
          </div>
        )}
        {kept.includes('search') && (
          <div hidden={view.name !== 'search'}>
            <Search on={view.name === 'search'} />
          </div>
        )}
        {view.name === 'details' && <Details key={`${view.o.src}:${view.o.ref}`} o={view.o} />}
        {x && view.name === 'series' && <Series key={x.id} x={x} />}
        {x && view.name === 'reader' && <Reader key={`${x.id}:${view.n}`} x={x} n={view.n} />}
        {x && view.name === 'frame' && <Frame key={`${x.id}:${view.i}:${view.url}`} x={x} view={view} />}
      </div>
      <nav id="nav" hidden={full || info}>
        <button aria-current={tab === 'library' || undefined} onClick={() => view.name !== 'library' && navigate({ name: 'library' })}>
          {/* a comic book: cover, spine, and a speech bubble */}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="2.5" width="16" height="19" rx="2" />
            <path d="M8 2.5v19" />
            <path d="M14 6.5c2.2 0 3.5 1.3 3.5 3s-1.3 3-3.5 3c-.4 0-.8 0-1.2-.1L11 13.5l.4-2c-.6-.5-.9-1.2-.9-2 0-1.7 1.3-3 3.5-3z" />
          </svg>
          My Series
        </button>
        <button aria-current={tab === 'search' || undefined} onClick={() => view.name !== 'search' && navigate({ name: 'search' })}>
          {/* a compass */}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="m15.5 8.5-2 5-5 2 2-5z" />
          </svg>
          Browse
        </button>
      </nav>
      <div id="toast" role="status" className={message.on ? 'on' : ''}>
        {message.text}
      </div>
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImport} />
      {importing && (
        <ImportSheet
          dupes={importing.dupes.filter(chaptersDiffer)}
          added={importing.fresh.length}
          onImport={(fromBackup) => finishImport(importing, fromBackup)}
          onClose={() => setImporting(null)}
        />
      )}
    </AppContext.Provider>
  );
}
