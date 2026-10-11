import { getFrameZoom, opensInBrowser, setFrameZoom, setOpensInBrowser, stepZoom } from './siteSettings';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('site settings', () => {
  it('stepZoom steps up and down through 100%–200% and stops at either end', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1.75, 1)).toBe(2);
    expect(stepZoom(1.5, -1)).toBe(1.25);
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(1, -1)).toBe(1);
  });
  it('remembers zoom per site and ignores bad saved values', () => {
    setFrameZoom('a.example', 1.5);
    expect(getFrameZoom('a.example')).toBe(1.5);
    expect(getFrameZoom('b.example')).toBe(1);
    memory.set('inknexus-frame-zoom', JSON.stringify({ 'a.example': 9 }));
    expect(getFrameZoom('a.example')).toBe(1);
  });
  it('turns open-in-browser on and off per site', () => {
    setOpensInBrowser('a.example', true);
    expect(opensInBrowser('a.example')).toBe(true);
    expect(opensInBrowser('b.example')).toBe(false);
    setOpensInBrowser('a.example', false);
    expect(opensInBrowser('a.example')).toBe(false);
  });
});
