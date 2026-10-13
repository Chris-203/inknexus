import { getState, removeSeries, replaceState } from './store';
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
