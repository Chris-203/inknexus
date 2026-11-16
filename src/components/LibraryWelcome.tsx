import { useApp } from '../context';

/** My Series with no series at all: the ways to start one. `onWebtoon` opens the Webtoon import. */
export function LibraryWelcome({ onWebtoon }: { onWebtoon: () => void }) {
  const { navigate, importBackup } = useApp();
  return (
    <div className="empty">
      <p>No series yet.</p>
      <button className="btn" onClick={() => navigate({ name: 'search' })}>
        Browse series
      </button>
      <p className="restore">
        Used InkNexus before, in another browser or on another device? Each one keeps its own list. Import the backup file you exported there.
      </p>
      <button className="btn ghost" onClick={importBackup}>
        Import backup
      </button>
      <p className="restore">Reading on Webtoon? Bring in every series from your Recent list.</p>
      <button className="btn ghost" onClick={onWebtoon}>
        Import from Webtoon
      </button>
    </div>
  );
}
