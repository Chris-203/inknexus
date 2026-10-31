import { loadDetails, loadTrailer, savedDetails, savedTrailer } from './details';

afterEach(() => vi.unstubAllGlobals());

/** Answer MangaDex relay calls for manga `m` and count every call. */
function stub() {
  const seen: string[] = [];
  vi.stubGlobal('fetch', async (req: string) => {
    seen.push(req);
    if (req.startsWith('https://graphql.anilist.co')) return new Response(JSON.stringify({ data: { Media: { trailer: null } } }));
    const u = new URL(req, 'http://x').searchParams.get('url')!;
    const data = u.endsWith('/aggregate?translatedLanguage[]=en') ? {} : { data: { id: 'm', attributes: { description: { en: 'All of it.' } } } };
    return new Response(JSON.stringify(data));
  });
  return seen;
}

describe('details of an opened series', () => {
  it('are saved once loaded, with the whole synopsis, for that series only', async () => {
    stub();
    const o = { src: 'md' as const, ref: 'm', title: 'M', desc: 'All', cover: '' };
    expect(savedDetails(o)).toBeUndefined();
    const d = await loadDetails(o);
    expect(d.desc).toBe('All of it.');
    expect(savedDetails(o)).toEqual(d);
    expect(savedDetails({ ...o, src: 'al' })).toBeUndefined();
  });

  it('save a series having no trailer as null, apart from not loaded', async () => {
    stub();
    expect(savedTrailer(7)).toBeUndefined();
    expect(await loadTrailer(7)).toBeNull();
    expect(savedTrailer(7)).toBeNull();
  });
});
