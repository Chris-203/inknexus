import { useApp } from '../context';
import { setHidden, shownSource, sourcesOf, updateSeries } from '../lib/store';
import type { Series } from '../lib/types';

/** A series' sources as chips: a tap shows a source, the shown one can be hidden, and + Source (`onAdd`) adds one. */
export function SourceChips({ x, onAdd }: { x: Series; onAdd: () => void }) {
  const { toast } = useApp();
  const cur = shownSource(x);
  return (
    <div className="chips">
      {sourcesOf(x)
        .filter((q) => !q.h)
        .map((q) => (
          <span key={q.k} className={`chip src${cur === q.k ? ' on' : ''}`}>
            {cur === q.k && (
              <button
                className="hide"
                aria-label={`Hide ${q.n}`}
                onClick={() => {
                  setHidden(x.id, q.k, true);
                  toast('Hidden. Bring it back from + Source');
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 5l14 14M19 5 5 19" />
                </svg>
              </button>
            )}
            <button aria-pressed={cur === q.k} onClick={() => updateSeries(x.id, () => ({ src: q.k }))}>
              {q.n}
            </button>
          </span>
        ))}
      <button className="chip add" aria-label="+ Source" onClick={onAdd}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v18M3 12h18" />
        </svg>
        Source
      </button>
    </div>
  );
}
