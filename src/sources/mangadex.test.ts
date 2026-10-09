import { chapters, pages, search, toChapterList, type MdChapter } from './mangadex';

afterEach(() => vi.unstubAllGlobals());

const ch = (id: string, chapter: string | null, pages: number, extra: Partial<MdChapter['attributes']> = {}, groups: string[] = []): MdChapter => ({
  id,
  attributes: { chapter, title: '', pages, externalUrl: null, ...extra },
  relationships: [...groups.map((name) => ({ id: name, type: 'scanlation_group', attributes: { name } })), { id: 'u', type: 'user' }],
});

/** Answer relay calls with a JSON body chosen from the MangaDex URL. */
const relay = (answer: (u: string) => unknown) => {
  const seen: string[] = [];
  vi.stubGlobal('fetch', async (req: string) => {
    const u = new URL(req, 'http://x').searchParams.get('url')!;
    seen.push(u);
    return new Response(JSON.stringify(answer(u)));
  });
  return seen;
};

describe('toChapterList', () => {
  it('keeps one readable chapter per number, sorted, with groups', () => {
    const list = toChapterList([
      ch('c2', '2', 20, {}, ['Alpha', 'Beta']),
      ch('c1', '1', 20, { title: 'Start' }, ['Alpha']),
      ch('c1b', '1', 18, {}, ['Other']),
      ch('gone', '3', 0),
      ch('extra', null, 5),
    ]);
    expect(list.listed).toBe(5);
    expect(list.chapters).toEqual([
      { id: 'c1', num: 1, title: 'Start', ext: '', grp: 'Alpha' },
      { id: 'c2', num: 2, title: '', ext: '', grp: 'Alpha & Beta' },
    ]);
  });
  it('prefers a chapter readable on MangaDex over an official-site link for the same number', () => {
    const off = ch('off', '4', 0, { externalUrl: 'https://official.example/4' });
    expect(toChapterList([ch('scan', '4', 20), off]).chapters.map((c) => c.id)).toEqual(['scan']);
    expect(toChapterList([off, ch('scan', '4', 20)]).chapters.map((c) => c.id)).toEqual(['scan']);
  });
  it('keeps an official-site chapter when nothing else has that number', () => {
    expect(toChapterList([ch('off', '5', 0, { externalUrl: 'https://official.example/5' })]).chapters).toEqual([
      { id: 'off', num: 5, title: '', ext: 'https://official.example/5', grp: '' },
    ]);
  });
  it('reports how many were listed when none are readable', () => {
    expect(toChapterList([ch('a', '1', 0), ch('b', '2', 0)])).toEqual({ chapters: [], listed: 2 });
  });
});

describe('MangaDex requests', () => {
  it('chapters pages through the feed with groups and without includeExternalUrl', async () => {
    const seen = relay((u) => {
      const off = +new URL(u).searchParams.get('offset')!;
      return { data: off === 0 ? [ch('a', '1', 5)] : [ch('b', '2', 5)], total: 700 };
    });
    const list = await chapters('m1');
    expect(list.chapters.map((c) => c.num)).toEqual([1, 2]);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain('includes[]=scanlation_group');
    expect(seen[0]).toContain('translatedLanguage[]=en');
    expect(seen[0]).not.toContain('includeExternalUrl');
    expect(seen[1]).toContain('offset=500');
  });
  it('search uses the English title and the cover', async () => {
    relay(() => ({
      data: [{ id: 'm1', attributes: { title: { 'ko-ro': 'Jeonjijeok Dokja Sijeom' }, altTitles: [{ en: "Omniscient Reader's Viewpoint" }], description: { en: 'd' } }, relationships: [{ id: 'c', type: 'cover_art', attributes: { fileName: 'f.jpg' } }] }],
    }));
    expect(await search('orv')).toEqual([
      { src: 'md', ref: 'm1', title: "Omniscient Reader's Viewpoint", desc: 'd', cover: 'https://uploads.mangadex.org/covers/m1/f.jpg.256.jpg' },
    ]);
  });
  it('pages lists data-saver images with full-quality fallbacks', async () => {
    relay(() => ({ baseUrl: 'https://node.example', chapter: { hash: 'h', data: ['1.png'], dataSaver: ['1.jpg'] } }));
    expect(await pages('c1')).toEqual([{ a: 'https://node.example/data-saver/h/1.jpg', b: 'https://node.example/data/h/1.png' }]);
  });
});
