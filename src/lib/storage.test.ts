import { loadState, newSeries, parseBackup, saveState, STORAGE_KEY } from './storage';

const MDID = '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0';

const fakeStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('storage', () => {
  it('uses the old longstrip key so existing libraries keep loading', () => expect(STORAGE_KEY).toBe('longstrip'));
  it('loads a saved library unchanged', () => {
    const lib = [
      {
        id: 'a',
        title: 'T',
        cover: '',
        md: MDID,
        al: null,
        links: [{ label: 'Site', url: 'https://site.example/s', tpl: 'https://site.example/s/ch-{n}', resume: '', rn: 0 }],
        last: 3,
        t: 1,
      },
    ];
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
  it('cleans up a backup instead of letting bad fields break the app', () => {
    const s = parseBackup(
      JSON.stringify({
        lib: [
          {
            id: 'a',
            title: 'T',
            last: '12',
            md: 'not-an-id',
            cover: 'javascript:x',
            links: [{ url: 'javascript:alert(1)' }, { label: 'ok', url: 'https://ok.example' }],
          },
          { title: 'No links field' },
          'junk',
        ],
        sort: 'sideways',
      }),
    );
    expect(s.sort).toBeUndefined();
    expect(s.lib).toHaveLength(2);
    expect(s.lib[0]).toMatchObject({ id: 'a', title: 'T', last: 0, md: null, cover: '', links: [{ label: 'ok', url: 'https://ok.example' }] });
    expect(s.lib[1]).toMatchObject({ title: 'No links field', links: [], last: 0 });
    expect(s.lib[1]!.id).toBeTruthy();
  });
  it('newSeries fills defaults', () => {
    const s = newSeries({ title: 'T' });
    expect(s).toMatchObject({ title: 'T', cover: '', md: null, al: null, links: [], last: 0 });
    expect(s.id).toBeTruthy();
  });
});
