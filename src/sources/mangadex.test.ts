import { browse, chapters, details, GENRES, latest, matchTitle, mdMatch, pages, PAGES_TTL, search, toChapterList, toDetails, type MdChapter } from './mangadex';

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
  it('keeps one readable chapter per number, sorted, with groups and dates', () => {
    const list = toChapterList([
      ch('c2', '2', 20, {}, ['Alpha', 'Beta']),
      ch('c1', '1', 20, { title: 'Start', readableAt: '2026-01-16T12:00:00+00:00' }, ['Alpha']),
      ch('c1b', '1', 18, {}, ['Other']),
      ch('gone', '3', 0),
      ch('extra', null, 5),
    ]);
    expect(list.listed).toBe(5);
    expect(list.chapters).toEqual([
      { id: 'c1', num: 1, title: 'Start', ext: '', grp: 'Alpha', date: '2026-01-16T12:00:00+00:00' },
      { id: 'c2', num: 2, title: '', ext: '', grp: 'Alpha & Beta', date: undefined },
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

describe('toDetails', () => {
  const tag = (en: string, group: string) => ({ attributes: { name: { en }, group } });
  it('shows genres, then formats, then themes, and leaves content warnings out', () => {
    const d = toDetails(
      { id: 'm', attributes: { tags: [tag('Monsters', 'theme'), tag('Gore', 'content'), tag('Long Strip', 'format'), tag('Action', 'genre')] } },
      {},
    );
    expect(d.tags).toEqual(['Action', 'Long Strip', 'Monsters']);
  });
  it('counts available numbered chapters once across volumes and names each author once', () => {
    const d = toDetails(
      {
        id: 'm',
        attributes: { status: 'hiatus', year: 2019 },
        relationships: [
          { id: 'a', type: 'author', attributes: { name: 'Pen Name' } },
          { id: 'b', type: 'artist', attributes: { name: 'Pen Name' } },
          { id: 'c', type: 'cover_art', attributes: { fileName: 'x.jpg' } },
        ],
      },
      {
        volumes: {
          '1': { chapters: { '1': { chapter: '1' }, '1.5': { chapter: '1.5' } } },
          none: { chapters: { '1': { chapter: '1' }, none: { chapter: 'none' } } },
        },
      },
    );
    expect(d).toEqual({ tags: [], status: 'On hiatus', year: 2019, chapters: 2, authors: ['Pen Name'], al: null });
  });
  it('gives null for no chapters or year, and an empty status for an unknown one', () => {
    // MangaDex sends volumes as [] when there are none.
    const d = toDetails({ id: 'm', attributes: { status: 'odd' } }, { volumes: [] as unknown as Record<string, never> });
    expect(d).toMatchObject({ status: '', year: null, chapters: null });
  });
  it('keeps the AniList id MangaDex links, and null when it links none or a bad one', () => {
    expect(toDetails({ id: 'm', attributes: { links: { al: '30013', mu: 'x' } } }, {}).al).toBe(30013);
    expect(toDetails({ id: 'm', attributes: { links: null } }, {}).al).toBeNull();
    expect(toDetails({ id: 'm', attributes: { links: { al: 'abc' } } }, {}).al).toBeNull();
  });
});

describe('MangaDex requests', () => {
  it('details asks for the series with its authors and its English chapter numbers', async () => {
    const seen = relay((u) =>
      u.includes('/aggregate') ? { volumes: { none: { chapters: { '3': { chapter: '3' } } } } } : { data: { id: 'm1', attributes: { status: 'ongoing' } } },
    );
    expect(await details('m1')).toMatchObject({ status: 'Ongoing', chapters: 1 });
    expect(seen).toContain('https://api.mangadex.org/manga/m1?includes[]=author&includes[]=artist');
    expect(seen).toContain('https://api.mangadex.org/manga/m1/aggregate?translatedLanguage[]=en');
  });
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

describe('mdMatch', () => {
  const m = (id: string, en: string, alt: string[] = []) => ({ id, attributes: { title: { en }, altTitles: alt.map((n) => ({ en: n })) } });
  it('takes the series with the title among any of its names, comparing letters and digits only', () => {
    expect(mdMatch('A Story', [m('m1', 'A Story 2'), m('m2', 'Other', ['a story!'])])?.ref).toBe('m2');
  });
  it('is null when no name is exactly the title', () => {
    expect(mdMatch('A Story', [m('m1', 'A Story Returns')])).toBeNull();
  });
  it('matchTitle searches by title with covers', async () => {
    const seen = relay(() => ({ data: [m('m1', 'A Story')] }));
    expect((await matchTitle('A Story'))?.ref).toBe('m1');
    expect(seen[0]).toContain('/manga?title=A%20Story&limit=5&includes[]=cover_art');
  });
});
