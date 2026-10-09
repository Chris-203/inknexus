import { loadState, newSeries, parseBackup, saveState, STORAGE_KEY } from './storage';

const fakeStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('storage', () => {
  it('uses the old longstrip key so existing libraries keep loading', () => expect(STORAGE_KEY).toBe('longstrip'));
  it('loads a saved library unchanged', () => {
    const lib = [{ id: 'a', title: 'T', cover: '', md: 'm', al: null, links: [], last: 3, t: 1 }];
    const st = fakeStore({ longstrip: JSON.stringify({ lib, sort: 'asc' }) });
    expect(loadState(st)).toEqual({ lib, sort: 'asc' });
  });
  it('starts empty when nothing is saved or the data is unreadable', () => {
    expect(loadState(fakeStore())).toEqual({ lib: [] });
    expect(loadState(fakeStore({ longstrip: '{oops' }))).toEqual({ lib: [] });
  });
  it('drops a worker address left by an old #proxy= link and saves', () => {
    const st = fakeStore({ longstrip: JSON.stringify({ lib: [], proxy: 'https://x.workers.dev' }) });
    expect(loadState(st)).toEqual({ lib: [] });
    expect(JSON.parse(st.m.get('longstrip')!)).toEqual({ lib: [] });
  });
  it('saves under the same key', () => {
    const st = fakeStore();
    saveState({ lib: [] }, st);
    expect(st.m.get('longstrip')).toBe('{"lib":[]}');
  });
  it('parseBackup accepts a backup and rejects anything else', () => {
    expect(parseBackup('{"lib":[],"proxy":"x"}')).toEqual({ lib: [] });
    expect(() => parseBackup('{"items":[]}')).toThrow();
    expect(() => parseBackup('not json')).toThrow();
  });
  it('newSeries fills defaults', () => {
    const s = newSeries({ title: 'T' });
    expect(s).toMatchObject({ title: 'T', cover: '', md: null, al: null, links: [], last: 0 });
    expect(s.id).toBeTruthy();
  });
});
