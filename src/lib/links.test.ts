import { fmt, host, norm, parseChUrl } from './links';
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
  });
  it('matches the original implementation on every sample link', () => {
    expect(legacy.length).toBe(12);
    for (const [u, want] of legacy as [string, unknown][]) expect(parseChUrl(u), u).toEqual(want);
  });
});

describe('helpers', () => {
  it('host drops www and survives bad input', () => {
    expect(host('https://www.tapas.io/x')).toBe('tapas.io');
    expect(host('nope')).toBe('Link');
  });
  it('norm keeps letters and digits only', () => expect(norm('Solo Leveling: Ragnarok!')).toBe('sololevelingragnarok'));
  it('fmt shows whole and one-decimal chapters', () => {
    expect(fmt(12)).toBe(12);
    expect(fmt(12.5)).toBe(12.5);
    expect(fmt(12.55)).toBe(12.6);
  });
});
