import type { Ranking, SavedRanking, Series } from './types';
import { updateSeries } from './store';
import { useLoad, type Load } from './useLoad';
import * as anilist from '../sources/anilist';

/** How long a ranking saved with a series is shown as is before it is loaded again. */
export const RANKING_TTL = 7 * 864e5;

/** The ranking saved with `x` for AniList id `al` while it is less than RANKING_TTL old. */
export function freshRanking(x: Series | undefined, al: number | undefined, now = Date.now()): SavedRanking | undefined {
  const r = x?.info;
  return r && r.al === al && now - r.at < RANKING_TTL ? r : undefined;
}

/**
 * The AniList ranking for series `x` (one in the library, or undefined for a Browse result) or AniList id `al`, such as the one
 * `seriesDetails()` found. A ranking saved with `x` shows at once; once it is a week old it is loaded again and saved with `x`,
 * and shown meanwhile, or if loading fails.
 */
export function useRanking(x: Series | undefined, al?: number | null): Load<Ranking> | null {
  const id = al || x?.info?.al || Number(x?.al) || undefined;
  const res = useLoad(id && !freshRanking(x, id) ? `${x?.id}:${id}` : null, async () => {
    const r = await anilist.ranking(id!);
    if (x) updateSeries(x.id, () => ({ info: { ...r, al: id!, at: Date.now() } }));
    return r;
  });
  const saved = x?.info?.al === id ? x?.info : undefined;
  if (saved && res?.state !== 'done') return { state: 'done', value: saved };
  return res;
}
