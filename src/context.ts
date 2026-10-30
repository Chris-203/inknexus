import { createContext, useContext } from 'react';
import type { SearchResult } from './lib/types';
import type { Filter, Sort } from './lib/searchResults';

export type View =
  | { name: 'library' }
  | { name: 'search' }
  | { name: 'details'; o: SearchResult }
  | { name: 'series'; id: string }
  | { name: 'reader'; id: string; n: number }
  | { name: 'frame'; id: string; i: number; ch: number; url: string };

export interface SearchState {
  /** The title searched for, or '' while browsing. */
  q: string;
  res: SearchResult[] | null;
  /** The MangaDex genre browsed (null for all genres) and its order. */
  tag: string | null;
  sort: Sort;
  /** Browse filters, kept while searching by title. */
  filter: Filter;
}

export interface AppApi {
  /** Go to a view. `replace` swaps the current history entry, for moving chapter to chapter. */
  navigate: (v: View, replace?: boolean) => void;
  /** The in-app back button: step back through history when there is an app view behind, otherwise go to `fallback`. */
  goBack: (fallback: View) => void;
  /** Show a message for a moment. `update` marks a routine reading update, which Settings can turn off; errors and confirmations never pass it. */
  toast: (message: string, update?: boolean) => void;
  /** Open the file picker to import a backup. */
  importBackup: () => void;
  /** Search or browse results, kept while you open a series and come back. */
  search: SearchState;
  setSearch: (s: SearchState) => void;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const a = useContext(AppContext);
  if (!a) throw new Error('useApp outside AppContext');
  return a;
}
