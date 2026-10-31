import { chapterNote, daysAgo, fileSize, fmt, norm, plural, shortDate, titleHas } from './format';

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
  it('shortDate shows month, day and year', () => {
    expect(shortDate('2026-01-16T12:00:00+00:00')).toBe('Jan 16, 2026');
    expect(shortDate('2025-12-03T12:00:00')).toBe('Dec 3, 2025');
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
  it('fileSize shows KB under 1 MB and MB above, never 0 KB', () => {
    expect(fileSize(0)).toBe('1 KB');
    expect(fileSize(850 * 1024)).toBe('850 KB');
    expect(fileSize(4.24 * 1024 * 1024)).toBe('4.2 MB');
    expect(fileSize(1023.9 * 1024)).toBe('1 MB');
    expect(fileSize(18.4 * 1024 * 1024)).toBe('18 MB');
  });
  it('norm keeps letters and digits only', () => expect(norm('Solo Leveling: Ragnarok!')).toBe('sololevelingragnarok'));
});

describe('titleHas', () => {
  it('finds a title by any part of it, ignoring case', () => {
    expect(titleHas('Solo Leveling', 'level')).toBe(true);
    expect(titleHas('Solo Leveling', 'SOLO')).toBe(true);
    expect(titleHas('Solo Leveling', 'tower')).toBe(false);
  });
  it('ignores spaces and punctuation', () => {
    expect(titleHas('Solo Leveling', 'solo-leveling')).toBe(true);
    expect(titleHas('The Beginning After the End', 'beginningafter')).toBe(true);
    expect(titleHas("Omniscient Reader's Viewpoint", 'readers')).toBe(true);
  });
  it('finds titles in other scripts, which have no letters for norm() to keep', () => {
    expect(titleHas('나 혼자만 레벨업', '혼자')).toBe(true);
    expect(titleHas('나 혼자만 레벨업', '탑')).toBe(false);
  });
  it('trims the query', () => {
    expect(titleHas('Solo Leveling', '  solo ')).toBe(true);
  });
});
