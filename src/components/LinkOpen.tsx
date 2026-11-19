import { fmt } from '../lib/format';
import { host, nextWhole } from '../lib/links';
import { useOpenLink } from '../lib/openLink';
import { useOpensInBrowser } from '../lib/siteSettings';
import type { Link, Series as SeriesT } from '../lib/types';

/** A link source's ways in, shown above the source chips like MangaDex's Continue: Continue or the saved link, and its series page. */
export function LinkOpen({ x, l, i, shown }: { x: SeriesT; l: Link; i: number; shown: number }) {
  const ob = useOpensInBrowser(host(l.url));
  const open = useOpenLink(x, l, i, shown);
  return (
    <div className="pad">
      {l.tpl && (
        <button className="btn" onClick={() => open('cont')}>
          Continue with ch. {nextWhole(shown)}
        </button>
      )}
      {!l.tpl && l.resume && (
        <button className="btn" onClick={() => open('resume')}>
          Resume ch. {fmt(l.rn || 0)} (saved link)
        </button>
      )}
      <button className={`btn${l.tpl || l.resume ? ' ghost' : ''}`} onClick={() => open('page')}>
        Open the series page{ob ? ' ↗' : ' in app'}
      </button>
    </div>
  );
}
