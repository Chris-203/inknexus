import { useLayoutEffect, useRef, useState } from 'react';
import type { Chapter } from '../lib/types';

/**
 * The chapter's credit under the chapter switcher: its scanlation group and MangaDex, which MangaDex's API rules require.
 * A credit too long for the switcher scrolls right to left, or with reduced motion has its group name cut short.
 */
export function ChapterCredit({ c }: { c: Chapter }) {
  const line = useRef<HTMLParagraphElement>(null);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => setLong(line.current!.scrollWidth > line.current!.clientWidth), []);
  const grp = c.grp || 'No group credited';
  const credit = (copy: boolean) => (
    <span aria-hidden={copy || undefined} style={long ? { animationDuration: `${(grp.length + 11) * 0.3}s` } : undefined}>
      <i>{grp}</i>&nbsp;· MangaDex
    </span>
  );
  // Two copies, each moved by its own width, so the loop starts again exactly where it began.
  return (
    <p ref={line} className={`chcredit${long ? ' long' : ''}`}>
      {credit(false)}
      {long && credit(true)}
    </p>
  );
}
