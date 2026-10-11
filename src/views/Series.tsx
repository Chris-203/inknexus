import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useApp } from '../context';
import { LinkFields } from '../components/LinkFields';
import { ResultRow } from '../components/ResultRow';
import { Sheet } from '../components/Sheet';
import { retryChapters, useChapters, type ChaptersState } from '../lib/chapters';
import { fmt, plural } from '../lib/format';
import { chapterLink, host, linkFrom, nextWhole, NOT_WEB, stepChapter } from '../lib/links';
import { langName } from '../lib/names';
import { pasteChapterLink } from '../lib/pasteLink';
import { opensInBrowser, setOpensInBrowser, useOpensInBrowser } from '../lib/siteSettings';
import { removeSeries, setHidden, setLast, sourcesOf, toggleSort, updateSeries, useStore } from '../lib/store';
import type { Chapter, Link, SearchResult, Series as SeriesT } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import * as mangadex from '../sources/mangadex';
import * as anilist from '../sources/anilist';

export function Series({ x }: { x: SeriesT }) {
  const { goBack, toast } = useApp();
  const [sheet, setSheet] = useState<'addsrc' | 'names' | null>(null);
  const [lastText, setLastText] = useState(String(x.last || 0));

  const all = sourcesOf(x);
  const vis = all.filter((q) => !q.h);
  const cur = vis.some((q) => q.k === x.src) ? x.src! : vis[0]?.k || '';
  const chs = useChapters(cur === 'md' ? x.md : null);

  // Keep the field in step when the number changes elsewhere (− / +, paste).
  useEffect(() => setLastText(String(x.last || 0)), [x.last]);

  const last = x.last || 0;
  // While the field is being typed in, Continue and the read marks show what it would become. Saving waits for blur or Enter.
  const typed = parseFloat(lastText);
  const shown = Number.isNaN(typed) ? last : Math.max(0, typed);
  const commitLast = () => {
    if (Number.isNaN(typed)) return setLastText(String(last));
    if (shown !== last) setLast(x.id, shown);
    setLastText(String(shown));
  };

  // The next chapter to read: on MangaDex once its list is loaded; link sources have their own Continue.
  const next = cur === 'md' && chs?.status === 'ready' ? chs.list.chapters.find((c) => c.num > shown) : undefined;
  let body: ReactNode;
  if (cur === 'md') body = <MangaDexSource x={x} chs={chs} shown={shown} />;
  else if (cur.startsWith('l')) {
    const i = +cur.slice(1);
    const l = x.links[i];
    body = l && <LinkSource x={x} l={l} i={i} shown={shown} />;
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
      {next && (
        <div className="pad">
          <ReadButton x={x} c={next} className="btn">
            {shown ? 'Continue' : 'Start'} with ch. {fmt(next.num)}
          </ReadButton>
        </div>
      )}
      {cur === 'md' && chs?.status === 'ready' && chs.list.chapters.length > 0 && !next && <p className="hint">You're caught up on this source.</p>}
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
            if (confirm('Remove this series from your library?')) removeSeries(x.id);
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

/** Opens a MangaDex chapter in the reader, or on the official site when it is hosted there. */
function ReadButton({ x, c, className, children }: { x: SeriesT; c: Chapter; className: string; children: ReactNode }) {
  const { navigate, toast } = useApp();
  const read = () => {
    if (!c.ext) return navigate({ name: 'reader', id: x.id, n: c.num });
    window.open(c.ext, '_blank', 'noopener');
    toast(`Chapter ${fmt(c.num)} opens on the official site`);
  };
  return (
    <button className={className} onClick={read}>
      {children}
    </button>
  );
}

/** The MangaDex source: its chapter list, with the ones up to `shown` marked read. */
function MangaDexSource({ x, chs, shown }: { x: SeriesT; chs: ChaptersState | null; shown: number }) {
  const { sort } = useStore();
  let list: ReactNode;
  if (!chs || chs.status === 'loading') list = <p className="hint">Loading chapters…</p>;
  else if (chs.status === 'error')
    list = (
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
    list = (
      <p className="hint">
        {n
          ? `MangaDex lists ${plural(n, 'English chapter')} for this title, but none can be read here (removed or hosted elsewhere). Add an official link with + Source.`
          : 'MangaDex has no English chapters for this title. Add an official link with + Source, or switch to another source.'}
      </p>
    );
  } else {
    const all = chs.list.chapters;
    const asc = sort === 'asc';
    const first = all[0]!;
    list = (
      <>
        <div className="row mid">
          <button className="btn ghost sm" onClick={toggleSort}>
            Sort: {asc ? 'oldest first' : 'newest first'}
          </button>
          <span className="sub">
            {all.length} chapters, {fmt(first.num)} to {fmt(all[all.length - 1]!.num)}
          </span>
        </div>
        {first.num > 1 && <p className="hint">Chapters before {fmt(first.num)} are not on MangaDex. Try another source for those.</p>}
        {(asc ? all : [...all].reverse()).map((c) => (
          <ReadButton key={c.id} x={x} c={c} className={`ch${c.num <= shown ? ' read' : ''}`}>
            <b>Ch. {fmt(c.num)}</b>
            <span>{[c.ext ? 'Official site ↗' : c.title, c.grp].filter(Boolean).join(' · ')}</span>
          </ReadButton>
        ))}
      </>
    );
  }
  return (
    <>
      {list}
      <p className="credit">
        Chapters and data from MangaDex. Scanlation groups are credited on each chapter.{' '}
        <a href={mangadex.mangaUrl(x.md!)} target="_blank" rel="noopener noreferrer">
          View on MangaDex ↗
        </a>
      </p>
    </>
  );
}

/** A link-only source: open it in the app or the browser, update the chapter from a copied link, and its settings under More. */
function LinkSource({ x, l, i, shown }: { x: SeriesT; l: Link; i: number; shown: number }) {
  const { navigate, toast } = useApp();
  const site = host(l.url);
  const ob = useOpensInBrowser(site);

  const open = (mode: 'page' | 'cont' | 'resume') => {
    const n = mode === 'cont' ? nextWhole(shown) : mode === 'resume' ? l.rn || 0 : 0;
    const url = mode === 'resume' ? l.resume || '' : n && l.tpl ? chapterLink(l.tpl, n) : '';
    if (opensInBrowser(site)) {
      window.open(url || l.url, '_blank', 'noopener');
      return toast(n ? `Opened chapter ${fmt(n)} in the browser` : 'Opened in the browser');
    }
    navigate({ name: 'frame', id: x.id, i, ch: n, url });
  };

  return (
    <div className="pad">
      {l.resume && (
        <button className="btn" onClick={() => open('resume')}>
          Resume ch. {fmt(l.rn || 0)} (saved link)
        </button>
      )}
      {l.tpl && (
        <button className="btn" onClick={() => open('cont')}>
          Continue with ch. {nextWhole(shown)}
        </button>
      )}
      <button className={`btn${l.tpl || l.resume ? ' ghost' : ''}`} onClick={() => open('page')}>
        Open the series page{ob ? ' ↗' : ' in app'}
      </button>
      <button className="btn ghost" onClick={() => void pasteChapterLink(x.id, i, toast)}>
        Update chapter from a link
      </button>
      <details className="more">
        <summary>More</summary>
        <div className="pad">
          <p className="hint">
            Copy a chapter link from the site, then tap Update. InkNexus reads the chapter number and, where the site's links allow it, learns the pattern so
            Continue works. If the in-app view is blank, shows a warning, or zooms the whole app when you pinch it (iPhone), turn on Open in the browser
            {ob ? '. After reading there, come back and tap + or Update' : ''}.
          </p>
          <label className="opt">
            <input
              type="checkbox"
              checked={ob}
              onChange={(e) => {
                setOpensInBrowser(site, e.target.checked);
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
}

function AddSourceSheet({ x, onClose }: { x: SeriesT; onClose: () => void }) {
  const { toast } = useApp();
  const [kind, setKind] = useState<'md' | 'al' | null>(null);
  const res = useLoad(kind, () => (kind === 'md' ? mangadex.search(x.title) : anilist.search(x.title)));
  const site = kind === 'md' ? 'MangaDex' : 'AniList';
  const hidden = sourcesOf(x).filter((q) => q.h);

  const use = (o: SearchResult) => {
    if (kind === 'md') updateSeries(x.id, (s) => ({ md: String(o.ref), mdh: false, cover: s.cover || o.cover, src: 'md' }));
    else {
      const fresh = (o.links || []).filter((l) => !x.links.some((k) => k.url === l.url));
      updateSeries(x.id, (s) => ({ al: o.ref, cover: s.cover || o.cover, links: [...s.links, ...fresh] }));
      toast(fresh.length ? `Added ${plural(fresh.length, 'official link')}` : 'No official links listed for this one');
    }
    onClose();
  };
  const onSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const made = linkFrom(String(d.get('url') || ''), String(d.get('label') || ''));
    if (!made) return toast(NOT_WEB);
    updateSeries(x.id, (s) => ({ links: [...s.links, made.link], src: 'l' + s.links.length }));
    if (made.r && made.r.num > (x.last || 0)) {
      setLast(x.id, made.r.num);
      toast(`Detected chapter ${fmt(made.r.num)} from the link`);
    }
    onClose();
  };

  const results = res?.state === 'done' ? res.value : [];
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
        <button className="btn" onClick={() => setKind('md')}>
          Find it on MangaDex
        </button>
      )}
      <button className="btn ghost" onClick={() => setKind('al')}>
        Find official links (AniList)
      </button>
      <div>
        {res?.state === 'busy' && <p className="hint">Searching…</p>}
        {res?.state === 'error' && (
          <p className="hint">
            Could not reach {site} ({res.error}).
          </p>
        )}
        {res?.state === 'done' && !results.length && <p className="hint">No match on {site}.</p>}
        {results.map((o) => (
          <ResultRow key={String(o.ref)} o={o} extra={kind === 'al' && <p>{plural(o.links?.length || 0, 'official link')}</p>}>
            <button className="btn sm" onClick={() => use(o)}>
              Use
            </button>
          </ResultRow>
        ))}
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
  const names = useLoad(x.md, () => mangadex.names(x.md!));
  const [text, setText] = useState(x.title);

  const rename = (t: string) => {
    updateSeries(x.id, () => ({ title: t }));
    onClose();
    toast('Name changed');
  };

  return (
    <Sheet label="Change name" onClose={onClose}>
      <h2>Change name</h2>
      {names?.state === 'busy' && <p className="hint">Loading names from MangaDex…</p>}
      {names?.state === 'error' && <p className="hint">Could not load names from MangaDex ({names.error}). Type a name below, or try again later.</p>}
      {names?.state === 'done' && !names.value.length && <p className="hint">MangaDex lists no other names. Type your own below.</p>}
      {names?.state === 'done' && names.value.length > 0 && (
        <>
          <p className="hint">Pick a name, or type your own below.</p>
          {names.value.map((o) => (
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
