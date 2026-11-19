import { ReadButton } from './ReadButton';
import { useApp } from '../context';
import { useChapterState } from '../lib/chapters';
import { fmt } from '../lib/format';
import { nextWhole } from '../lib/links';
import { useOpenLink } from '../lib/openLink';
import { continueChapter } from '../lib/preload';
import { leftChapter } from '../lib/spots';
import { shownSource } from '../lib/store';
import type { Link, Series } from '../lib/types';

/**
 * A list row's Continue: the chapter the series screen would continue with, in the reader or on the site. Until that is
 * known (the chapter list is still loading, the source has no chapter links, or every chapter is read) it opens the series.
 */
export function RowContinue({ x }: { x: Series }) {
  const { navigate } = useApp();
  const cur = shownSource(x);
  const chs = useChapterState(cur === 'md' ? x.md : null);
  const last = x.last || 0;
  const left = leftChapter(x.id) ?? -1;
  const c = chs?.status === 'ready' ? continueChapter(chs.list.chapters, last, left) : undefined;
  const i = cur.startsWith('l') ? +cur.slice(1) : -1;
  const l = x.links[i];
  if (c)
    return (
      <ReadButton x={x} c={c} className="btn ghost sm go">
        {last || c.num === left ? 'Continue' : 'Start'}
        <small>Ch. {fmt(c.num)}</small>
      </ReadButton>
    );
  if (l?.tpl) return <LinkRowContinue x={x} l={l} i={i} />;
  return (
    <button className="btn ghost sm go" onClick={() => navigate({ name: 'series', id: x.id })}>
      {last ? 'Continue' : 'Start'}
    </button>
  );
}

// Its own component, as only a row with a link source has a link to open.
function LinkRowContinue({ x, l, i }: { x: Series; l: Link; i: number }) {
  const open = useOpenLink(x, l, i, x.last || 0);
  return (
    <button className="btn ghost sm go" onClick={() => open('cont')}>
      Continue
      <small>Ch. {nextWhole(x.last || 0)}</small>
    </button>
  );
}
