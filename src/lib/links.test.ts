import { chapterLink, host, isWebUrl, linkFrom, linkName, parseChUrl, stepChapter } from './links';
// What the original single-file app's parseChUrl returned for these links, recorded before it was removed.
import legacy from './fixtures/parseChUrl-legacy.json';

describe('parseChUrl', () => {
  it('reads the chapter number and learns the URL pattern', () => {
    expect(parseChUrl('https://toonily.com/webtoon/my-series/chapter-102/')).toEqual({
      num: 102,
      tpl: 'https://toonily.com/webtoon/my-series/chapter-{n}/',
      series: 'https://toonily.com/webtoon/my-series',
      idPrefixed: false,
    });
  });
  it('reads decimal chapters', () => {
    expect(parseChUrl('https://toonily.com/webtoon/my-series/chapter-102-5/')?.num).toBe(102.5);
  });
  it('gives no pattern when the site puts an id before the chapter', () => {
    const r = parseChUrl('https://comix.to/title/abcd-some-series/12345-chapter-7');
    expect(r?.num).toBe(7);
    expect(r?.idPrefixed).toBe(true);
    expect(r?.tpl).toBe('');
  });
  it('returns null without a chapter number or a valid URL', () => {
    expect(parseChUrl('https://example.com/no-number-here/')).toBeNull();
    expect(parseChUrl('not a url')).toBeNull();
    expect(parseChUrl('javascript:alert(1)//chapter-2')).toBeNull();
  });
  it('matches the original implementation on every sample link', () => {
    expect(legacy.length).toBe(12);
    for (const [u, want] of legacy as [string, unknown][]) expect(parseChUrl(u), u).toEqual(want);
  });
});

describe('link sources', () => {
  it('isWebUrl allows http and https only', () => {
    expect(isWebUrl('https://a.example/x')).toBe(true);
    expect(isWebUrl('http://a.example')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('data:text/html,hi')).toBe(false);
    expect(isWebUrl('')).toBe(false);
  });
  it('linkFrom builds a link source from a chapter link', () => {
    expect(linkFrom(' https://toonily.com/webtoon/s/chapter-7/ ', ' Toonily ')?.link).toEqual({
      label: 'Toonily',
      url: 'https://toonily.com/webtoon/s/chapter-7/',
      tpl: 'https://toonily.com/webtoon/s/chapter-{n}/',
      resume: 'https://toonily.com/webtoon/s/chapter-7/',
      rn: 7,
    });
  });
  it('linkFrom keeps the series page for sites with an id before the chapter', () => {
    expect(linkFrom('https://comix.to/title/abcd-s/12345-chapter-7', '')?.link).toMatchObject({ url: 'https://comix.to/title/abcd-s', tpl: '', rn: 7 });
  });
  it('linkFrom takes a series link without a chapter, and refuses non-web links', () => {
    expect(linkFrom('https://tapas.io/series/x', '')).toEqual({ r: null, link: { label: '', url: 'https://tapas.io/series/x', tpl: '', resume: '', rn: 0 } });
    expect(linkFrom('javascript:alert(1)', '')).toBeNull();
  });
  it('stepChapter moves to the next or previous whole chapter', () => {
    expect(stepChapter(12, 1)).toBe(13);
    expect(stepChapter(12.5, 1)).toBe(13);
    expect(stepChapter(12, -1)).toBe(11);
    expect(stepChapter(12.5, -1)).toBe(12);
    expect(stepChapter(0, -1)).toBe(0);
  });
});

describe('helpers', () => {
  it('host drops www and survives bad input', () => {
    expect(host('https://www.tapas.io/x')).toBe('tapas.io');
    expect(host('nope')).toBe('Link');
  });
  it('linkName prefers the label, then the site', () => {
    expect(linkName({ label: 'Tapas', url: 'https://tapas.io/x' })).toBe('Tapas');
    expect(linkName({ label: '', url: 'https://www.tapas.io/x' })).toBe('tapas.io');
  });
  it('chapterLink fills the chapter number into a pattern', () => expect(chapterLink('https://s.example/ch-{n}', 13)).toBe('https://s.example/ch-13'));
});
