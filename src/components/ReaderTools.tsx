import { HouseIcon } from './HouseIcon';

/**
 * The reader's side toolbar: back to the series (`title` names it), the chapter list (`chaptersOpen` while it is open,
 * off until there are `chapters` to list), and with `pages` on screen, auto scroll, tap to scroll and zoom.
 */
export function ReaderTools({
  title,
  chapters,
  chaptersOpen,
  pages,
  auto,
  tapScroll,
  onSeries,
  onChapters,
  onAuto,
  onTapScroll,
  onZoom,
}: {
  title: string;
  chapters: boolean;
  chaptersOpen: boolean;
  pages: boolean;
  auto: boolean;
  tapScroll: boolean;
  onSeries: () => void;
  onChapters: () => void;
  onAuto: () => void;
  onTapScroll: () => void;
  onZoom: (d: number) => void;
}) {
  return (
    <div className="rtools" role="toolbar" aria-label="Reader" aria-orientation="vertical">
      <button className="ibtn" aria-label={`Back to ${title}`} onClick={onSeries}>
        <HouseIcon />
      </button>
      <button className="ibtn" aria-label="Chapters" aria-expanded={chaptersOpen} disabled={!chapters} onClick={onChapters}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
        </svg>
      </button>
      {pages && (
        <>
          <button className="ibtn" aria-label="Auto scroll" aria-pressed={auto} onClick={onAuto}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 6l5 5 5-5M7 13l5 5 5-5" />
            </svg>
          </button>
          <button className="ibtn" aria-label="Tap to scroll" aria-pressed={tapScroll} onClick={onTapScroll}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3v6M9 6l3-3 3 3M12 21v-6M9 18l3 3 3-3" />
              <circle cx="12" cy="12" r="1.5" />
            </svg>
          </button>
          <button className="ibtn" aria-label="Zoom in" onClick={() => onZoom(0.5)}>
            +
          </button>
          <button className="ibtn" aria-label="Zoom out" onClick={() => onZoom(-0.5)}>
            −
          </button>
        </>
      )}
    </div>
  );
}
