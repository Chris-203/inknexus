import { useEffect, useState, type CSSProperties } from 'react';
import { useApp, type View } from '../context';
import { ResetZoom } from '../components/ResetZoom';
import { pasteChapterLink } from '../lib/actions';
import { getFrameZoom, nextZoom, setFrameZoom } from '../lib/frameZoom';
import { fmt, host, nextWhole } from '../lib/links';
import { setLast, useStore } from '../lib/store';

type FrameView = Extract<View, { name: 'frame' }>;

/** A link-only source's own page, shown in the app. InkNexus never reads or copies its content. */
export function Frame({ view }: { view: FrameView }) {
  const { navigate, goBack, toast } = useApp();
  const { lib } = useStore();
  const x = lib.find((s) => s.id === view.id);
  const l = x?.links[view.i];
  const u = view.url || l?.url || '';
  const site = host(u);
  const [fz, setFz] = useState(() => getFrameZoom(site));

  useEffect(() => {
    if (!l) navigate({ name: 'library' }, true);
  }, [l, navigate]);
  if (!x || !l) return null;

  const next = () => {
    if (!l.tpl) return;
    const n = view.ch + 1;
    setLast(x.id, Math.max(x.last || 0, view.ch));
    toast(`Chapter ${fmt(view.ch)} marked read`);
    navigate({ ...view, ch: n, url: l.tpl.replace('{n}', String(n)) }, true);
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
        <b>{l.label || host(l.url)}</b>
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
