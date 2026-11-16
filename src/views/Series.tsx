import { useState, type ReactNode } from 'react';
import { useApp } from '../context';
import { About } from '../components/About';
import { AddSourceSheet } from '../components/AddSourceSheet';
import { LinkMenuSheet } from '../components/LinkMenuSheet';
import { LinkOpen } from '../components/LinkOpen';
import { MangaDexSource } from '../components/MangaDexSource';
import { MergeSheet } from '../components/MergeSheet';
import { MoreInfo } from '../components/MoreInfo';
import { MoreLikeThis } from '../components/MoreLikeThis';
import { NamesSheet } from '../components/NamesSheet';
import { ReadButton } from '../components/ReadButton';
import { SourceChips } from '../components/SourceChips';
import { Trailer } from '../components/Trailer';
import { imageSrc } from '../lib/api';
import { useChapters } from '../lib/chapters';
import { seriesDetails } from '../lib/details';
import { fmt } from '../lib/format';
import { useLastField } from '../lib/lastField';
import { linkName, stepChapter } from '../lib/links';
import { continueChapter } from '../lib/preload';
import { useRanking } from '../lib/ranking';
import { leftChapter } from '../lib/spots';
import { removeSeries, setLast, shownSource, sourcesOf } from '../lib/store';
import { useSwipe } from '../lib/swipe';
import type { Series as SeriesT } from '../lib/types';
import { useLoad } from '../lib/useLoad';

export function Series({ x, info }: { x: SeriesT; info?: boolean }) {
  const { goBack } = useApp();
  const [sheet, setSheet] = useState<'addsrc' | 'names' | 'merge' | 'menu' | 'move' | null>(null);
  const field = useLastField(x);
  const swipe = useSwipe(
    (dir) => dir === 1,
    () => goBack({ name: 'library' }),
    true,
  );

  const cur = shownSource(x);
  // Loaded while another source is shown too, so switching to MangaDex shows its chapters at once.
  const chs = useChapters(x.mdh ? null : x.md);
  // The series page's own, whichever source is shown: found by the series' AniList and MangaDex ids, or else by its name.
  const like = { title: x.title, al: Number(x.al) || null, md: x.md };
  const more = useLoad(`${like.al}|${like.md}|${like.title}`, () => seriesDetails(like));
  const al = more?.state === 'done' ? more.value?.al : undefined;
  const rank = useRanking(x, al);

  const last = x.last || 0;
  // While the field is being typed in, Continue and the read marks show what it would become.
  const shown = field.shown;

  // The chapter to read on MangaDex, once its list is loaded: one left part way, unless it is older than the last one read,
  // otherwise the next one. A link source has Continue once it knows its chapter link pattern.
  const list = cur === 'md' && chs?.status === 'ready' ? chs.list.chapters : [];
  const left = leftChapter(x.id) ?? -1;
  const next = continueChapter(list, shown, left);
  const i = cur.startsWith('l') ? +cur.slice(1) : -1;
  const l = x.links[i];
  let body: ReactNode;
  if (cur === 'md') body = <MangaDexSource x={x} chs={chs} shown={shown} />;
  else if (!l)
    body = <p className="hint">{sourcesOf(x).length ? 'All sources are hidden. Bring one back with + Source.' : 'No sources yet. Add one with + Source.'}</p>;

  return (
    <div ref={swipe}>
      <div className="backbar">
        <button className="ibtn" aria-label="Back" onClick={() => goBack({ name: 'library' })}>
          ‹
        </button>
        {l && (
          <button className="ibtn" aria-label={`More for ${linkName(l)}`} onClick={() => setSheet('menu')}>
            <svg className="dots" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        )}
      </div>
      <div className="top">
        {x.cover ? <img className="cover" src={imageSrc(x.cover)} referrerPolicy="same-origin" alt="" /> : <span className="cover" />}
        <div className="info">
          <h2>
            {x.title}{' '}
            <button className="ren" aria-label="Change name" onClick={() => setSheet('names')}>
              ✎
            </button>
          </h2>
          <div className="sub">Last chapter read</div>
          <div className="step">
            <button className="ibtn" aria-label="Previous chapter" onClick={() => setLast(x.id, stepChapter(last, -1))}>
              −
            </button>
            <input
              type="number"
              step="any"
              min="0"
              aria-label="Last chapter read"
              value={field.text}
              onChange={(e) => field.setText(e.target.value)}
              onBlur={field.commit}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <button className="ibtn" aria-label="Next chapter" onClick={() => setLast(x.id, stepChapter(last, 1))}>
              +
            </button>
          </div>
        </div>
      </div>
      {next && (
        <div className="pad">
          <ReadButton x={x} c={next} className="btn">
            {shown || next.num === left ? 'Continue' : 'Start'} with ch. {fmt(next.num)}
          </ReadButton>
        </div>
      )}
      {cur === 'md' && chs?.status === 'ready' && chs.list.chapters.length > 0 && !next && <p className="hint">You're caught up on this source.</p>}
      {l && <LinkOpen x={x} l={l} i={i} shown={shown} />}
      <SourceChips x={x} onAdd={() => setSheet('addsrc')} />
      <MoreInfo r={rank} open={info}>
        <About d={more} english={!!x.md} />
        <Trailer al={al} />
      </MoreInfo>
      <MoreLikeThis x={like} />
      {body}
      <div className="pad end">
        <button className="btn ghost" onClick={() => setSheet('merge')}>
          Merge into another series
        </button>
        <button
          className="btn danger sm"
          onClick={() => {
            if (confirm('Remove this series from My Series?')) removeSeries(x.id);
          }}
        >
          Remove from My Series
        </button>
      </div>
      {sheet === 'addsrc' && <AddSourceSheet x={x} onClose={() => setSheet(null)} />}
      {sheet === 'names' && <NamesSheet x={x} onClose={() => setSheet(null)} />}
      {sheet === 'merge' && <MergeSheet x={x} onClose={() => setSheet(null)} />}
      {sheet === 'menu' && l && <LinkMenuSheet x={x} l={l} i={i} onMove={() => setSheet('move')} onClose={() => setSheet(null)} />}
      {sheet === 'move' && l && <MergeSheet x={x} i={i} onClose={() => setSheet(null)} />}
    </div>
  );
}
