import type { ReactNode } from 'react';
import { useApp } from '../context';
import { fmt } from '../lib/format';
import type { Chapter, Series } from '../lib/types';

/**
 * Opens a MangaDex chapter in the reader, or on the official site when it is hosted there. `replace` swaps the
 * current history entry, for moving chapter to chapter inside the reader; `current` marks the chapter being read.
 */
export function ReadButton({
  x,
  c,
  className,
  replace,
  current,
  children,
}: {
  x: Series;
  c: Chapter;
  className: string;
  replace?: boolean;
  current?: boolean;
  children: ReactNode;
}) {
  const { navigate, toast } = useApp();
  const read = () => {
    if (!c.ext) return navigate({ name: 'reader', id: x.id, n: c.num }, replace);
    window.open(c.ext, '_blank', 'noopener');
    toast(`Chapter ${fmt(c.num)} opens on the official site`);
  };
  return (
    <button className={className} aria-current={current || undefined} onClick={read}>
      {children}
    </button>
  );
}
