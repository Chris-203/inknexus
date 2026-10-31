import { createDeviceCache } from './deviceCache';

afterEach(() => vi.unstubAllGlobals());

const DAY = 864e5;

/** A localStorage holding `saved` under 'k'; `fits` decides which saves succeed. */
function storage(saved: unknown, fits: (pairs: unknown[]) => boolean = () => true) {
  const m = new Map([['k', JSON.stringify(saved)]]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (!fits(JSON.parse(v))) throw new DOMException('full', 'QuotaExceededError');
      m.set(k, v);
    },
  });
  return () => (JSON.parse(m.get('k')!) as [string, unknown][]).map(([k]) => k);
}

describe('createDeviceCache', () => {
  it('reads what was saved less than its age ago and skips what it cannot read', () => {
    storage([['a', { at: Date.now() - DAY, v: 1 }], ['old', { at: Date.now() - 8 * DAY, v: 2 }], ['bad', { at: 'now', v: 3 }], 'junk', null]);
    const c = createDeviceCache<number>('k', 10);
    expect(c.get('a')).toBe(1);
    expect(c.get('a', DAY / 2)).toBeUndefined();
    expect(c.get('old')).toBeUndefined();
    expect(c.get('bad')).toBeUndefined();
  });

  it('keeps null as a value, apart from nothing saved', () => {
    storage([]);
    const c = createDeviceCache<string | null>('k', 10);
    c.set('none', null);
    expect(c.get('none')).toBeNull();
    expect(c.get('other')).toBeUndefined();
  });

  it('saves only the newest `keep`, and drops the oldest until the rest fit', () => {
    const keys = storage(
      [
        ['a', { at: Date.now() - 3, v: 1 }],
        ['b', { at: Date.now() - 2, v: 2 }],
        ['c', { at: Date.now() - 1, v: 3 }],
      ],
      (pairs) => pairs.length <= 2,
    );
    const c = createDeviceCache<number>('k', 3);
    c.set('a', 4);
    expect(keys()).toEqual(['c', 'a']);
    expect(c.get('b')).toBe(2);
  });
});
