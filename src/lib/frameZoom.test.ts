import { stepZoom } from './frameZoom';

describe('stepZoom', () => {
  it('moves one step and clamps to 100%–200%', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1.5, -1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(1);
    expect(stepZoom(2, 1)).toBe(2);
  });
});
