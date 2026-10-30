import type { Ranking } from '../lib/types';
import type { Load } from '../lib/useLoad';

/** A series' AniList score, popularity and rankings, folded under More info. Nothing shows while they load or when the series is not on AniList. */
export function MoreInfo({ r }: { r: Load<Ranking> | null }) {
  if (!r || r.state === 'busy') return null;
  if (r.state === 'done' && !r.value.score && !r.value.lists && !r.value.ranks.length) return null;
  return (
    <details className="more info">
      <summary>More info</summary>
      <div className="pad">
        {r.state === 'error' ? (
          <p className="hint">Could not load AniList rankings ({r.error}). Go back and open this series again.</p>
        ) : (
          <>
            <p className="sub">
              {['AniList', r.value.score && `Score ${r.value.score}%`, r.value.lists && `Popularity ${r.value.lists.toLocaleString('en-US')}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {r.value.ranks.length > 0 && (
              <ul className="tags ranks" aria-label="AniList rankings">
                {r.value.ranks.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </details>
  );
}
