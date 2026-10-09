import { createContext, useContext } from 'react';
import type { SearchResult } from './lib/types';

export type View =
  | { name: 'library' }
  | { name: 'search' }
  | { name: 'series'; id: string; src?: string }
  | { name: 'reader'; id: string; n: number }
  | { name: 'frame'; id: string; i: number; src?: string; ch: number; url: string };

export interface SearchState {
  q: string;
  results: SearchResult[] | null;
}

export interface AppApi {
  /** Go to a view. `replace` swaps the current history entry (moving chapter to chapter) instead of adding one. */
  navigate: (v: View, replace?: boolean) => void;
  toast: (message: string) => void;
  /** Open the file picker to import a backup. */
  importBackup: () => void;
  search: SearchState;
  setSearch: (s: SearchState) => void;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const a = useContext(AppContext);
  if (!a) throw new Error('useApp outside AppContext');
  return a;
}
