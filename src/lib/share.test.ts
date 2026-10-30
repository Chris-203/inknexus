import { shareUrl } from './share';
import type { Series } from './types';

const x: Series = { id: 'a', title: 'A', cover: '', md: 'm1', al: null, links: [{ label: 'Site', url: 'https://example.com/a' }], last: 0, t: 0 };

describe('shareUrl', () => {
  it("is MangaDex's title page when MangaDex is the shown source", () => {
    expect(shareUrl(x)).toBe('https://mangadex.org/title/m1');
  });
  it("is the link source's page when that is the shown source", () => {
    expect(shareUrl({ ...x, src: 'l0' })).toBe('https://example.com/a');
    expect(shareUrl({ ...x, mdh: true })).toBe('https://example.com/a');
  });
  it('is none when every source is hidden or there are none', () => {
    expect(shareUrl({ ...x, mdh: true, links: [] })).toBeUndefined();
    expect(shareUrl({ ...x, md: null, links: [] })).toBeUndefined();
  });
});
