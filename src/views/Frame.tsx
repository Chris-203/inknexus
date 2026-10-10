import { useState, type CSSProperties } from 'react';
import { useApp, type View } from '../context';
import { ResetZoom } from '../components/ResetZoom';
import { fmt } from '../lib/format';
import { chapterLink, host, linkName, nextWhole } from '../lib/links';
import { pasteChapterLink } from '../lib/pasteLink';
import { getFrameZoom, nextZoom, setFrameZoom } from '../lib/siteSettings';
import { setLast } from '../lib/store';
import type { Series } from '../lib/types';

/** A link-only source's own page, shown in the app. InkNexus never reads or copies its content. */
export function Frame({ x, view }: { x: Series; view: Extract<View, { name: 'frame' }> }) {
  const { navigate, goBack, toast } = useApp();
  const l = x.links[view.i]!;
  const u = view.url || l.url;
  const site = host(u);
  const [fz, setFz] = useState(() => getFrameZoom(site));

  const next = () => {
    if (!l.tpl) return;
    setLast(x.id, Math.max(x.last || 0, view.ch));
    toast(`Chapter ${fmt(view.ch)} marked read`);
    navigate({ ...view, ch: view.ch + 1, url: chapterLink(l.tpl, view.ch + 1) }, true);
  };
  const plusOne = () => {
    const n = nextWhole(x.last || 0);
    setLast(x.id, n);
    toast(`Now on chapter ${fmt(n)}`);
  };
  // The site is laid out narrower and scaled back up to fill the screen, like the browser's text zoom.
  const zoom = () => {
    const z = nextZoom(fz);
    setFz(z);
    setFrameZoom(site, z);
    toast(`Site zoom ${Math.round(z * 100)}%`);
  };
  const pct = Math.round(fz * 100);

  return (
    <div className="fview">
      <div className="rbar">
        <button className="ibtn" aria-label="Back to series" onClick={() => goBack({ name: 'series', id: x.id })}>
          ‹
        </button>
        <b>{linkName(l)}</b>
        {view.ch && l.tpl ? (
          <button className="ibtn txt" aria-label="Mark read and open next chapter" onClick={next}>
            Next ›
          </button>
        ) : (
          <button className="ibtn txt" aria-label="Mark next chapter read" onClick={plusOne}>
            +1 ch
          </button>
        )}
        <button className="ibtn txt" aria-label="Update chapter from copied link" onClick={() => void pasteChapterLink(x.id, view.i, toast)}>
          Paste
        </button>
        <button className="ibtn txt" aria-label={`Site zoom ${pct}%, tap for ${Math.round(nextZoom(fz) * 100)}%`} onClick={zoom}>
          {pct}%
        </button>
        <a className="ibtn" href={u} target="_blank" rel="noopener noreferrer" aria-label="Open in browser" title="Open in browser">
          ↗
        </a>
      </div>
      <div className="fwrap">
        <iframe
          className="frame"
          style={{ '--fz': fz } as CSSProperties}
          src={u}
          sandbox="allow-scripts allow-same-origin allow-forms"
          referrerPolicy="no-referrer"
          title={x.title}
        />
      </div>
      <ResetZoom />
    </div>
  );
}
