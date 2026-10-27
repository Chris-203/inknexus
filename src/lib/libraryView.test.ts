import { libraryView, setLibraryView } from './libraryView';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('library view', () => {
  it('is cards until the list is chosen, and a bad saved value keeps cards', () => {
    expect(libraryView()).toBe('cards');
    memory.set('inknexus-library-view', 'not json');
    expect(libraryView()).toBe('cards');
    memory.set('inknexus-library-view', '"grid"');
    expect(libraryView()).toBe('cards');
  });
  it('switches to the list and back', () => {
    setLibraryView('list');
    expect(libraryView()).toBe('list');
    setLibraryView('cards');
    expect(libraryView()).toBe('cards');
  });
});
