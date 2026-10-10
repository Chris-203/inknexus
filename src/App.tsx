import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AppContext, type AppApi, type SearchState, type View } from './context';
import { parseBackup } from './lib/storage';
import { getState, replaceState } from './lib/store';
import { Library } from './views/Library';
import { Search } from './views/Search';
import { Series } from './views/Series';
import { Reader } from './views/Reader';
import { Frame } from './views/Frame';

/* Views live in browser history as { v, back }, so the phone's back gesture moves through the app.
   `back` says there is an in-app view behind this one. */
const NAMES = ['library', 'search', 'series', 'reader', 'frame'];
const viewOf = (st: unknown): View | null => {
  const v = (st as { v?: View } | null)?.v;
  return v && NAMES.includes(v.name) ? v : null;
};
const hasBack = () => !!(history.state as { back?: boolean } | null)?.back;

export function App() {
  const [view, setView] = useState<View>(() => viewOf(history.state) || { name: 'library' });
  const [search, setSearch] = useState<SearchState>({ q: '', res: null });
  const [message, setMessage] = useState({ text: '', on: false });
  const toastTimer = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    history.replaceState({ v: view, back: hasBack() }, '');
    const pop = (e: PopStateEvent) => setView(viewOf(e.state) || { name: 'library' });
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
    // Only on mount: this records the first view in history; later views are recorded by navigate().
  }, []);

  useLayoutEffect(() => window.scrollTo(0, 0), [view]);
  const full = view.name === 'reader' || view.name === 'frame';
  useEffect(() => void document.body.classList.toggle('nonav', full), [full]);

  const navigate = useCallback((v: View, replace = false) => {
    if (replace) history.replaceState({ v, back: hasBack() }, '');
    else history.pushState({ v, back: true }, '');
    setView(v);
  }, []);

  const goBack = useCallback(
    (fallback: View) => {
      if (hasBack()) history.back();
      else navigate(fallback, true);
    },
    [navigate],
  );

  const toast = useCallback((text: string) => {
    setMessage({ text, on: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setMessage((m) => ({ ...m, on: false })), 3200);
  }, []);

  const api: AppApi = useMemo(
    () => ({ navigate, goBack, toast, importBackup: () => fileRef.current?.click(), search, setSearch }),
    [navigate, goBack, toast, search],
  );

  const onImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file
      .text()
      .then(parseBackup)
      .then((next) => {
        const n = getState().lib.length;
        if (n && !confirm(`Replace your library (${n} series) with this backup (${next.lib.length} series)?`)) return;
        replaceState(next);
        toast('Backup imported');
      })
      .catch(() => toast('That file is not an InkNexus backup'));
  };

  const tab = view.name === 'search' ? 'search' : 'library';
  return (
    <AppContext.Provider value={api}>
      <div id="app">
        {view.name === 'library' && <Library />}
        {view.name === 'search' && <Search />}
        {view.name === 'series' && <Series key={view.id} view={view} />}
        {view.name === 'reader' && <Reader key={`${view.id}:${view.n}`} view={view} />}
        {view.name === 'frame' && <Frame key={`${view.id}:${view.i}:${view.url}`} view={view} />}
      </div>
      <nav id="nav" hidden={full}>
        <button aria-current={tab === 'library' || undefined} onClick={() => view.name !== 'library' && navigate({ name: 'library' })}>
          Library
        </button>
        <button aria-current={tab === 'search' || undefined} onClick={() => view.name !== 'search' && navigate({ name: 'search' })}>
          Find
        </button>
      </nav>
      <div id="toast" role="status" className={message.on ? 'on' : ''}>
        {message.text}
      </div>
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImport} />
    </AppContext.Provider>
  );
}
