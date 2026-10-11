import { newCount } from './updates';

describe('newCount', () => {
  it('counts chapters past the last one read', () => {
    expect(newCount({ nums: [10, 11, 12], full: false, at: 0 }, 10)).toEqual({ n: 2, more: false });
    expect(newCount({ nums: [10, 11, 12], full: false, at: 0 }, 12)).toEqual({ n: 0, more: false });
    expect(newCount(undefined, 3)).toEqual({ n: 0, more: false });
  });
  it('says there may be more only when the check came back full and all of it is new', () => {
    expect(newCount({ nums: [21, 22, 23], full: true, at: 0 }, 5)).toEqual({ n: 3, more: true });
    expect(newCount({ nums: [21, 22, 23], full: true, at: 0 }, 21)).toEqual({ n: 2, more: false });
    expect(newCount({ nums: [21, 22, 23], full: false, at: 0 }, 5)).toEqual({ n: 3, more: false });
  });
});
