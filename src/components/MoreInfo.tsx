import type { ReactNode } from 'react';
import type { Ranking } from '../lib/types';
import type { Load } from '../lib/useLoad';

/**
 * More about a series folded under More info, or with `open` unfolded and scrolled to: `children`, then its AniList score,
 * popularity and rankings. Without `children`, nothing shows while the rankings load or when the series is not on AniList.
 */
export function MoreInfo({ r, open, children }: { r: Load<Ranking> | null; open?: boolean; children?: ReactNode }) {
  let rank: ReactNode = null;
  if (r?.state === 'error') rank = <p className="hint">Could not load AniList rankings ({r.error}). Go back and open this series again.</p>;
  else if (r?.state === 'done' && (r.value.score || r.value.lists || r.value.ranks.length))
    rank = (
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
    );
  if (!rank && !children) return null;
  return (
    <details className="more info" open={open} ref={open ? reveal : undefined}>
      <summary>More info</summary>
      <div className="pad">
        {children}
        {rank}
      </div>
    </details>
  );
}

function reveal(el: HTMLElement | null) {
  el?.scrollIntoView({ block: 'center' });
}
