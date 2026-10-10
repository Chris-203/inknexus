import { langName, mdNames, pickTitle } from './names';

const necro: { title: Record<string, string>; altTitles: Record<string, string>[] } = {
  title: { 'zh-ro': 'Siling Fashi Wo Ji Shi Tianzai' },
  altTitles: [
    { zh: '死灵法师！我即是天灾' },
    { en: 'Necromancer, the Ultimate Scourge!' },
    { 'ko-ro': 'Necromancer' },
    { en: 'necromancer, the ultimate scourge!' },
    { ko: '네크로맨서' },
  ],
};

describe('mdNames', () => {
  it('orders English, then romanized, then the rest, without duplicates', () => {
    expect(mdNames(necro).map((x) => x.l)).toEqual(['en', 'zh-ro', 'ko-ro', 'zh', 'ko']);
  });
  it('pickTitle prefers an English alternative title over a romanized main title', () => {
    expect(pickTitle(necro)).toBe('Necromancer, the Ultimate Scourge!');
    expect(pickTitle({})).toBe('Untitled');
  });
});

describe('langName', () => {
  it('names languages and marks romanized ones', () => {
    expect(langName('en')).toBe('English');
    expect(langName('ko-ro')).toBe('Korean (romanized)');
  });
});
