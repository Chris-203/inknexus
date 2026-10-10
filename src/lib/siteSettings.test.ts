import { getFrameZoom, nextZoom, opensInBrowser, setFrameZoom, setOpensInBrowser } from './siteSettings';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('site settings', () => {
  it('nextZoom steps up through 100%–200%, then back to 100%', () => {
    expect(nextZoom(1)).toBe(1.25);
    expect(nextZoom(1.75)).toBe(2);
    expect(nextZoom(2)).toBe(1);
    expect(nextZoom(1.1)).toBe(1.25);
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
