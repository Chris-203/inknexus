import { useEffect, useState } from 'react';
import { setLast } from './store';
import type { Series } from './types';

/** The chapter number that `text` typed into the last chapter field stands for: never below 0, and `last` while it is not a number. */
export function typedLast(text: string, last: number): number {
  const typed = parseFloat(text);
  return Number.isNaN(typed) ? last : Math.max(0, typed);
}

/**
 * The last chapter read as typed into its field: `text` is what the field holds, and `shown` what it would become, so
 * Continue and the read marks follow the typing. `commit` saves it, on blur or Enter.
 */
export function useLastField(x: Series) {
  const last = x.last || 0;
  const [text, setText] = useState(String(last));
  // Keep the field in step when the number changes elsewhere (− / +, paste).
  useEffect(() => setText(String(x.last || 0)), [x.last]);
  const shown = typedLast(text, last);
  const commit = () => {
    if (shown !== last) setLast(x.id, shown);
    // Text that is not a number goes back to the last chapter.
    setText(String(shown));
  };
  return { text, setText, shown, commit };
}
