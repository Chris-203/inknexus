import { loadChapters, subscribeChapters } from './chapters';
import type { Series } from './types';
import { freshOf, newCount } from './updates';

afterEach(() => vi.unstubAllGlobals());

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

describe('freshOf', () => {
  const x: Series = { id: 'a', title: 'A', cover: '', md: 'fresh1', al: null, links: [], last: 1, t: 0 };

  it('counts the new chapters of a started series from its loaded chapter list', async () => {
    const data = [1, 2, 3].map((n) => ({ id: `c${n}`, attributes: { chapter: String(n), pages: 3 } }));
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data, total: 3 })));
    const done = vi.fn();
    const off = subscribeChapters(done);
    loadChapters('fresh1');
    await vi.waitFor(() => expect(done).toHaveBeenCalled());
    off();
    expect(freshOf(x)).toEqual({ n: 2, more: false });
    expect(freshOf({ ...x, last: 3 })).toEqual({ n: 0, more: false });
  });
  it('has no new chapters to count for a series never checked', () => {
    expect(freshOf({ ...x, md: 'fresh2' })).toEqual({ n: 0, more: false });
  });
  it('is null for a series not started, without MangaDex, or with MangaDex hidden', () => {
    expect(freshOf({ ...x, last: 0 })).toBeNull();
    expect(freshOf({ ...x, md: null })).toBeNull();
    expect(freshOf({ ...x, mdh: true })).toBeNull();
  });
});
