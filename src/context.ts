import { createContext, useContext } from 'react';
import type { SearchResult } from './lib/types';

export type View =
  | { name: 'library' }
  | { name: 'search' }
  | { name: 'series'; id: string }
  | { name: 'reader'; id: string; n: number }
  | { name: 'frame'; id: string; i: number; ch: number; url: string };

export interface SearchState {
  q: string;
  res: SearchResult[] | null;
}

export interface AppApi {
  /** Go to a view. `replace` swaps the current history entry, for moving chapter to chapter. */
  navigate: (v: View, replace?: boolean) => void;
  /** The in-app back button: step back through history when there is an app view behind, otherwise go to `fallback`. */
  goBack: (fallback: View) => void;
  toast: (message: string) => void;
  /** Open the file picker to import a backup. */
  importBackup: () => void;
  /** Find results, kept while you open a series and come back. */
  search: SearchState;
  setSearch: (s: SearchState) => void;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const a = useContext(AppContext);
  if (!a) throw new Error('useApp outside AppContext');
  return a;
}
