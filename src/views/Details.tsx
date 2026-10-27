import { useState } from 'react';
import { useApp } from '../context';
import { imageSrc } from '../lib/api';
import { norm, plural } from '../lib/format';
import { addSeries, updateSeries, useStore } from '../lib/store';
import type { SearchResult } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import * as mangadex from '../sources/mangadex';
import * as anilist from '../sources/anilist';

/** A Browse result before it is added: tags, status, chapter count and the whole synopsis, with Add to My Series. */
export function Details({ o }: { o: SearchResult }) {
  const { navigate, goBack, toast } = useApp();
  const { lib } = useStore();
  const [adding, setAdding] = useState(false);
  const more = useLoad(`${o.src}:${o.ref}`, () => (o.src === 'md' ? mangadex.details(String(o.ref)) : anilist.details(Number(o.ref))));
  const ex = o.src === 'md' ? lib.find((x) => x.md === o.ref) : lib.find((x) => x.al === o.ref || norm(x.title) === norm(o.title));

  const add = async () => {
    setAdding(true);
    const n = addSeries({ title: o.title, cover: o.cover, md: o.src === 'md' ? String(o.ref) : null, al: o.src === 'al' ? o.ref : null, links: o.links || [] });
    let msg = 'Added to My Series';
    if (o.src === 'al') {
      try {
        const hit = (await mangadex.search(o.title)).find((k) => norm(k.title) === norm(o.title));
        if (hit) {
          updateSeries(n.id, () => ({ md: String(hit.ref) }));
          msg = 'Added. Found it on MangaDex too';
        }
      } catch {
        // MangaDex is optional here: the series is added with its AniList links either way.
      }
    }
    toast(msg);
    // Replaces this screen, so going back from the series returns to Browse.
    navigate({ name: 'series', id: n.id }, true);
  };

  let facts;
  if (more?.state === 'error') facts = <p className="sub">Could not load more about this series ({more.error}). Go back and open it again.</p>;
  else if (more?.state === 'done') {
    const d = more.value;
    const line = [d.status, d.year, d.chapters && `${plural(d.chapters, 'chapter')}${o.src === 'md' ? ' in English' : ''}`].filter(Boolean).join(' · ');
    facts = (
      <>
        {d.authors.length > 0 && <div className="sub">By {d.authors.join(', ')}</div>}
        {line && <div className="sub">{line}</div>}
      </>
    );
  } else facts = <p className="sub">Loading…</p>;
  const tags = more?.state === 'done' ? more.value.tags : [];

  return (
    <>
      <div className="backbar">
        <button className="ibtn" aria-label="Back" onClick={() => goBack({ name: 'search' })}>
          ‹
        </button>
      </div>
      <div className="top">
        {o.cover ? <img className="cover" src={imageSrc(o.cover)} referrerPolicy="same-origin" alt="" /> : <span className="cover" />}
        <div className="info">
          <h2>{o.title}</h2>
          <div className="sub">On {o.src === 'md' ? 'MangaDex' : 'AniList'}</div>
          {facts}
          {ex ? (
            <button className="btn add" onClick={() => navigate({ name: 'series', id: ex.id })}>
              Open in My Series
            </button>
          ) : (
            <button className="btn add" disabled={adding} onClick={() => void add()}>
              Add to My Series
            </button>
          )}
        </div>
      </div>
      {tags.length > 0 && (
        <ul className="tags" aria-label="Tags">
          {tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <p className="about">{o.desc || 'No synopsis yet.'}</p>
    </>
  );
}
