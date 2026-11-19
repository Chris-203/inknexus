import { useState, type ReactNode } from 'react';
import { ChapterRows } from './ChapterRows';
import { DownloadSheet } from './DownloadSheet';
import { useReadChapter } from './ReadButton';
import { retryChapters, type ChaptersState } from '../lib/chapters';
import { useDownloads } from '../lib/downloads';
import { plural } from '../lib/format';
import type { Series as SeriesT } from '../lib/types';
import * as mangadex from '../sources/mangadex';

/** The MangaDex source: its chapter list, with the ones up to `shown` marked read, and a button to choose chapters to save offline. */
export function MangaDexSource({ x, chs, shown }: { x: SeriesT; chs: ChaptersState | null; shown: number }) {
  const { can, saved } = useDownloads();
  const read = useReadChapter();
  const [picking, setPicking] = useState(false);
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
    list = (
      <>
        <ChapterRows
          all={all}
          shown={shown}
          open={(c) => read(x.id, c)}
          saved={(c) => saved.some((d) => d.c.id === c.id)}
          tools={
            can &&
            all.some((c) => !c.ext) && (
              <button className="ibtn plain" aria-label="Download chapters" onClick={() => setPicking(true)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
                </svg>
              </button>
            )
          }
        />
        {picking && <DownloadSheet x={x} all={all} onClose={() => setPicking(false)} />}
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
