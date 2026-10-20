import { setShowsReadingUpdates, showsReadingUpdates } from './readingUpdates';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('reading updates', () => {
  it('show until turned off, and a bad saved value leaves them on', () => {
    expect(showsReadingUpdates()).toBe(true);
    memory.set('inknexus-reading-updates', 'not json');
    expect(showsReadingUpdates()).toBe(true);
  });
  it('turns off and back on', () => {
    setShowsReadingUpdates(false);
    expect(showsReadingUpdates()).toBe(false);
    setShowsReadingUpdates(true);
    expect(showsReadingUpdates()).toBe(true);
  });
});
