import { useState } from 'react';
import { plural } from '../lib/format';
import type { Details } from '../lib/types';
import type { Load } from '../lib/useLoad';

/**
 * A series' authors and synopsis, its first lines until More is pressed, then its tags and a line of facts after `on` (such as 'On MangaDex').
 * `desc` shows while `d` loads; once loaded, its synopsis is used when `desc` is empty. `english` counts MangaDex's chapters as English ones.
 */
export function About({ desc, d, on, english }: { desc?: string; d: Load<Details | null> | null; on?: string; english?: boolean }) {
  const [open, setOpen] = useState(false);
  const v = d?.state === 'done' ? d.value : null;
  if (d?.state === 'done' && !v) return <p className="sub">Neither AniList nor MangaDex has a series by this name. Pick its match with + Source.</p>;
  const text = desc || v?.desc || '';
  const line = v && [v.status, v.year, v.chapters && `${plural(v.chapters, 'chapter')}${english ? ' in English' : ''}`, v.score && `★ ${v.score}% on AniList`];
  return (
    <>
      {v && v.authors.length > 0 && <div className="sub">{v.authors.join(', ')}</div>}
      <p className={`about${open ? ' open' : ''}`}>{text || (d?.state === 'busy' ? '' : 'No synopsis yet.')}</p>
      {text.length > 240 && (
        <button className="more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Less' : 'More'}
        </button>
      )}
      {v && v.tags.length > 0 && (
        <ul className="tags" aria-label="Tags">
          {v.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {d?.state === 'error' ? (
        <p className="sub">Could not load more about this series ({d.error}). Go back and open it again.</p>
      ) : (
        <p className="sub">{[on, ...(line || ['Loading…'])].filter(Boolean).join(' · ')}</p>
      )}
    </>
  );
}
