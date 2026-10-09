import { useEffect } from 'react';
import { useApp, type View } from '../context';
import { pasteChapterLink } from '../lib/actions';
import { fmt, host } from '../lib/links';
import { setLast, useStore } from '../lib/store';

type FrameView = Extract<View, { name: 'frame' }>;
const small = { width: 'auto', padding: '0 10px', fontSize: 13 } as const;

/** A link-only source's own page, shown in the app. InkNexus never reads or copies its content. */
export function Frame({ view }: { view: FrameView }) {
  const { navigate, toast } = useApp();
  const { lib } = useStore();
  const x = lib.find((s) => s.id === view.id);
  const l = x?.links[view.i];

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
  const plusOne = () => {
    const n = Math.floor(x.last || 0) + 1;
    setLast(x.id, n);
    toast('Now on chapter ' + n);
  };

  return (
    <>
      <div className="rbar">
        <button aria-label="Back to series" onClick={() => navigate({ name: 'series', id: x.id, src: view.src })}>
          ‹
        </button>
        <b>{l.label || host(l.url)}</b>
        {view.ch && l.tpl ? (
          <button aria-label="Mark read and open next chapter" style={small} onClick={next}>
            Next ›
          </button>
        ) : (
          <button aria-label="Mark next chapter read" style={small} onClick={plusOne}>
            +1 ch
          </button>
        )}
        <button aria-label="Update chapter from copied link" style={small} onClick={() => void pasteChapterLink(x.id, view.i, toast)}>
          Paste
        </button>
        <a className="btn sm" href={u} target="_blank" rel="noopener noreferrer">
          Browser
        </a>
      </div>
      <iframe className="frame" src={u} sandbox="allow-scripts allow-same-origin allow-forms" referrerPolicy="no-referrer" title={x.title} />
    </>
  );
}
