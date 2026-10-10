import type { ReactNode } from 'react';
import type { SearchResult } from '../lib/types';

export const NOT_WEB = 'That is not a web link. Paste a link that starts with https://';

/** A search result row. `extra` follows the title; `children` is the action button. */
export function ResultRow({ o, extra, children }: { o: SearchResult; extra?: ReactNode; children: ReactNode }) {
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
