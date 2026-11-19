import { useState } from 'react';
import { Sheet, useSheet } from './Sheet';
import { useApp } from '../context';
import { langName } from '../lib/names';
import { updateSeries } from '../lib/store';
import type { Series as SeriesT } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import * as mangadex from '../sources/mangadex';

/** Change series `x`'s name: to one of the names MangaDex lists for it, or a typed one. */
export function NamesSheet({ x, onClose }: { x: SeriesT; onClose: () => void }) {
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
