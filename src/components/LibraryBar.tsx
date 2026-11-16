import { setLibraryView, useLibraryView } from '../lib/libraryView';
import type { Series } from '../lib/types';

/**
 * The bar over a list of My Series: the count of series `shown`, Select all while selecting (`picked` holds the ids
 * picked, and `onPick` takes the new ones), and the switch between cards and the list. `checking` says new chapters are being looked for.
 */
export function LibraryBar({
  shown,
  picked,
  onPick,
  checking,
}: {
  shown: Series[];
  picked: string[] | null;
  onPick: (ids: string[]) => void;
  checking: boolean;
}) {
  const view = useLibraryView();
  const all = !!picked && shown.every((x) => picked.includes(x.id));
  return (
    <div className="lbar">
      <span className="sub">
        {shown.length} series{checking ? ' · checking for new chapters…' : ''}
      </span>
      {picked && shown.length > 0 && (
        <button className="btn ghost sm all" onClick={() => onPick(all ? [] : shown.map((x) => x.id))}>
          {all ? 'Deselect all' : 'Select all'}
        </button>
      )}
      <div className="seg" role="group" aria-label="Show series as">
        <button aria-label="Cards" aria-pressed={view === 'cards'} onClick={() => setLibraryView('cards')}>
          {/* four cards */}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
            <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
            <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
            <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
          </svg>
        </button>
        <button aria-label="List" aria-pressed={view === 'list'} onClick={() => setLibraryView('list')}>
          {/* three rows, each a thumbnail and a line */}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5.5h2M4 12h2M4 18.5h2M9.5 5.5H20M9.5 12H20M9.5 18.5H20" />
          </svg>
        </button>
      </div>
    </div>
  );
}
