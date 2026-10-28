import { getState, removeSeries, replaceState, setShelf, shownSource } from './store';
import type { Series } from './types';

function series(id: string): Series {
  return { id, title: id, cover: '', md: null, al: null, links: [], last: 0, t: 0 };
}

beforeEach(() => replaceState({ lib: ['a', 'b', 'c'].map(series) }));

describe('removeSeries', () => {
  it('removes one series', () => {
    removeSeries('b');
    expect(getState().lib.map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('removes several at once and keeps the rest in order', () => {
    removeSeries('c', 'a');
    expect(getState().lib.map((x) => x.id)).toEqual(['b']);
  });
  it('ignores ids that are not in the library', () => {
    removeSeries('z');
    expect(getState().lib.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('setShelf', () => {
  it('moves the given series and leaves the rest', () => {
    setShelf(['a', 'c'], 'done');
    expect(getState().lib.map((x) => x.shelf)).toEqual(['done', undefined, 'done']);
  });
  it('saves Reading as no shelf, so the saved library keeps its old shape', () => {
    setShelf(['a'], 'drop');
    setShelf(['a'], 'reading');
    expect(JSON.stringify(getState().lib[0])).not.toContain('shelf');
  });
});

describe('shownSource', () => {
  const link = (h = false) => ({ label: 'Site', url: 'https://example.com', h });
  it('is the chosen source while it is visible', () => {
    expect(shownSource({ ...series('a'), md: 'm', links: [link()], src: 'l0' })).toBe('l0');
  });
  it('falls back to the first visible source when the chosen one is hidden, missing or unset', () => {
    expect(shownSource({ ...series('a'), md: 'm', mdh: true, links: [link(true), link()], src: 'md' })).toBe('l1');
    expect(shownSource({ ...series('a'), md: 'm', links: [], src: 'l3' })).toBe('md');
    expect(shownSource({ ...series('a'), links: [link()] })).toBe('l0');
  });
  it('is empty when every source is hidden or there are none', () => {
    expect(shownSource({ ...series('a'), md: 'm', mdh: true, links: [link(true)] })).toBe('');
    expect(shownSource(series('a'))).toBe('');
  });
});
