import { saveRanking, savedRanking } from './details';
import type { Ranking, SavedRanking, Series } from './types';
import { updateSeries } from './store';
import { useLoad, type Load } from './useLoad';
import * as anilist from '../sources/anilist';
import * as mangadex from '../sources/mangadex';

/** How long a ranking saved with a series is shown as is before it is loaded again. */
export const RANKING_TTL = 7 * 864e5;

/** The ranking saved with `x` for AniList id `al` while it is less than RANKING_TTL old. */
export function freshRanking(x: Series | undefined, al: number | undefined, now = Date.now()): SavedRanking | undefined {
  const r = x?.info;
  return r && r.al === al && now - r.at < RANKING_TTL ? r : undefined;
}

/**
 * The AniList ranking for series `x` (one in the library, or undefined for a Browse result) or AniList id `al`.
 * Without an id, it asks MangaDex which AniList entry the series links to. A ranking saved with `x` shows at once;
 * once it is a week old it is loaded again and saved with `x`, and shown meanwhile, or if loading fails. A Browse
 * result's ranking is saved with its details for a day, so opening it again shows it at once.
 */
export function useRanking(x: Series | undefined, al?: number | null): Load<Ranking> | null {
  const known = al || x?.info?.al || Number(x?.al) || undefined;
  const look = useLoad(!known && x?.md ? x.md : null, () => mangadex.aniListId(x!.md!));
  const id = known || (look?.state === 'done' ? look.value : undefined);
  const res = useLoad(
    id && !freshRanking(x, id) ? `${x?.id}:${id}` : null,
    async () => {
      const r = await anilist.ranking(id!);
      if (x) updateSeries(x.id, () => ({ info: { ...r, al: id!, at: Date.now() } }));
      else saveRanking(id!, r);
      return r;
    },
    () => (x ? undefined : savedRanking(id!)),
  );
  const saved = x?.info?.al === id ? x?.info : undefined;
  if (saved && res?.state !== 'done') return { state: 'done', value: saved };
  if (look?.state === 'error') return { state: 'error', error: look.error };
  return res;
}
