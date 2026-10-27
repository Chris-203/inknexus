import { chapterNote, daysAgo, fmt, norm, plural } from './format';

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
  it('chapterNote shows the title or official site, then the group', () => {
    expect(chapterNote({ ext: '', title: 'The Gate', grp: 'Team A' })).toBe('The Gate · Team A');
    expect(chapterNote({ ext: 'https://example.com/1', title: 'The Gate', grp: '' })).toBe('Official site ↗');
    expect(chapterNote({ ext: '', title: '', grp: '' })).toBe('');
  });
  it('daysAgo counts calendar days, not 24-hour spans', () => {
    const now = new Date(2026, 9, 27, 0, 30).getTime();
    expect(daysAgo(new Date(2026, 9, 27, 0, 5).getTime(), now)).toBe('today');
    expect(daysAgo(new Date(2026, 9, 26, 23, 50).getTime(), now)).toBe('yesterday');
    expect(daysAgo(new Date(2026, 9, 22, 12).getTime(), now)).toBe('5 days ago');
    expect(daysAgo(new Date(2026, 8, 27, 12).getTime(), now)).toBe('30 days ago');
  });
  it('daysAgo says today for a time later than now, as from another device with its clock ahead', () => {
    expect(daysAgo(new Date(2026, 9, 29).getTime(), new Date(2026, 9, 27).getTime())).toBe('today');
  });
  it('norm keeps letters and digits only', () => expect(norm('Solo Leveling: Ragnarok!')).toBe('sololevelingragnarok'));
});
