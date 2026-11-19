import { useState, type FormEvent } from 'react';
import { LinkFields } from './LinkFields';
import { ResultRow } from './ResultRow';
import { Sheet, useSheet } from './Sheet';
import { useApp } from '../context';
import { fmt, plural } from '../lib/format';
import { linkFrom, NOT_WEB } from '../lib/links';
import { lookFrom, setHidden, setLast, sourceFrom, sourcesOf, updateSeries } from '../lib/store';
import type { SearchResult, Series as SeriesT } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import { openWebtoonInBrowser } from '../lib/webtoon';
import * as anilist from '../sources/anilist';
import * as mangadex from '../sources/mangadex';

/** Add a source to series `x`: bring back a hidden one, match it on MangaDex or AniList, or save a link. */
export function AddSourceSheet({ x, onClose }: { x: SeriesT; onClose: () => void }) {
  const { toast } = useApp();
  const sheet = useSheet(onClose);
  const [kind, setKind] = useState<'md' | 'al' | null>(null);
  const res = useLoad(kind, () => (kind === 'md' ? mangadex.search(x.title) : anilist.search(x.title)));
  const site = kind === 'md' ? 'MangaDex' : 'AniList';
  const hidden = sourcesOf(x).filter((q) => q.h);
  // A match whose cover or name differs from the series' waits here for the choice to use them or keep the series' own.
  const [picked, setPicked] = useState<SearchResult | null>(null);

  const use = (o: SearchResult, take: boolean) => {
    const look = lookFrom(x, o, take);
    if (kind === 'md') updateSeries(x.id, (s) => ({ ...sourceFrom(s, o), ...look, src: 'md' }));
    else {
      const added = sourceFrom(x, o).links!.length - x.links.length;
      updateSeries(x.id, (s) => ({ ...sourceFrom(s, o), ...look }));
      toast(added ? `Added ${plural(added, 'official link')}` : 'No official links listed for this one');
    }
    sheet.close();
  };
  const pick = (o: SearchResult) => {
    const differs = o.title !== x.title || (x.cover && o.cover && o.cover !== x.cover);
    if (differs) setPicked(o);
    else use(o, false);
  };

  if (picked)
    return (
      <Sheet label={`Use this ${site} match`} sheet={sheet}>
        <h2>Use its cover and name?</h2>
        <ResultRow o={picked} />
        <p className="hint">
          {site} lists it as {picked.title}. Use its cover and name for this series, or keep {x.title} as it looks now.
        </p>
        <button className="btn" onClick={() => use(picked, true)}>
          Use its cover and name
        </button>
        <button className="btn ghost" onClick={() => use(picked, false)}>
          Keep the current cover and name
        </button>
        <button className="btn ghost" onClick={() => setPicked(null)}>
          Back to the results
        </button>
      </Sheet>
    );
  const onSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const made = linkFrom(String(d.get('url') || ''), String(d.get('label') || ''));
    if (!made) return toast(NOT_WEB);
    updateSeries(x.id, (s) => ({ links: [...s.links, made.link], src: 'l' + s.links.length }));
    openWebtoonInBrowser([made.link]);
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
      <button className={`btn${x.md ? ' ghost' : ''}`} onClick={() => setKind('md')}>
        {x.md ? 'Change the MangaDex match' : 'Find it on MangaDex'}
      </button>
      <button className="btn ghost" onClick={() => setKind('al')}>
        {x.al === null ? 'Find official links (AniList)' : 'Change the AniList match'}
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
            <button className="btn sm" onClick={() => pick(o)}>
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
