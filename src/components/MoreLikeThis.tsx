import { moreLikeThis, savedLikeThis, type LikeOf } from '../lib/moreLikeThis';
import { useLoad } from '../lib/useLoad';
import { CardShelf } from './CardShelf';

/** "More like this": AniList's related and recommended series, opened from MangaDex where it has them, filled up with MangaDex's recommendations. */
export function MoreLikeThis({ x }: { x: LikeOf }) {
  const more = useLoad(
    `${x.al}|${x.md}|${x.title}`,
    () => moreLikeThis(x),
    () => savedLikeThis(x),
  );
  const missed = more?.state === 'done' && more.value.missed;
  return (
    <CardShelf
      title="More like this"
      what="series like this from AniList and MangaDex"
      load={more?.state === 'done' ? { state: 'done', value: more.value.list } : more}
      note={missed && <p className="hint">Only some picks: {missed}. Open this series again to try again.</p>}
    />
  );
}
