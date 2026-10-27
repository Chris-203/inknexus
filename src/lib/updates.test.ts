import { newCount } from './updates';

describe('newCount', () => {
  it('counts chapters past the last one read', () => {
    expect(newCount({ nums: [10, 11, 12], full: false, at: 0 }, 10)).toEqual({ n: 2, more: false });
    expect(newCount({ nums: [10, 11, 12], full: false, at: 0 }, 12)).toEqual({ n: 0, more: false });
    expect(newCount(undefined, 3)).toEqual({ n: 0, more: false });
  });
  it('says there may be more only when the check came back full and all of it is new', () => {
    expect(newCount({ nums: [21, 22, 23], full: true, at: 0 }, 5)).toEqual({ n: 3, more: true });
    expect(newCount({ nums: [21, 22, 23], full: true, at: 0 }, 21)).toEqual({ n: 2, more: false });
    expect(newCount({ nums: [21, 22, 23], full: false, at: 0 }, 5)).toEqual({ n: 3, more: false });
  });
});

describe('withNew', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('counts the started, shown MangaDex series with chapters past the last one read', async () => {
    const saved = JSON.stringify({ m1: { nums: [4, 5, 6], full: false, at: 0 }, m2: { nums: [9], full: false, at: 0 } });
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'inknexus-updates' ? saved : null), setItem: () => {} });
    vi.resetModules();
    const { withNew } = await import('./updates');
    const x = { id: 'a', title: 'A', cover: '', md: 'm1', al: null, links: [], last: 4, t: 0 };
    expect(withNew([x])).toBe(1);
    expect(withNew([x, { ...x, md: 'm2', last: 9 }, { ...x, mdh: true }, { ...x, last: 0 }, { ...x, md: null }])).toBe(1);
    expect(withNew([x, { ...x, md: 'm2', last: 8 }])).toBe(2);
  });
});
