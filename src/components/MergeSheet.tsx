import { useState } from 'react';
import { ResultRow } from './ResultRow';
import { Sheet, useSheet } from './Sheet';
import { useApp } from '../context';
import { fmt, norm } from '../lib/format';
import { linkName } from '../lib/links';
import { mergeSeries, moveLink, useStore } from '../lib/store';
import type { Series as SeriesT } from '../lib/types';

/**
 * Merge series `x` into another one in My Series, or with `i`, move its link source `i` to another series or a new one.
 * For a series that is in My Series twice, or a link the Webtoon import put on the wrong series.
 */
export function MergeSheet({ x, i, onClose }: { x: SeriesT; i?: number; onClose: () => void }) {
  const { navigate, toast } = useApp();
  const { lib } = useStore();
  const sheet = useSheet(onClose);
  const [q, setQ] = useState('');
  const l = i === undefined ? null : x.links[i]!;
  const others = lib.filter((y) => y.id !== x.id && norm(y.title).includes(norm(q)));
  const name = q.trim() || x.title;

  const pick = (into: SeriesT | null) => {
    sheet.close();
    if (!l) {
      mergeSeries(x.id, into!.id);
      navigate({ name: 'series', id: into!.id }, true);
      return toast(`Merged into ${into!.title}`);
    }
    const id = moveLink(x.id, i!, into?.id ?? null, name);
    toast(`Moved ${linkName(l)} to ${into?.title ?? name}`);
    if (!into) navigate({ name: 'series', id });
  };

  return (
    <Sheet label={l ? 'Move to another series' : 'Merge into another series'} sheet={sheet}>
      <h2>{l ? `Move ${linkName(l)} to another series` : 'Merge into another series'}</h2>
      <p className="hint">
        {l
          ? `Moves this link and its chapter to the series you pick, or to a new one. ${x.title} keeps its other sources.`
          : `For a series that is in My Series twice. The one you pick takes this one's sources and the further last chapter, and ${x.title} is removed.`}
      </p>
      <div className="stack">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find in My Series" aria-label="Find in My Series" />
      </div>
      {l && (
        <button className="btn ghost" onClick={() => pick(null)}>
          Move to a new series named “{name}”
        </button>
      )}
      {!others.length && <p className="hint">No other series in My Series{q.trim() ? ' with that name' : ''}.</p>}
      {others.map((y) => (
        <ResultRow key={y.id} o={y} extra={<p>{y.last ? `Ch. ${fmt(y.last)} read` : 'Not started'}</p>}>
          <button className="btn sm" onClick={() => pick(y)}>
            {l ? 'Move' : 'Merge'}
          </button>
        </ResultRow>
      ))}
      <button className="btn ghost" onClick={sheet.close}>
        Close
      </button>
    </Sheet>
  );
}
