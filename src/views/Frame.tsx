import { useEffect, useState, type CSSProperties } from 'react';
import { useApp, type View } from '../context';
import { HouseIcon } from '../components/HouseIcon';
import { TopBar } from '../components/TopBar';
import { fmt } from '../lib/format';
import { chapterLink, host, linkName, nextWhole, stepChapter } from '../lib/links';
import { getFrameZoom, setFrameZoom, stepZoom, ZOOM_STEPS } from '../lib/siteSettings';
import { setLast } from '../lib/store';
import type { Series } from '../lib/types';

/** A link-only source's own page, shown in the app. InkNexus never reads or copies its content. */
export function Frame({ x, view }: { x: Series; view: Extract<View, { name: 'frame' }> }) {
  const { navigate, goBack, toast } = useApp();
  const l = x.links[view.i]!;
  const u = view.url || l.url;
  const site = host(u);
  const [fz, setFz] = useState(() => getFrameZoom(site));
  // When the bar was last shown, or 0 while it is hidden. Showing it again restarts the timer below.
  const [shownAt, setShownAt] = useState(() => Date.now());
  const showBar = () => setShownAt(Date.now());

  // The site's scroll position is walled off from the app, so the bar cannot follow it. Instead it shows when a page
  // of the site loads (pages start at the top) and from the corner button, and hides once the site is tapped (the app
  // loses focus to it) or, where the browser does not report that, after a few seconds.
  useEffect(() => {
    if (!shownAt) return;
    const hide = () => setShownAt(0);
    const timer = setTimeout(hide, 5000);
    addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      removeEventListener('blur', hide);
    };
  }, [shownAt]);

  const prevCh = stepChapter(view.ch, -1);
  const toChapter = (n: number) => navigate({ ...view, ch: n, url: chapterLink(l.tpl!, n) }, true);
  const next = () => {
    if (!l.tpl) return;
    setLast(x.id, Math.max(x.last || 0, view.ch));
    toast(`Chapter ${fmt(view.ch)} marked read`);
    toChapter(view.ch + 1);
  };
  const plusOne = () => {
    const n = nextWhole(x.last || 0);
    setLast(x.id, n);
    toast(`Now on chapter ${fmt(n)}`);
  };
  // The site is laid out narrower and scaled back up to fill the screen, like the browser's text zoom.
  const zoom = (d: number) => {
    const z = stepZoom(fz, d);
    setFz(z);
    setFrameZoom(site, z);
    toast(`Site zoom ${Math.round(z * 100)}%`);
  };

  return (
    <div className="fview">
      <TopBar off={!shownAt} over>
        <div className="chnav">
          {view.ch && l.tpl ? (
            <>
              <button aria-label={`Chapter ${fmt(prevCh)}`} onClick={() => toChapter(prevCh)}>
                ‹
              </button>
              <b>Ch. {fmt(view.ch)}</b>
              <button aria-label="Mark read and open next chapter" onClick={next}>
                ›
              </button>
            </>
          ) : (
            <>
              <b>{linkName(l)}</b>
              <button className="txt" aria-label="Mark next chapter read" onClick={plusOne}>
                +1 ch
              </button>
            </>
          )}
        </div>
        <div className="rtools" role="toolbar" aria-label="Site" aria-orientation="vertical">
          <button className="ibtn" aria-label="Back to series" onClick={() => goBack({ name: 'series', id: x.id })}>
            <HouseIcon />
          </button>
          <button className="ibtn" aria-label="Zoom in" disabled={fz === ZOOM_STEPS.at(-1)} onClick={() => zoom(1)}>
            +
          </button>
          <button className="ibtn" aria-label="Zoom out" disabled={fz === ZOOM_STEPS[0]} onClick={() => zoom(-1)}>
            −
          </button>
          <a className="ibtn" href={u} target="_blank" rel="noopener noreferrer" aria-label="Open in browser" title="Open in browser">
            ↗
          </a>
        </div>
      </TopBar>
      <div className="fwrap">
        <iframe
          className="frame"
          style={{ '--fz': fz } as CSSProperties}
          src={u}
          sandbox="allow-scripts allow-same-origin allow-forms"
          referrerPolicy="no-referrer"
          title={x.title}
          onLoad={showBar}
        />
      </div>
      {!shownAt && (
        <button id="showbar" className="ibtn float" aria-label="Show the controls" onClick={showBar}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      )}
    </div>
  );
}
