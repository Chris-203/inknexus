import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useApp, type View } from '../context';
import { Sheet } from '../components/Sheet';
import { LinkFields } from '../components/LinkFields';
import { pasteChapterLink } from '../lib/actions';
import { why } from '../lib/api';
import { cachedChapters, retryChapters, useChapters } from '../lib/chapters';
import { fmt, host, linkFrom, nextWhole, stepChapter } from '../lib/links';
import { langName, type Name } from '../lib/names';
import { opensInBrowser, setOpensInBrowser } from '../lib/openInBrowser';
import { removeSeries, setHidden, setLast, sourcesOf, toggleSort, updateSeries, useStore } from '../lib/store';
import type { SearchResult, Series as SeriesT } from '../lib/types';
import * as mangadex from '../sources/mangadex';
import * as anilist from '../sources/anilist';
import { NOT_WEB, ResultRow } from './shared';

type SeriesView = Extract<View, { name: 'series' }>;

export function Series({ view }: { view: SeriesView }) {
  const { navigate, goBack, toast } = useApp();
  const { lib, sort } = useStore();
  const x = lib.find((s) => s.id === view.id);
  const [sheet, setSheet] = useState<'addsrc' | 'names' | null>(null);
  const [lastText, setLastText] = useState(String(x?.last || 0));
  const [, rerender] = useState(0);

  const all = x ? sourcesOf(x) : [];
  const vis = all.filter((q) => !q.h);
  const cur = vis.some((q) => q.k === x?.src) ? x!.src! : vis[0]?.k || '';
  const chs = useChapters(cur === 'md' ? x?.md : null);

  // Keep the field in step when the number changes elsewhere (− / +, paste).
  useEffect(() => setLastText(String(x?.last || 0)), [x?.last]);
  useEffect(() => {
    if (!x) navigate({ name: 'library' }, true);
  }, [x, navigate]);
  if (!x) return null;

  const last = x.last || 0;
  // While the field is being typed in, Continue and the read marks show what it would become. Saving waits for blur or Enter.
  const typed = parseFloat(lastText);
  const shown = Number.isNaN(typed) ? last : Math.max(0, typed);
  const commitLast = () => {
    if (Number.isNaN(typed)) return setLastText(String(last));
    if (shown !== last) setLast(x.id, shown);
    setLastText(String(shown));
  };

  const read = (n: number) => {
    const c = (x.md && cachedChapters(x.md)?.chapters.find((k) => k.num === n)) || null;
    if (c?.ext) {
      window.open(c.ext, '_blank', 'noopener');
      return toast(`Chapter ${fmt(n)} opens on the official site`);
    }
    navigate({ name: 'reader', id: x.id, n });
  };
  const openFrame = (i: number, mode: 'page' | 'cont' | 'resume') => {
    const l = x.links[i];
    if (!l) return;
    const n = mode === 'cont' ? nextWhole(shown) : mode === 'resume' ? l.rn || 0 : 0;
    const url = mode === 'resume' ? l.resume || '' : n && l.tpl ? l.tpl.replace('{n}', String(n)) : '';
    if (opensInBrowser(host(l.url))) {
      window.open(url || l.url, '_blank', 'noopener');
      return toast(n ? `Opened chapter ${fmt(n)} in the browser` : 'Opened in the browser');
    }
    navigate({ name: 'frame', id: x.id, i, ch: n, url });
  };

  let cta: ReactNode = null;
  let body: ReactNode;
  if (cur === 'md' && x.md) {
    let inner: ReactNode;
    if (!chs || chs.status === 'loading') inner = <p className="hint">Loading chapters…</p>;
    else if (chs.status === 'error')
      inner = (
        <>
          <p className="hint">Could not load chapters from MangaDex ({chs.error}).</p>
          <div className="pad">
            <button className="btn ghost" onClick={() => retryChapters(x.md!)}>
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
      const next = list.find((c) => c.num > shown);
      cta = next ? (
        <div className="pad">
          <button className="btn" onClick={() => read(next.num)}>
            {shown ? 'Continue' : 'Start'} with ch. {fmt(next.num)}
          </button>
        </div>
      ) : (
        <p className="hint">You're caught up on this source.</p>
      );
      const asc = sort === 'asc';
      const first = list[0]!;
      inner = (
        <>
          <div className="row mid">
            <button className="btn ghost sm" onClick={toggleSort}>
              Sort: {asc ? 'oldest first' : 'newest first'}
            </button>
            <span className="sub">
              {list.length} chapters, {fmt(first.num)} to {fmt(list[list.length - 1]!.num)}
            </span>
          </div>
          {first.num > 1 && <p className="hint">Chapters before {fmt(first.num)} are not on MangaDex. Try another source for those.</p>}
          {(asc ? list : [...list].reverse()).map((c) => (
            <button key={c.id} className={`ch${c.num <= shown ? ' read' : ''}`} onClick={() => read(c.num)}>
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
          <button className="btn" onClick={() => openFrame(i, 'cont')}>
            Continue with ch. {nextWhole(shown)}
          </button>
        )}
        <button className={`btn${l.tpl || l.resume ? ' ghost' : ''}`} onClick={() => openFrame(i, 'page')}>
          Open the series page{ob ? ' ↗' : ' in app'}
        </button>
        <button className="btn ghost" onClick={() => void pasteChapterLink(x.id, i, toast)}>
          Update chapter from a link
        </button>
        <details className="more">
          <summary>More</summary>
          <div className="pad">
            <p className="hint">
              Copy a chapter link from the site, then tap Update. InkNexus reads the chapter number and, where the site's links allow it, learns the
              pattern so Continue works. If the in-app view is blank, shows a warning, or zooms the whole app when you pinch it (iPhone), turn on Open in
              the browser{ob ? '. After reading there, come back and tap + or Update' : ''}.
            </p>
            <label className="opt">
              <input
                type="checkbox"
                checked={ob}
                onChange={(e) => {
                  setOpensInBrowser(site, e.target.checked);
                  rerender((n) => n + 1);
                  toast(e.target.checked ? `${site} will open in the browser` : `${site} will open in the app`);
                }}
              />
              Open {site} in the browser instead of in the app
            </label>
            <a className="btn ghost" href={l.url} target="_blank" rel="noopener noreferrer">
              Open in browser
            </a>
            <button className="btn danger sm" onClick={() => updateSeries(x.id, (s) => ({ links: s.links.filter((_, k) => k !== i), src: '' }))}>
              Remove this source
            </button>
          </div>
        </details>
      </div>
    );
  } else body = <p className="hint">{all.length ? 'All sources are hidden. Bring one back with + Source.' : 'No sources yet. Add one with + Source.'}</p>;

  return (
    <>
      <div className="backbar">
        <button className="ibtn" aria-label="Back" onClick={() => goBack({ name: 'library' })}>
          ‹
        </button>
      </div>
      <div className="top">
        {x.cover ? <img className="cover" src={x.cover} alt="" /> : <span className="cover" />}
        <div className="info">
          <h2>
            {x.title}{' '}
            <button className="ren" aria-label="Change name" onClick={() => setSheet('names')}>
              ✎
            </button>
          </h2>
          <div className="sub">Last chapter read</div>
          <div className="step">
            <button className="ibtn" aria-label="Previous chapter" onClick={() => setLast(x.id, stepChapter(last, -1))}>
              −
            </button>
            <input
              type="number"
              step="any"
              min="0"
              aria-label="Last chapter read"
              value={lastText}
              onChange={(e) => setLastText(e.target.value)}
              onBlur={commitLast}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <button className="ibtn" aria-label="Next chapter" onClick={() => setLast(x.id, stepChapter(last, 1))}>
              +
            </button>
          </div>
        </div>
      </div>
      {cta}
      <div className="chips">
        {vis.map((q) => (
          <button key={q.k} className={`chip${cur === q.k ? ' on' : ''}`} aria-pressed={cur === q.k} onClick={() => updateSeries(x.id, () => ({ src: q.k }))}>
            {q.n}
          </button>
        ))}
        <button className="chip" onClick={() => setSheet('addsrc')}>
          + Source
        </button>
      </div>
      {cur && (
        <div className="row tight">
          <button
            className="btn ghost sm"
            onClick={() => {
              setHidden(x.id, cur, true);
              toast('Hidden. Bring it back from + Source');
            }}
          >
            Hide this source
          </button>
        </div>
      )}
      {body}
      <div className="pad end">
        <button
          className="btn danger sm"
          onClick={() => {
            if (!confirm('Remove this series from your library?')) return;
            removeSeries(x.id);
            navigate({ name: 'library' }, true);
          }}
        >
          Remove from library
        </button>
      </div>
      {sheet === 'addsrc' && <AddSourceSheet x={x} onClose={() => setSheet(null)} />}
      {sheet === 'names' && <NamesSheet x={x} onClose={() => setSheet(null)} />}
    </>
  );
}

function AddSourceSheet({ x, onClose }: { x: SeriesT; onClose: () => void }) {
  const { toast } = useApp();
  const [res, setRes] = useState<{ kind: 'md' | 'al'; state: 'busy' | 'error' | 'done'; error?: string; items: SearchResult[] } | null>(null);
  const hidden = sourcesOf(x).filter((q) => q.h);
  const site = (k: 'md' | 'al') => (k === 'md' ? 'MangaDex' : 'AniList');

  const find = async (kind: 'md' | 'al') => {
    setRes({ kind, state: 'busy', items: [] });
    try {
      setRes({ kind, state: 'done', items: await (kind === 'md' ? mangadex.search(x.title) : anilist.search(x.title)) });
    } catch (e) {
      setRes({ kind, state: 'error', error: why(e), items: [] });
    }
  };
  const use = (o: SearchResult) => {
    if (res?.kind === 'md') updateSeries(x.id, (s) => ({ md: String(o.ref), mdh: false, cover: s.cover || o.cover, src: 'md' }));
    else {
      const fresh = (o.links || []).filter((l) => !x.links.some((k) => k.url === l.url));
      updateSeries(x.id, (s) => ({ al: o.ref, cover: s.cover || o.cover, links: [...s.links, ...fresh] }));
      toast(fresh.length ? `Added ${fresh.length} official link${fresh.length === 1 ? '' : 's'}` : 'No official links listed for this one');
    }
    onClose();
  };
  const onSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const made = linkFrom(String(d.get('url') || ''), String(d.get('label') || ''));
    if (!made) return toast(NOT_WEB);
    const r = made.r;
    const ahead = !!r && r.num > (x.last || 0);
    updateSeries(x.id, (s) => ({ links: [...s.links, made.link], src: 'l' + s.links.length, ...(ahead ? { last: r!.num, t: Date.now() } : {}) }));
    if (ahead) toast(`Detected chapter ${fmt(r!.num)} from the link`);
    onClose();
  };

  return (
    <Sheet label="Add a source" onClose={onClose}>
      <h2>Add a source</h2>
      {hidden.length > 0 && (
        <>
          <p className="hint">Hidden sources</p>
          {hidden.map((q) => (
            <button
              key={q.k}
              className="btn ghost"
              onClick={() => {
                setHidden(x.id, q.k, false);
                onClose();
              }}
            >
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
      <div>
        {res?.state === 'busy' && <p className="hint">Searching…</p>}
        {res?.state === 'error' && <p className="hint">Could not reach {site(res.kind)} ({res.error}).</p>}
        {res?.state === 'done' && !res.items.length && <p className="hint">No match on {site(res.kind)}.</p>}
        {res?.state === 'done' &&
          res.items.map((o) => {
            const n = o.links?.length || 0;
            return (
              <ResultRow key={String(o.ref)} o={o} extra={res.kind === 'al' && <p>{n} official link{n === 1 ? '' : 's'}</p>}>
                <button className="btn sm" onClick={() => use(o)}>
                  Use
                </button>
              </ResultRow>
            );
          })}
      </div>
      <form className="stack" onSubmit={onSave}>
        <LinkFields urlPlaceholder="Series or chapter link" />
        <button className="btn">Save link</button>
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
    <Sheet label="Change name" onClose={onClose}>
      <h2>Change name</h2>
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
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) rename(text.trim());
        }}
      >
        <input name="title" value={text} onChange={(e) => setText(e.target.value)} required aria-label="Name" />
        <button className="btn">Save this name</button>
      </form>
      <button className="btn ghost" onClick={onClose}>
        Close
      </button>
    </Sheet>
  );
}
