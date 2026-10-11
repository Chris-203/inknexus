import type { ReactNode } from 'react';
import type { SearchResult } from '../lib/types';

/** A row with a cover and a title, used for search results and series. `extra` follows the title; `children` is the action button. */
export function ResultRow({ o, extra, children }: { o: Pick<SearchResult, 'cover' | 'title'>; extra?: ReactNode; children?: ReactNode }) {
  return (
    <div className="res">
      {o.cover ? <img src={o.cover} loading="lazy" alt="" /> : <span className="thumb" />}
      <div>
        <b>{o.title}</b>
        {extra}
      </div>
      {children}
    </div>
  );
}
