import { typedLast } from './lastField';

describe('typedLast', () => {
  it('reads the number typed, decimals included', () => {
    expect(typedLast('12', 3)).toBe(12);
    expect(typedLast('6.5', 3)).toBe(6.5);
    expect(typedLast('0', 3)).toBe(0);
  });
  it('keeps the last chapter while the text is not a number', () => {
    expect(typedLast('', 3)).toBe(3);
    expect(typedLast('abc', 3)).toBe(3);
  });
  it('never goes below 0', () => {
    expect(typedLast('-4', 3)).toBe(0);
  });
});
