import { getTheme, setTheme } from './theme';

const memory = new Map<string, string>();
const classes = new Set<string>();
const root = { dataset: {} as Record<string, string>, classList: { add: (c: string) => void classes.add(c), remove: (c: string) => void classes.delete(c) } };
const meta = { content: '', setAttribute: (_: string, v: string) => void (meta.content = v) };
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
  vi.stubGlobal('document', { documentElement: root, querySelector: () => meta });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => ' #f4f4f0' }));
  vi.stubGlobal('window', globalThis);
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
    expect(meta.content).toBe('#f4f4f0');
  });
  it('marks the page as fading for a moment, so its colors fade into the theme', () => {
    vi.useFakeTimers();
    setTheme('pulp');
    expect(classes.has('theming')).toBe(true);
    setTheme('midnight');
    vi.advanceTimersByTime(100);
    expect(classes.has('theming')).toBe(true);
    vi.advanceTimersByTime(60);
    expect(classes.has('theming')).toBe(false);
    vi.useRealTimers();
  });
});
