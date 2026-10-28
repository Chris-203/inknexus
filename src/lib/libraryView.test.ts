import { libraryShelf, libraryView, setLibraryShelf, setLibraryView, shelfOf } from './libraryView';

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

describe('library shelf', () => {
  it('is Reading until another shelf is chosen, and a bad saved value keeps Reading', () => {
    expect(libraryShelf()).toBe('reading');
    memory.set('inknexus-library-shelf', '"archived"');
    expect(libraryShelf()).toBe('reading');
  });
  it('switches shelves', () => {
    setLibraryShelf('done');
    expect(libraryShelf()).toBe('done');
    setLibraryShelf('reading');
    expect(libraryShelf()).toBe('reading');
  });
  it('puts a series with no shelf on Reading', () => {
    const x = { id: 'a', title: 'T', cover: '', md: null, al: null, links: [], last: 0, t: 0 };
    expect(shelfOf(x)).toBe('reading');
    expect(shelfOf({ ...x, shelf: 'plan' })).toBe('plan');
  });
});
