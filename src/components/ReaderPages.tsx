import type { RefObject } from 'react';
import { imageSrc } from '../lib/api';
import type { Chapter, Page } from '../lib/types';
import * as mangadex from '../sources/mangadex';

/**
 * The reader's pages of chapter `c`, one under the other, inside the box that zooms them. `shown` says which have shown
 * or failed, and a failed one links to the chapter on MangaDex. Pages up to index `eagerTo` load at once, the rest as they come near.
 */
export function ReaderPages({
  c,
  pages,
  shown,
  eagerTo,
  wrapRef,
  pagesRef,
  onLoad,
  onError,
}: {
  c: Chapter;
  pages: Page[];
  shown: Record<number, 'done' | 'failed'>;
  eagerTo: number;
  wrapRef: RefObject<HTMLDivElement | null>;
  pagesRef: RefObject<HTMLDivElement | null>;
  onLoad: (img: HTMLImageElement, i: number) => void;
  onError: (img: HTMLImageElement, i: number, u: Page) => void;
}) {
  return (
    <div id="zwrap" ref={wrapRef}>
      <div id="pages" ref={pagesRef}>
        {pages.map((u, i) => (
          <div key={u.a} className={`pg ${shown[i] || ''}`}>
            <img
              src={imageSrc(u.a)}
              referrerPolicy="same-origin"
              loading={i <= eagerTo ? 'eager' : 'lazy'}
              decoding="async"
              alt={`Page ${i + 1}`}
              onLoad={(e) => onLoad(e.currentTarget, i)}
              onError={(e) => onError(e.currentTarget, i, u)}
            />
            {shown[i] === 'failed' ? (
              <div className="pgmsg">
                <p>Page {i + 1} failed to load.</p>
                <a className="btn" href={mangadex.chapterUrl(c.id)} target="_blank" rel="noopener noreferrer">
                  Read on MangaDex ↗
                </a>
              </div>
            ) : (
              shown[i] !== 'done' && <p className="pgmsg">Loading page {i + 1}…</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
