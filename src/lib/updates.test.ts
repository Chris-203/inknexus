import { fetchLatest, newCount } from './updates';

afterEach(() => vi.unstubAllGlobals());

describe('newCount', () => {
  const latest = { nums: [10, 11, 12, 12.5], at: 0 };
  it('counts readable chapters past the last one read', () => {
    expect(newCount(latest, 11)).toEqual({ n: 2, more: false });
    expect(newCount(latest, 12.5)).toEqual({ n: 0, more: false });
    expect(newCount(undefined, 0)).toEqual({ n: 0, more: false });
  });
  it('flags "more" when all 20 checked chapters are new', () => {
    const many = { nums: Array.from({ length: 20 }, (_, i) => i + 1), at: 0 };
    expect(newCount(many, 0)).toEqual({ n: 20, more: true });
  });
});

describe('fetchLatest', () => {
  it('asks for the newest 20 English chapters and keeps only readable ones', async () => {
    let asked = '';
    vi.stubGlobal('fetch', async (req: string) => {
      asked = new URL(req, 'http://x').searchParams.get('url')!;
      return new Response(
        JSON.stringify({
          data: [
            { id: 'a', attributes: { chapter: '13', pages: 0 } },
            { id: 'b', attributes: { chapter: '12', pages: 20 } },
            { id: 'c', attributes: { chapter: '11', pages: 0, externalUrl: 'https://official.example/11' } },
          ],
        }),
      );
    });
    const l = await fetchLatest('m1');
    expect(asked).toContain('/manga/m1/feed?translatedLanguage[]=en&order[chapter]=desc&limit=20');
    expect(asked).not.toContain('includeExternalUrl');
    expect(l.nums).toEqual([11, 12]);
  });
});
