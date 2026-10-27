import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useApp } from '../context';
import { ChapterRows } from '../components/ChapterRows';
import { LinkFields } from '../components/LinkFields';
import { ReadButton } from '../components/ReadButton';
import { ResultRow } from '../components/ResultRow';
import { Sheet, useSheet } from '../components/Sheet';
import { imageSrc } from '../lib/api';
import { retryChapters, useChapters, type ChaptersState } from '../lib/chapters';
import { chapterNote, fmt, plural } from '../lib/format';
import { chapterLink, host, linkFrom, nextWhole, NOT_WEB, stepChapter } from '../lib/links';
import { langName } from '../lib/names';
import { pasteChapterLink } from '../lib/pasteLink';
import { opensInBrowser, setOpensInBrowser, useOpensInBrowser } from '../lib/siteSettings';
import { leftChapter } from '../lib/spots';
import { removeSeries, setHidden, setLast, sourcesOf, updateSeries } from '../lib/store';
import type { Link, SearchResult, Series as SeriesT } from '../lib/types';
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
  // Loaded while another source is shown too, so switching to MangaDex shows its chapters at once.
  const chs = useChapters(x.mdh ? null : x.md);

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

  // The chapter to read on MangaDex, once its list is loaded: one left part way, unless it is older than the last one read,
  // otherwise the next one. A link source has Continue once it knows its chapter link pattern.
  const list = cur === 'md' && chs?.status === 'ready' ? chs.list.chapters : [];
  const left = leftChapter(x.id) ?? -1;
  const next = (left >= shown && list.find((c) => c.num === left)) || list.find((c) => c.num > shown);
  const i = cur.startsWith('l') ? +cur.slice(1) : -1;
  const l = x.links[i];
  let body: ReactNode;
  if (cur === 'md') body = <MangaDexSource x={x} chs={chs} shown={shown} />;
  else if (l) body = <LinkSource x={x} l={l} i={i} shown={shown} />;
  else body = <p className="hint">{all.length ? 'All sources are hidden. Bring one back with + Source.' : 'No sources yet. Add one with + Source.'}</p>;

  return (
    <>
      <div className="backbar">
        <button className="ibtn" aria-label="Back" onClick={() => goBack({ name: 'library' })}>
          ‹
        </button>
      </div>
      <div className="top">
        {x.cover ? <img className="cover" src={imageSrc(x.cover)} referrerPolicy="same-origin" alt="" /> : <span className="cover" />}
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
            {shown || next.num === left ? 'Continue' : 'Start'} with ch. {fmt(next.num)}
          </ReadButton>
        </div>
      )}
      {cur === 'md' && chs?.status === 'ready' && chs.list.chapters.length > 0 && !next && <p className="hint">You're caught up on this source.</p>}
      {l?.tpl && <LinkContinue x={x} l={l} i={i} shown={shown} />}
      <div className="chips">
        {vis.map((q) => (
          <span key={q.k} className={`chip src${cur === q.k ? ' on' : ''}`}>
            {cur === q.k && (
              <button
                className="hide"
                aria-label={`Hide ${q.n}`}
                onClick={() => {
                  setHidden(x.id, q.k, true);
                  toast('Hidden. Bring it back from + Source');
                }}
              >
                ×
              </button>
            )}
            <button aria-pressed={cur === q.k} onClick={() => updateSeries(x.id, () => ({ src: q.k }))}>
              {q.n}
            </button>
          </span>
        ))}
        <button className="chip" onClick={() => setSheet('addsrc')}>
          + Source
        </button>
      </div>
      {body}
      <div className="pad end">
        <button
          className="btn danger sm"
          onClick={() => {
            if (confirm('Remove this series from My Series?')) removeSeries(x.id);
          }}
        >
          Remove from My Series
        </button>
      </div>
      {sheet === 'addsrc' && <AddSourceSheet x={x} onClose={() => setSheet(null)} />}
      {sheet === 'names' && <NamesSheet x={x} onClose={() => setSheet(null)} />}
    </>
  );
}

/** The MangaDex source: its chapter list, with the ones up to `shown` marked read. */
function MangaDexSource({ x, chs, shown }: { x: SeriesT; chs: ChaptersState | null; shown: number }) {
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
    list = (
      <ChapterRows
        all={chs.list.chapters}
        row={(c) => (
          <ReadButton key={c.id} x={x} c={c} className={`ch${c.num <= shown ? ' read' : ''}`}>
            <b>Ch. {fmt(c.num)}</b>
            <span>{chapterNote(c)}</span>
          </ReadButton>
        )}
      />
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

/** Opens link source `l` in the app, or in the browser for sites set to that: its series page, the chapter after `shown`, or the saved link. */
function useOpenLink(x: SeriesT, l: Link, i: number, shown: number) {
  const { navigate, toast } = useApp();
  return (mode: 'page' | 'cont' | 'resume') => {
    const site = host(l.url);
    const n = mode === 'cont' ? nextWhole(shown) : mode === 'resume' ? l.rn || 0 : 0;
    const url = mode === 'resume' ? l.resume || '' : n && l.tpl ? chapterLink(l.tpl, n) : '';
    if (opensInBrowser(site)) {
      window.open(url || l.url, '_blank', 'noopener');
      return toast(n ? `Opened chapter ${fmt(n)} in the browser` : 'Opened in the browser', true);
    }
    navigate({ name: 'frame', id: x.id, i, ch: n, url });
  };
}

/** A link source's Continue, shown above the source chips like MangaDex's. */
function LinkContinue({ x, l, i, shown }: { x: SeriesT; l: Link; i: number; shown: number }) {
  const open = useOpenLink(x, l, i, shown);
  return (
    <div className="pad">
      <button className="btn" onClick={() => open('cont')}>
        Continue with ch. {nextWhole(shown)}
      </button>
    </div>
  );
}

/** A link-only source: open it in the app or the browser, update the chapter from a copied link, and its settings under More. */
function LinkSource({ x, l, i, shown }: { x: SeriesT; l: Link; i: number; shown: number }) {
  const { toast } = useApp();
  const site = host(l.url);
  const ob = useOpensInBrowser(site);
  const open = useOpenLink(x, l, i, shown);

  return (
    <div className="pad">
      {l.resume && (
        <button className="btn" onClick={() => open('resume')}>
          Resume ch. {fmt(l.rn || 0)} (saved link)
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
  const sheet = useSheet(onClose);
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
    sheet.close();
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
    sheet.close();
  };

  const results = res?.state === 'done' ? res.value : [];
  return (
    <Sheet label="Add a source" sheet={sheet}>
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
                sheet.close();
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
      <button className="btn ghost" onClick={sheet.close}>
        Close
      </button>
    </Sheet>
  );
}

function NamesSheet({ x, onClose }: { x: SeriesT; onClose: () => void }) {
  const { toast } = useApp();
  const sheet = useSheet(onClose);
  const names = useLoad(x.md, () => mangadex.names(x.md!));
  const [text, setText] = useState(x.title);

  const rename = (t: string) => {
    updateSeries(x.id, () => ({ title: t }));
    sheet.close();
    toast('Name changed');
  };

  return (
    <Sheet label="Change name" sheet={sheet}>
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
      <button className="btn ghost" onClick={sheet.close}>
        Close
      </button>
    </Sheet>
  );
}
