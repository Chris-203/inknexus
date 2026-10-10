import { nextZoom } from './frameZoom';

describe('nextZoom', () => {
  it('steps up through 100%–200%, then back to 100%', () => {
    expect(nextZoom(1)).toBe(1.25);
    expect(nextZoom(1.75)).toBe(2);
    expect(nextZoom(2)).toBe(1);
    expect(nextZoom(1.1)).toBe(1.25);
  });
});
