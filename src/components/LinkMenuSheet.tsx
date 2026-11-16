import { useRef } from 'react';
import { Sheet, useSheet } from './Sheet';
import { useApp } from '../context';
import { host, linkName } from '../lib/links';
import { pasteChapterLink } from '../lib/pasteLink';
import { setOpensInBrowser, useOpensInBrowser } from '../lib/siteSettings';
import { updateSeries } from '../lib/store';
import type { Link, Series as SeriesT } from '../lib/types';

/**
 * A link-only source's ⋮ menu: updating the chapter from a copied link (until it knows its chapter link pattern and so
 * has Continue), opening it in the browser, and moving or removing it.
 */
export function LinkMenuSheet({ x, l, i, onMove, onClose }: { x: SeriesT; l: Link; i: number; onMove: () => void; onClose: () => void }) {
  const { toast } = useApp();
  const site = host(l.url);
  const ob = useOpensInBrowser(site);
  // What runs once the sheet has slid out: closing, or the next step of a button that closes it.
  const then = useRef(onClose);
  const sheet = useSheet(() => then.current());
  const closeThen = (f: () => void) => {
    then.current = f;
    sheet.close();
  };

  return (
    <Sheet label={`More for ${linkName(l)}`} sheet={sheet}>
      <h2>{linkName(l)}</h2>
      {!l.tpl && (
        <button
          className="btn"
          onClick={() => {
            // The clipboard is read while the tap still counts as one, which iPhone Safari requires.
            void pasteChapterLink(x.id, i, toast);
            sheet.close();
          }}
        >
          Update chapter from a link
        </button>
      )}
      <p className="hint">
        {!l.tpl &&
          "Copy a chapter link from the site, then tap Update. InkNexus reads the chapter number and, where the site's links allow it, learns the pattern so Continue works. "}
        If the in-app view is blank, shows a warning, or zooms the whole app when you pinch it (iPhone), turn on Open in the browser
        {ob ? `. After reading there, come back and tap +${l.tpl ? '' : ' or Update'}` : ''}.
      </p>
      <label className="opt">
        <input
          type="checkbox"
          checked={ob}
          onChange={(e) => {
            setOpensInBrowser(site, e.target.checked);
            toast(e.target.checked ? `${site} will open in the browser` : `${site} will open in the app`);
          }}
        />
        Open {site} in the browser instead of in the app
      </label>
      <a className="btn ghost" href={l.url} target="_blank" rel="noopener noreferrer">
        Open in browser
      </a>
      <button className="btn ghost" onClick={() => closeThen(onMove)}>
        Move to another series
      </button>
      <button
        className="btn danger sm"
        onClick={() =>
          closeThen(() => {
            onClose();
            updateSeries(x.id, (s) => ({ links: s.links.filter((_, k) => k !== i), src: '' }));
          })
        }
      >
        Remove this source
      </button>
    </Sheet>
  );
}
