import { PULL } from '../lib/pullNext';

/** The ring that ends a chapter with another one after it: it fills as the pages are pulled up by `pulled` px, and a full ring opens the next chapter. */
export function PullNext({ pulled }: { pulled: number }) {
  return (
    <div className="pullnext" aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" pathLength="1" />
        <circle className="ring" cx="18" cy="18" r="15" pathLength="1" style={{ strokeDashoffset: 1 - pulled / PULL }} />
        <path d="M18 11v14M12 19l6 6 6-6" />
      </svg>
      <span>Pull to read next chapter</span>
    </div>
  );
}
