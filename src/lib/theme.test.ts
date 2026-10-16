import { blend, getTheme, rgbOf, setTheme } from './theme';

const memory = new Map<string, string>();
const inline = new Map<string, string>();
const root = {
  dataset: {} as Record<string, string>,
  style: { setProperty: (k: string, v: string) => void inline.set(k, v), removeProperty: (k: string) => void inline.delete(k) },
};
const meta = { content: '', setAttribute: (_: string, v: string) => void (meta.content = v) };
// What getComputedStyle gives for --bg in each theme; every other color is black.
const BG: Record<string, string> = { canvas: 'rgb(18, 18, 20)', eink: 'rgb(244, 244, 240)' };
let frame: ((now: number) => void) | null = null;
let reduceMotion = false;

beforeEach(() => {
  memory.clear();
  inline.clear();
  root.dataset = {};
  frame = null;
  reduceMotion = false;
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
  vi.stubGlobal('document', { documentElement: root, querySelector: () => meta });
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (k: string) => inline.get(k) ?? (k === '--bg' ? (BG[root.dataset.theme ?? ''] ?? 'rgb(18, 18, 20)') : 'rgb(0, 0, 0)'),
  }));
  vi.stubGlobal('matchMedia', () => ({ matches: reduceMotion }));
  vi.stubGlobal('performance', { now: () => 0 });
  vi.stubGlobal('requestAnimationFrame', (f: (now: number) => void) => {
    frame = f;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('theme', () => {
  it('is Deep Canvas until one is chosen, and ignores bad saved values', () => {
    expect(getTheme()).toBe('canvas');
    memory.set('inknexus-theme', JSON.stringify('neon'));
    expect(getTheme()).toBe('canvas');
  });
  it('saves the chosen theme, sets it on the page, and colors the browser bar', () => {
    setTheme('eink');
    expect(getTheme()).toBe('eink');
    expect(root.dataset.theme).toBe('eink');
    expect(meta.content).toBe('rgb(244, 244, 240)');
  });
  it('fades the page from the old colors to the new ones over 90ms, then leaves them to the theme', () => {
    root.dataset.theme = 'canvas';
    setTheme('eink');
    expect(inline.get('--bg')).toBe('rgb(18 18 20)');
    frame!(-5);
    expect(inline.get('--bg')).toBe('rgb(18 18 20)');
    frame!(45);
    const mid = rgbOf(inline.get('--bg')!)!;
    // lighter than an even sRGB blend (131), like Safari's bars
    expect(mid[0]).toBeGreaterThan(140);
    expect(mid[0]).toBeLessThan(244);
    frame!(90);
    expect(inline.has('--bg')).toBe(false);
  });
  it('switches at once with reduced motion', () => {
    reduceMotion = true;
    root.dataset.theme = 'canvas';
    setTheme('eink');
    expect(inline.size).toBe(0);
    expect(frame).toBeNull();
  });
  it('switches at once when the colors cannot be read', () => {
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#fff' }));
    setTheme('pulp');
    expect(inline.size).toBe(0);
  });
});

describe('rgbOf and blend', () => {
  it('reads computed rgb() colors and nothing else', () => {
    expect(rgbOf('rgb(18, 18, 20)')).toEqual([18, 18, 20]);
    expect(rgbOf(' rgb(244 244 240)')).toEqual([244, 244, 240]);
    expect(rgbOf('#fff')).toBeNull();
    expect(rgbOf('')).toBeNull();
  });
  it('starts and ends on the two colors, and is lighter than an even blend in between', () => {
    expect(blend([0, 0, 0], [255, 255, 255], 0)).toBe('rgb(0 0 0)');
    expect(blend([0, 0, 0], [255, 255, 255], 1)).toBe('rgb(255 255 255)');
    const [r] = rgbOf(blend([0, 0, 0], [255, 255, 255], 0.5))!;
    expect(r).toBeGreaterThan(128);
    expect(rgbOf(blend([255, 255, 255], [0, 0, 0], 0.5))![0]).toBe(r);
  });
});
