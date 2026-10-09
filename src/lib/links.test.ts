import { readFileSync } from 'node:fs';
import { fmt, host, norm, parseChUrl } from './links';

// The original parseChUrl from the single-file app, so the port can be checked against it.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const src = html.match(/function parseChUrl\(u\)\{[\s\S]*?\n\}/)?.[0];
const original = src ? (new Function(`${src};return parseChUrl`)() as typeof parseChUrl) : null;

const corpus = [
  'https://asurascans.com/comics/solo-leveling-8a1b2c3d/chapter/12',
  'https://en-thunderscans.com/the-hero-returns-chapter-45/',
  'https://comix.to/title/abcd-some-series/12345-chapter-7',
  'https://toonily.com/webtoon/my-series/chapter-102-5/',
  'https://tapas.io/episode/1234567',
  'https://mangaplus.shueisha.co.jp/viewer/1000486',
  'https://example.com/read/series-name/ch-3',
  'https://example.com/read?series=x&chapter=19',
  'https://example.com/manga/one/c12.5',
  'https://example.com/series/two/ep_8',
  'https://example.com/no-number-here/',
  'not a url',
];

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
  it.runIf(original)('matches the original implementation on every sample link', () => {
    for (const u of corpus) expect(parseChUrl(u), u).toEqual(original!(u));
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
