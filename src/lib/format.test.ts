import { fmt, norm, plural } from './format';

describe('format', () => {
  it('fmt shows whole and one-decimal chapters', () => {
    expect(fmt(12)).toBe(12);
    expect(fmt(12.5)).toBe(12.5);
    expect(fmt(12.55)).toBe(12.6);
  });
  it('plural adds an s unless there is one', () => {
    expect(plural(1, 'official link')).toBe('1 official link');
    expect(plural(0, 'official link')).toBe('0 official links');
    expect(plural(3, 'chapter')).toBe('3 chapters');
  });
  it('norm keeps letters and digits only', () => expect(norm('Solo Leveling: Ragnarok!')).toBe('sololevelingragnarok'));
});
