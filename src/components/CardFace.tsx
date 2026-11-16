import { ShelfCover } from './ShelfCover';
import { fmt } from '../lib/format';
import type { Series } from '../lib/types';
import { freshOf } from '../lib/updates';

/** A My Series card's cover, badges and title, on the shelf and lifted over it by its menu. */
export function CardFace({ x }: { x: Series }) {
  const last = x.last || 0;
  const fresh = freshOf(x);
  return (
    <>
      {x.cover ? <ShelfCover url={x.cover} /> : <span className="cover" />}
      <span className="badges">
        {last > 0 && <span className="badge">Ch. {fmt(last)}</span>}
        {fresh?.n ? (
          <span className="badge new">
            {fresh.n}
            {fresh.more ? '+' : ''} new
          </span>
        ) : null}
      </span>
      <span className="ct">{x.title}</span>
    </>
  );
}
