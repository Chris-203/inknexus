import type { ReactNode } from 'react';
import { chapterNote, fmt, plural, shortDate } from '../lib/format';
import { toggleSort, useStore } from '../lib/store';
import type { Chapter } from '../lib/types';

/**
 * A loaded MangaDex chapter list under a header that stays in view with its count and sort button, oldest or newest
 * first as the library sorts. Each row shows the chapter with its title, group and date, and Read; chapters up to
 * `shown` look read. `tools` adds buttons to the header, before the sort.
 */
export function ChapterRows({
  all,
  shown = 0,
  disabled,
  open,
  tools,
}: {
  all: Chapter[];
  shown?: number;
  disabled?: boolean;
  open: (c: Chapter) => void;
  tools?: ReactNode;
}) {
  const { sort } = useStore();
  const asc = sort === 'asc';
  const first = all[0]!;
  return (
    <>
      <div className="chhead">
        <span>{plural(all.length, 'chapter')}</span>
        {tools}
        <button className="chsort" aria-label={`Sort: ${asc ? 'oldest' : 'newest'} first`} onClick={toggleSort}>
          {asc ? 'Oldest' : 'Newest'}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 4v16M4 16l4 4 4-4M16 20V4M12 8l4-4 4 4" />
          </svg>
        </button>
      </div>
      {first.num > 1 && <p className="hint">Chapters before {fmt(first.num)} are not on MangaDex. Try another source for those.</p>}
      {(asc ? all : [...all].reverse()).map((c) => (
        <div key={c.id} className="chrow">
          <button className={`ch${c.num <= shown ? ' read' : ''}`} disabled={disabled} onClick={() => open(c)}>
            {chapterText(c)}
            <span className="pill">Read</span>
          </button>
        </div>
      ))}
    </>
  );
}

/** A chapter row's text: its number, then its title and group, then its date. */
export function chapterText(c: Chapter): ReactNode {
  return (
    <span className="chtxt">
      <b>Ch. {fmt(c.num)}</b>
      {chapterNote(c) && <span>{chapterNote(c)}</span>}
      {c.date && <span>{shortDate(c.date)}</span>}
    </span>
  );
}
