import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppContext, type AppApi, type SearchState, type View } from './context';
import { parseBackup } from './lib/storage';
import { replaceState } from './lib/store';
import { Library } from './views/Library';
import { Search } from './views/Search';
import { Series } from './views/Series';
import { Reader } from './views/Reader';
import { Frame } from './views/Frame';

const isView = (v: unknown): v is View => !!v && typeof (v as View).name === 'string';

export function App() {
  // Views live in browser history, so the phone's back gesture moves back through the app.
  const [view, setView] = useState<View>(() => (isView(history.state) ? history.state : { name: 'library' }));
  const [search, setSearch] = useState<SearchState>({ q: '', results: null });
  const [message, setMessage] = useState({ text: '', on: false });
  const toastTimer = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    history.replaceState(view, '');
    const pop = (e: PopStateEvent) => setView(isView(e.state) ? e.state : { name: 'library' });
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  useLayoutEffect(() => window.scrollTo(0, 0), [view]);
  // The site view fills the screen; drop the bottom space kept for the (hidden) nav.
  useEffect(() => void document.body.classList.toggle('nonav', view.name === 'frame'), [view.name]);

  const navigate = useCallback((v: View, replace = false) => {
    if (replace) history.replaceState(v, '');
    else history.pushState(v, '');
    setView(v);
  }, []);

  const toast = useCallback((text: string) => {
    setMessage({ text, on: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setMessage((m) => ({ ...m, on: false })), 3200);
  }, []);

  const api: AppApi = useMemo(
    () => ({ navigate, toast, importBackup: () => fileRef.current?.click(), search, setSearch }),
    [navigate, toast, search],
  );

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file
      .text()
      .then((t) => {
        replaceState(parseBackup(t));
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
        {view.name === 'frame' && <Frame key={view.url || view.i} view={view} />}
      </div>
      {view.name !== 'reader' && view.name !== 'frame' && (
        <nav id="nav">
          <button className={tab === 'library' ? 'on' : ''} onClick={() => navigate({ name: 'library' })}>
            Library
          </button>
          <button className={tab === 'search' ? 'on' : ''} onClick={() => navigate({ name: 'search' })}>
            Find
          </button>
        </nav>
      )}
      <div id="toast" role="status" className={message.on ? 'on' : ''}>
        {message.text}
      </div>
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImport} />
    </AppContext.Provider>
  );
}
