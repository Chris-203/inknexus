import { useEffect, useState } from 'react';
import { useApp, type View } from '../context';
import { pasteChapterLink } from '../lib/actions';
import { fmt, host } from '../lib/links';
import { setLast, useStore } from '../lib/store';
import { FZ_STEPS, getFrameZoom, setFrameZoom, stepZoom } from '../lib/frameZoom';

type FrameView = Extract<View, { name: 'frame' }>;

/** A link-only source's own page, shown in the app. InkNexus never reads or copies its content. */
export function Frame({ view }: { view: FrameView }) {
  const { navigate, toast } = useApp();
  const { lib } = useStore();
  const x = lib.find((s) => s.id === view.id);
  const l = x?.links[view.i];
  const site = host(view.url || l?.url || '');
  const [fz, setFz] = useState(() => getFrameZoom(site));

  useEffect(() => {
    if (!l) navigate({ name: 'library' }, true);
  }, [l, navigate]);
  if (!x || !l) return null;

  const u = view.url || l.url;
  const next = () => {
    const n = view.ch + 1;
    setLast(x.id, Math.max(x.last || 0, view.ch));
    toast(`Chapter ${fmt(view.ch)} marked read`);
    navigate({ ...view, ch: n, url: (l.tpl || '').replace('{n}', String(n)) }, true);
  };
  const zoom = (d: 1 | -1) => {
    const z = stepZoom(fz, d);
    setFz(z);
    setFrameZoom(site, z);
    toast(`Site zoom ${Math.round(z * 100)}%`);
  };
  const plusOne = () => {
    const n = Math.floor(x.last || 0) + 1;
    setLast(x.id, n);
    toast('Now on chapter ' + n);
  };

  return (
    <>
      <div className="rbar fbar">
        <button aria-label="Back to series" onClick={() => navigate({ name: 'series', id: x.id, src: view.src })}>
          ‹
        </button>
        <b>{l.label || host(l.url)}</b>
        {view.ch && l.tpl ? (
          <button aria-label="Mark read and open next chapter" className="sm" onClick={next}>
            Next ›
          </button>
        ) : (
          <button aria-label="Mark next chapter read" className="sm" onClick={plusOne}>
            +1 ch
          </button>
        )}
        <button aria-label="Update chapter from copied link" className="sm" onClick={() => void pasteChapterLink(x.id, view.i, toast)}>
          Paste
        </button>
        <button className="fz" aria-label="Zoom the site out" disabled={fz <= FZ_STEPS[0]} onClick={() => zoom(-1)}>
          −
        </button>
        <button className="fz" aria-label="Zoom the site in" disabled={fz >= FZ_STEPS[FZ_STEPS.length - 1]!} onClick={() => zoom(1)}>
          +
        </button>
        <a className="btn sm" href={u} target="_blank" rel="noopener noreferrer" aria-label="Open in browser" style={{ padding: '7px 10px' }}>
          Open ↗
        </a>
      </div>
      <div className="fwrap">
        <iframe
          className="frame"
          style={{ '--fz': fz } as React.CSSProperties}
          src={u}
          sandbox="allow-scripts allow-same-origin allow-forms"
          referrerPolicy="no-referrer"
          title={x.title}
        />
      </div>
    </>
  );
}
