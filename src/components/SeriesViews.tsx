import type { DOMAttributes } from 'react';
import { CardFace } from './CardFace';
import { RowContinue } from './RowContinue';
import { ShelfCover } from './ShelfCover';
import { daysAgo, fmt } from '../lib/format';
import { shelfName, shelfOf, useLibraryView } from '../lib/libraryView';
import type { Series } from '../lib/types';
import { freshOf } from '../lib/updates';

/**
 * My Series' series as cards or a list. `press` gives what pressing each one does, and `picked` the ids picked while
 * selecting. With `shelves`, as for search results, each one also says which shelf it is on.
 */
export function SeriesViews({
  shown,
  shelves,
  picked,
  press,
}: {
  shown: Series[];
  shelves?: boolean;
  picked: string[] | null;
  press: (x: Series) => DOMAttributes<HTMLElement>;
}) {
  const view = useLibraryView();
  return (
    // Both views stay mounted, the other one laid out but hidden under this one, so a switch shows covers already
    // loaded instead of new images that each flash a gray box first.
    <div className="views">
      <div className={view === 'list' ? 'lrows' : 'lrows off'} inert={view !== 'list'}>
        {shown.map((x) => {
          const last = x.last || 0;
          const fresh = freshOf(x);
          const on = picked?.includes(x.id);
          return (
            <div key={x.id} className={`lrow${on ? ' on' : ''}`}>
              <button className="lmain" aria-pressed={picked ? on : undefined} {...press(x)}>
                {x.cover ? <ShelfCover url={x.cover} /> : <span className="thumb" />}
                <span className="linfo">
                  <b>{x.title}</b>
                  <span>
                    {last > 0 ? `Ch. ${fmt(last)}` : 'Not started'}
                    {fresh?.n ? (
                      <em>
                        {' · '}
                        {fresh.n}
                        {fresh.more ? '+' : ''} new
                      </em>
                    ) : null}
                  </span>
                  {shelves || last > 0 ? (
                    <span>
                      {shelves && shelfName(shelfOf(x))}
                      {shelves && last > 0 && ' · '}
                      {last > 0 && `Last read ${daysAgo(x.t)}`}
                    </span>
                  ) : null}
                </span>
                {picked && (
                  <span className="tick" aria-hidden="true">
                    {on && '✓'}
                  </span>
                )}
              </button>
              {!picked && <RowContinue x={x} />}
            </div>
          );
        })}
      </div>
      <div className={view === 'cards' ? 'grid' : 'grid off'} inert={view !== 'cards'}>
        {shown.map((x) => {
          const on = picked?.includes(x.id);
          return (
            <button key={x.id} className={`card${on ? ' on' : ''}`} aria-pressed={picked ? on : undefined} {...press(x)}>
              <CardFace x={x} />
              {shelves && <span className="cs">{shelfName(shelfOf(x))}</span>}
              {picked && (
                <span className="tick" aria-hidden="true">
                  {on && '✓'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
