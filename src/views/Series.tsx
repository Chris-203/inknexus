import { useEffect, useState, type FormEvent } from 'react';
import { useApp, type View } from '../context';
import { Sheet } from '../components/Sheet';
import { LinkFields } from '../components/LinkFields';
import { pasteChapterLink } from '../lib/actions';
import { cachedChapters, useChapters } from '../lib/chapters';
import { fmt, host, parseChUrl } from '../lib/links';
import { langName, type Name } from '../lib/names';
import { why } from '../lib/api';
import { removeSeries, setLast, toggleSort, updateSeries, useStore } from '../lib/store';
import type { SearchResult, Series as SeriesT } from '../lib/types';
import * as mangadex from '../sources/mangadex';
import * as anilist from '../sources/anilist';
import { opensInBrowser, setOpensInBrowser } from '../lib/openInBrowser';

type SeriesView = Extract<View, { name: 'series' }>;
interface Src {
  k: string;
  n: string;
  h?: boolean;
}

const sourcesOf = (x: SeriesT): Src[] => [
  ...(x.md ? [{ k: 'md', n: 'MangaDex', h: x.mdh }] : []),
  ...x.links.map((l, i) => ({ k: 'l' + i, n: l.label || host(l.url), h: l.h })),
];

export function Series({ view }: { view: SeriesView }) {
  const { navigate, toast } = useApp();
  const { lib, sort } = useStore();
  const x = lib.find((s) => s.id === view.id);
  const [chosen, setChosen] = useState(view.src ?? x?.src ?? '');
  const [sheet, setSheet] = useState<'addsrc' | 'names' | null>(null);
  const [lastText, setLastText] = useState(String(x?.last || 0));
  const [, rerender] = useState(0);

  const all = x ? sourcesOf(x) : [];
  const vis = all.filter((q) => !q.h);
  const cur = vis.some((q) => q.k === chosen) ? chosen : vis[0]?.k || '';
  const [chs, retry] = useChapters(cur === 'md' ? x?.md : null);

  // Keep the field in step when the number changes elsewhere (− / +, paste), without fighting what is being typed.
  useEffect(() => {
    if (x && (parseFloat(lastText) || 0) !== x.last) setLastText(String(x.last || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x?.last]);
  useEffect(() => {
    if (!x) navigate({ name: 'library' }, true);
  }, [x, navigate]);
  if (!x) return null;

  const last = x.last || 0;
  const pick = (k: string) => {
    setChosen(k);
    updateSeries(x.id, () => ({ src: k }));
  };
  const hide = () => {
    updateSeries(x.id, (s) => (cur === 'md' ? { mdh: true, src: '' } : { links: s.links.map((l, i) => ('l' + i === cur ? { ...l, h: true } : l)), src: '' }));
    setChosen('');
    toast('Hidden. Bring it back from + Source');
  };
  const read = (n: number, cont = false) => {
    const list = cachedChapters(x.md)?.chapters || [];
    if (cont) {
      const nx = list.find((c) => c.num > last);
      if (!nx) return toast('No later chapter on this source');
      n = nx.num;
    }
    const c = list.find((k) => k.num === n);
    if (c?.ext) {
      window.open(c.ext, '_blank', 'noopener');
      return toast(`Chapter ${fmt(n)} opens on the official site`);
    }
    navigate({ name: 'reader', id: x.id, n });
  };
  const openFrame = (i: number, mode: 'page' | 'cont' | 'resume') => {
    const l = x.links[i];
    if (!l) return;
    const n = mode === 'cont' ? Math.floor(last) + 1 : mode === 'resume' ? l.rn || 0 : 0;
    const url = mode === 'resume' ? l.resume || '' : n && l.tpl ? l.tpl.replace('{n}', String(n)) : '';
    if (opensInBrowser(host(l.url))) {
      window.open(url || l.url, '_blank', 'noopener');
      return toast(n ? `Opened chapter ${fmt(n)} in the browser` : 'Opened in the browser');
    }
    navigate({ name: 'frame', id: x.id, i, src: cur, ch: n, url });
  };

  let cta: React.ReactNode = null;
  let body: React.ReactNode;
  if (cur === 'md' && x.md) {
    let inner: React.ReactNode;
    if (!chs || chs.status === 'loading') inner = <p className="hint">Loading chapters…</p>;
    else if (chs.status === 'error')
      inner = (
        <>
          <p className="hint">Could not load chapters from MangaDex ({chs.error}).</p>
          <div className="pad">
            <button className="btn ghost" onClick={retry}>
              Try again
            </button>
          </div>
        </>
      );
    else if (!chs.list.chapters.length) {
      const n = chs.list.listed;
      inner = (
        <p className="hint">
          {n
            ? `MangaDex lists ${n} English chapter${n === 1 ? '' : 's'} for this title, but none can be read here (removed or hosted elsewhere). Add an official link with + Source.`
            : 'MangaDex has no English chapters for this title. Add an official link with + Source, or switch to another source.'}
        </p>
      );
    } else {
      const list = chs.list.chapters;
      const next = list.find((c) => c.num > last);
      cta = next ? (
        <div className="pad">
          <button id="cont" className="btn" onClick={() => read(next.num)}>
            {last ? 'Continue' : 'Start'} with ch. {fmt(next.num)}
          </button>
        </div>
      ) : (
        <p className="hint">You're caught up on this source.</p>
      );
      const asc = sort === 'asc';
      const first = list[0]!;
      inner = (
        <>
          <div className="row" style={{ alignItems: 'center' }}>
            <button className="btn ghost sm" onClick={toggleSort}>
              Sort: {asc ? 'oldest first' : 'newest first'}
            </button>
            <span className="sub">
              {list.length} chapters, {fmt(first.num)} to {fmt(list[list.length - 1]!.num)}
            </span>
          </div>
          {first.num > 1 && <p className="hint">Chapters before {fmt(first.num)} are not on MangaDex. Try another source for those.</p>}
          {(asc ? list : [...list].reverse()).map((c) => (
            <button key={c.id} className={`ch ${c.num <= last ? 'read' : ''}`} onClick={() => read(c.num)}>
              <b>Ch. {fmt(c.num)}</b>
              <span>{[c.ext ? 'Official site ↗' : c.title, c.grp].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </>
      );
    }
    body = (
      <>
        {inner}
        <p className="credit">
          Chapters and data from MangaDex. Scanlation groups are credited on each chapter.{' '}
          <a href={mangadex.mangaUrl(x.md)} target="_blank" rel="noopener noreferrer">
            View on MangaDex ↗
          </a>
        </p>
      </>
    );
  } else if (cur.startsWith('l')) {
    const i = +cur.slice(1);
    const l = x.links[i];
    const nx = Math.floor(last) + 1;
    const site = l ? host(l.url) : '';
    const ob = !!l && opensInBrowser(site);
    body = l && (
      <div className="pad">
        {l.resume && (
          <button className="btn" onClick={() => openFrame(i, 'resume')}>
            Resume ch. {fmt(l.rn || 0)} (saved link)
          </button>
        )}
        {l.tpl && (
          <button id="cont" className="btn" onClick={() => openFrame(i, 'cont')}>
            Continue with ch. {nx}
          </button>
        )}
        <button className={`btn ${l.tpl || l.resume ? 'ghost' : ''}`} onClick={() => openFrame(i, 'page')}>
          Open the series page{ob ? ' ↗' : ' in app'}
        </button>
        <button className="btn ghost" onClick={() => void pasteChapterLink(x.id, i, toast)}>
          Update chapter from a link
        </button>
        <a className="btn ghost" href={l.url} target="_blank" rel="noopener noreferrer">
          Open in browser
        </a>
        <label className="opt">
          <input
            type="checkbox"
            className="obt"
            checked={ob}
            onChange={(e) => {
              setOpensInBrowser(site, e.target.checked);
              rerender((n) => n + 1);
              toast(e.target.checked ? `${site} will open in the browser` : `${site} will open in the app`);
            }}
          />{' '}
          Open {site} in the browser instead of in the app
        </label>
        <p className="hint" style={{ padding: 0 }}>
          Copy a chapter link from the site, then tap Update. InkNexus reads the chapter number and, where the site's links allow it, learns the pattern so
          Continue works. If the site is blank, shows a warning, or zooms the whole app when you pinch it (iPhone), turn on Open in the browser
          {ob ? '. After reading there, come back and tap + or Update' : ''}.
        </p>
        <button
          className="btn danger sm"
          onClick={() => {
            updateSeries(x.id, (s) => ({ links: s.links.filter((_, k) => k !== i), src: '' }));
            setChosen('');
          }}
        >
          Remove this source
        </button>
      </div>
    );
  } else body = <p className="hint">{all.length ? 'All sources are hidden. Bring one back with + Source.' : 'No sources yet. Add one with + Source.'}</p>;

  return (
    <>
      <div className="rbar" style={{ position: 'static', background: 'none', border: 0, backdropFilter: 'none', margin: 0, paddingBottom: 0 }}>
        <button aria-label="Back" onClick={() => navigate({ name: 'library' })}>
          ‹
        </button>
      </div>
      <div className="top">
        {x.cover ? <img className="cover" src={x.cover} alt="" /> : <div className="cover" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>
            {x.title}{' '}
            <button className="ren" aria-label="Change name" onClick={() => setSheet('names')}>
              ✎
            </button>
          </h2>
          <div className="sub" style={{ marginTop: 6 }}>
            Last chapter read
          </div>
          <div className="step">
            <button aria-label="Previous chapter" onClick={() => setLast(x.id, Math.floor(last) - 1)}>
              −
            </button>
            <input
              id="last"
              type="number"
              step="any"
              min="0"
              value={lastText}
              onChange={(e) => {
                setLastText(e.target.value);
                setLast(x.id, parseFloat(e.target.value) || 0);
              }}
            />
            <button aria-label="Next chapter" onClick={() => setLast(x.id, Math.floor(last) + 1)}>
              +
            </button>
          </div>
        </div>
      </div>
      {cta}
      <div className="chips">
        {vis.map((q) => (
          <button key={q.k} className={`chip ${cur === q.k ? 'on' : ''}`} onClick={() => pick(q.k)}>
            {q.n}
          </button>
        ))}
        <button className="chip" onClick={() => setSheet('addsrc')}>
          + Source
        </button>
      </div>
      {cur && (
        <div className="row" style={{ paddingTop: 0 }}>
          <button className="btn ghost sm" onClick={hide}>
            Hide this source
          </button>
        </div>
      )}
      {body}
      <div className="pad" style={{ marginTop: 20 }}>
        <button
          className="btn danger sm"
          onClick={() => {
            if (confirm('Remove this series from your library?')) {
              removeSeries(x.id);
              navigate({ name: 'library' }, true);
            }
          }}
        >
          Remove from library
        </button>
      </div>
      {sheet === 'addsrc' && <AddSourceSheet x={x} onClose={() => setSheet(null)} onPick={pick} />}
      {sheet === 'names' && <NamesSheet x={x} onClose={() => setSheet(null)} />}
    </>
  );
}

function AddSourceSheet({ x, onClose, onPick }: { x: SeriesT; onClose: () => void; onPick: (k: string) => void }) {
  const { toast } = useApp();
  const [res, setRes] = useState<{ kind: 'md' | 'al'; state: 'busy' | 'error' | 'done'; error?: string; items: SearchResult[] } | null>(null);
  const hidden = sourcesOf(x).filter((q) => q.h);

  const unhide = (k: string) => {
    updateSeries(x.id, (s) => (k === 'md' ? { mdh: false, src: k } : { links: s.links.map((l, i) => ('l' + i === k ? { ...l, h: false } : l)), src: k }));
    onPick(k);
    onClose();
  };
  const find = async (kind: 'md' | 'al') => {
    setRes({ kind, state: 'busy', items: [] });
    try {
      const items = await (kind === 'md' ? mangadex.search(x.title) : anilist.search(x.title));
      setRes({ kind, state: 'done', items });
    } catch (e) {
      setRes({ kind, state: 'error', error: why(e), items: [] });
    }
  };
  const useMd = (o: SearchResult) => {
    updateSeries(x.id, (s) => ({ md: String(o.ref), mdh: false, cover: s.cover || o.cover, src: 'md' }));
    onPick('md');
    onClose();
  };
  const useAl = (o: SearchResult) => {
    const fresh = (o.links || []).filter((l) => !x.links.some((k) => k.url === l.url));
    updateSeries(x.id, (s) => ({ al: o.ref, cover: s.cover || o.cover, links: [...s.links, ...fresh] }));
    onClose();
    toast(fresh.length ? `Added ${fresh.length} official link${fresh.length === 1 ? '' : 's'}` : 'No official links listed for this one');
  };
  const onSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const raw = String(d.get('url') || '').trim();
    const r = parseChUrl(raw);
    const link = { label: String(d.get('label') || '').trim(), url: r?.idPrefixed ? r.series : raw, tpl: r ? r.tpl : '', resume: r ? raw : '', rn: r ? r.num : 0 };
    const k = 'l' + x.links.length;
    updateSeries(x.id, (s) => ({ links: [...s.links, link], src: k, ...(r && r.num > (s.last || 0) ? { last: r.num } : {}) }));
    if (r && r.num > (x.last || 0)) toast(`Detected chapter ${fmt(r.num)} from the link`);
    onPick(k);
    onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <h2>Add a source</h2>
      {hidden.length > 0 && (
        <>
          <p className="hint">Hidden sources</p>
          {hidden.map((q) => (
            <button key={q.k} className="btn ghost" onClick={() => unhide(q.k)}>
              Show {q.n}
            </button>
          ))}
          <p className="hint">Or add a new one</p>
        </>
      )}
      {!x.md && (
        <button className="btn" onClick={() => void find('md')}>
          Find it on MangaDex
        </button>
      )}
      <button className="btn ghost" onClick={() => void find('al')}>
        Find official links (AniList)
      </button>
      <div id="mres">
        {res?.state === 'busy' && <p className="hint">Searching…</p>}
        {res?.state === 'error' && <p className="hint">Could not reach {res.kind === 'md' ? 'MangaDex' : 'AniList'} ({res.error}).</p>}
        {res?.state === 'done' && !res.items.length && <p className="hint">No match on {res.kind === 'md' ? 'MangaDex' : 'AniList'}.</p>}
        {res?.state === 'done' &&
          res.items.map((o) => (
            <div className="res" key={String(o.ref)}>
              <img src={o.cover} alt="" />
              <div>
                <b>{o.title}</b>
                {res.kind === 'al' && (
                  <p>
                    {o.links?.length || 0} official link{o.links?.length === 1 ? '' : 's'}
                  </p>
                )}
              </div>
              <button className="btn sm" style={{ margin: 0, width: 'auto' }} onClick={() => (res.kind === 'md' ? useMd(o) : useAl(o))}>
                Use
              </button>
            </div>
          ))}
      </div>
      <form id="lf" className="stack" onSubmit={onSave}>
        <LinkFields urlPlaceholder="Series or chapter link" />
        <button className="btn" style={{ margin: 0, width: '100%' }}>
          Save link
        </button>
      </form>
      <button className="btn ghost" onClick={onClose}>
        Close
      </button>
    </Sheet>
  );
}

function NamesSheet({ x, onClose }: { x: SeriesT; onClose: () => void }) {
  const { toast } = useApp();
  const [names, setNames] = useState<{ state: 'busy' | 'error' | 'done'; error?: string; items: Name[] }>({ state: 'busy', items: [] });
  const [text, setText] = useState(x.title);

  useEffect(() => {
    if (!x.md) return;
    let live = true;
    mangadex
      .names(x.md)
      .then((items) => live && setNames({ state: 'done', items }))
      .catch((e) => live && setNames({ state: 'error', error: why(e), items: [] }));
    return () => {
      live = false;
    };
  }, [x.md]);

  const rename = (t: string) => {
    updateSeries(x.id, () => ({ title: t }));
    onClose();
    toast('Name changed');
  };

  return (
    <Sheet onClose={onClose}>
      <h2>Change name</h2>
      <div id="nres">
        {x.md && names.state === 'busy' && <p className="hint">Loading names from MangaDex…</p>}
        {x.md && names.state === 'error' && <p className="hint">Could not load names from MangaDex ({names.error}). Type a name below, or try again later.</p>}
        {x.md && names.state === 'done' && !names.items.length && <p className="hint">MangaDex lists no other names. Type your own below.</p>}
        {x.md && names.state === 'done' && names.items.length > 0 && (
          <>
            <p className="hint">Pick a name, or type your own below.</p>
            {names.items.map((o) => (
              <button key={o.l + o.n} className="ch" onClick={() => rename(o.n)}>
                <b className="nm">
                  {o.n}
                  {o.n === x.title ? ' ✓' : ''}
                </b>
                <span>{langName(o.l)}</span>
              </button>
            ))}
          </>
        )}
      </div>
      <form
        id="nf"
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) rename(text.trim());
        }}
      >
        <input name="title" value={text} onChange={(e) => setText(e.target.value)} required aria-label="Name" />
        <button className="btn" style={{ margin: 0, width: '100%' }}>
          Save this name
        </button>
      </form>
      <button className="btn ghost" onClick={onClose}>
        Close
      </button>
    </Sheet>
  );
}
