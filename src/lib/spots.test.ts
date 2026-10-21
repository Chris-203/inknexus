import { getSpot, setSpot, spotAt } from './spots';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('spotAt', () => {
  it('is null before there are pages', () => {
    expect(spotAt([])).toBeNull();
  });

  it('finds the page crossing the top of the screen and how far down it is', () => {
    expect(spotAt([{ top: 60, bottom: 1660 }])).toEqual({ i: 0, f: 0 });
    expect(
      spotAt([
        { top: -1600, bottom: 0 },
        { top: 0, bottom: 1600 },
      ]),
    ).toEqual({ i: 1, f: 0 });
    expect(
      spotAt([
        { top: -2000, bottom: -400 },
        { top: -400, bottom: 1200 },
      ]),
    ).toEqual({ i: 1, f: 0.25 });
  });

  it('is null once every page is above the screen', () => {
    expect(spotAt([{ top: -900, bottom: -100 }])).toBeNull();
  });
});

describe('spots', () => {
  it('remembers one chapter per series', () => {
    setSpot('a', 93, { i: 4, f: 0.5 });
    setSpot('b', 7, { i: 0, f: 0.1 });
    expect(getSpot('a', 93)).toEqual({ i: 4, f: 0.5 });
    expect(getSpot('b', 7)).toEqual({ i: 0, f: 0.1 });
    setSpot('a', 94, { i: 1, f: 0 });
    expect(getSpot('a', 93)).toBeNull();
    expect(getSpot('a', 94)).toEqual({ i: 1, f: 0 });
  });

  it('forgets a spot, and keeps it when another chapter is left at its top', () => {
    setSpot('a', 93, { i: 4, f: 0.5 });
    setSpot('a', 92, { i: 0, f: 0 });
    setSpot('a', 91, null);
    expect(getSpot('a', 93)).toEqual({ i: 4, f: 0.5 });
    setSpot('a', 93, { i: 0, f: 0 });
    expect(getSpot('a', 93)).toBeNull();
    setSpot('a', 93, { i: 4, f: 0.5 });
    setSpot('a', 93, null);
    expect(getSpot('a', 93)).toBeNull();
  });

  it('ignores bad saved values', () => {
    memory.set('inknexus-reader-spots', JSON.stringify({ a: { n: 93, i: 'x', f: 0.5 }, b: { n: 7, i: 2, f: 3 } }));
    expect(getSpot('a', 93)).toBeNull();
    expect(getSpot('b', 7)).toEqual({ i: 2, f: 1 });
    memory.set('inknexus-reader-spots', '[1]');
    expect(getSpot('a', 93)).toBeNull();
  });
});
