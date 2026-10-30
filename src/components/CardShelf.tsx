import type { ReactNode } from 'react';
import { useApp } from '../context';
import { imageSrc } from '../lib/api';
import type { SearchResult } from '../lib/types';
import type { Load } from '../lib/useLoad';

/**
 * A titled row of series covers that scrolls sideways, each opening its details. `what` names what failed to load in the
 * error, `note` follows the row. Nothing shows once it has loaded with no series.
 */
export function CardShelf({ title, what, load, note }: { title: string; what: string; load: Load<SearchResult[]> | null; note?: ReactNode }) {
  const { navigate } = useApp();
  if (!load || (load.state === 'done' && !load.value.length)) return null;
  return (
    <section aria-label={title}>
      <h3 className="shelfh">{title}</h3>
      {load.state === 'error' ? (
        <p className="hint">
          Could not load {what} ({load.error}). Go back and open this series again.
        </p>
      ) : load.state === 'done' ? (
        <div className="shelf">
          {load.value.map((k) => (
            <button key={`${k.src}:${k.ref}`} className="card" onClick={() => navigate({ name: 'details', o: k })}>
              {k.cover ? <img src={imageSrc(k.cover)} referrerPolicy="same-origin" loading="lazy" alt="" /> : <span className="cover" />}
              <span className="ct">{k.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="hint">Loading…</p>
      )}
      {note}
    </section>
  );
}
