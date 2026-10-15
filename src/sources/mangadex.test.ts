import { browse, chapters, GENRES, latest, pages, PAGES_TTL, search, toChapterList, type MdChapter } from './mangadex';

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
  it('latest asks for the newest 20 and judges a full answer by rows, not chapter numbers', async () => {
    // Two groups per chapter: 20 rows, 10 chapter numbers.
    const seen = relay(() => ({ data: Array.from({ length: 20 }, (_, k) => ch('c' + k, String(40 - Math.floor(k / 2)), 5)) }));
    const l = await latest('m1');
    expect(seen[0]).toContain('order[chapter]=desc&limit=20');
    expect(seen[0]).toContain('contentRating[]=safe');
    expect(l.nums).toHaveLength(10);
    expect(l.full).toBe(true);
  });
  it('search uses the English title and the cover', async () => {
    relay(() => ({
      data: [
        {
          id: 'm1',
          attributes: { title: { 'ko-ro': 'Jeonjijeok Dokja Sijeom' }, altTitles: [{ en: "Omniscient Reader's Viewpoint" }], description: { en: 'd' } },
          relationships: [{ id: 'c', type: 'cover_art', attributes: { fileName: 'f.jpg' } }],
        },
      ],
    }));
    expect(await search('orv')).toEqual([
      { src: 'md', ref: 'm1', title: "Omniscient Reader's Viewpoint", desc: 'd', cover: 'https://uploads.mangadex.org/covers/m1/f.jpg.256.jpg' },
    ]);
  });
  it('browse asks for a genre with English chapters, most followed first', async () => {
    const seen = relay(() => ({ data: [] }));
    const action = GENRES.find((g) => g.name === 'Action')!.id;
    expect(await browse(action, 'follows')).toEqual([]);
    expect(seen[0]).toContain(`includedTags[]=${action}`);
    expect(seen[0]).toContain('order[followedCount]=desc');
    expect(seen[0]).toContain('availableTranslatedLanguage[]=en');
    expect(seen[0]).toContain('includes[]=cover_art');
    expect(seen[0]).toContain('contentRating[]=safe');
  });
  it('browse with no genre and latest upload first leaves out the tag filter', async () => {
    const seen = relay(() => ({ data: [] }));
    await browse(null, 'latest');
    expect(seen[0]).toContain('order[latestUploadedChapter]=desc');
    expect(seen[0]).not.toContain('includedTags');
  });
  it('pages lists data-saver images with full-quality fallbacks', async () => {
    relay(() => ({ baseUrl: 'https://node.example', chapter: { hash: 'h', data: ['1.png'], dataSaver: ['1.jpg'] } }));
    expect(await pages('c1')).toEqual([{ a: 'https://node.example/data-saver/h/1.jpg', b: 'https://node.example/data/h/1.png' }]);
  });
});

describe('pages cache', () => {
  afterEach(() => vi.useRealTimers());
  // Each at-home answer has its own node, so a reused answer shows as the same baseUrl.
  const nodes = () => {
    let k = 0;
    return relay(() => ({ baseUrl: `https://node${++k}.example`, chapter: { hash: 'h', data: ['1.png'], dataSaver: ['1.jpg'] } }));
  };

  it('reuses a chapter’s answer, so its image URLs stay the same', async () => {
    const seen = nodes();
    const a = await pages('hit');
    expect(await pages('hit')).toEqual(a);
    expect(seen).toEqual(['https://api.mangadex.org/at-home/server/hit']);
  });
  it('shares a load still in flight', async () => {
    const seen = nodes();
    expect(pages('flight')).toBe(pages('flight'));
    await pages('flight');
    expect(seen).toHaveLength(1);
  });
  it('asks again for a different chapter', async () => {
    const seen = nodes();
    await pages('one');
    await pages('two');
    expect(seen).toEqual(['https://api.mangadex.org/at-home/server/one', 'https://api.mangadex.org/at-home/server/two']);
  });
  it('asks again once an answer is older than PAGES_TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const seen = nodes();
    const a = await pages('old');
    vi.advanceTimersByTime(PAGES_TTL - 1);
    expect(await pages('old')).toEqual(a);
    vi.advanceTimersByTime(1);
    expect((await pages('old'))[0]!.a).not.toBe(a[0]!.a);
    expect(seen).toHaveLength(2);
  });
  it('does not reuse a failed load', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    await expect(pages('fail')).rejects.toThrow('HTTP 429');
    const seen = nodes();
    expect(await pages('fail')).toHaveLength(1);
    expect(seen).toHaveLength(1);
  });
});
