import { getDefaultTheme, getTheme, saveTheme, setTheme } from './theme';

const memory = new Map<string, string>();
const root = { dataset: {} as Record<string, string> };
const body = { style: { setProperty: vi.fn() } };
const meta = { content: '', setAttribute: (_: string, v: string) => void (meta.content = v) };
// What getComputedStyle gives for --bg in each theme.
const BG: Record<string, string> = { sumi: '#0D0D14', eink: '#f4f4f0' };
const frame = vi.fn();

beforeEach(() => {
  memory.clear();
  root.dataset = {};
  frame.mockClear();
  body.style.setProperty.mockClear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
  vi.stubGlobal('document', { documentElement: root, body, querySelector: () => meta });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => ` ${BG[root.dataset.theme ?? ''] ?? '#0D0D14'}` }));
  vi.stubGlobal('requestAnimationFrame', frame);
  // Stop trying a theme left from the last test.
  setTheme('sumi');
});
afterEach(() => vi.unstubAllGlobals());

describe('theme', () => {
  it('is Sumi Ink until one is chosen, and ignores bad saved values', () => {
    expect(getTheme()).toBe('sumi');
    memory.set('inknexus-theme', JSON.stringify('bogus'));
    expect(getTheme()).toBe('sumi');
  });
  it('falls back to Sumi Ink for the removed Deep Canvas and Vintage Pulp themes', () => {
    memory.set('inknexus-theme', JSON.stringify('canvas'));
    expect(getTheme()).toBe('sumi');
    memory.set('inknexus-theme', JSON.stringify('pulp'));
    expect(getTheme()).toBe('sumi');
  });
  it('shows a tapped theme on the page and colors the browser bar, without saving it', () => {
    setTheme('eink');
    expect(getTheme()).toBe('eink');
    expect(root.dataset.theme).toBe('eink');
    expect(meta.content).toBe('#f4f4f0');
    expect(getDefaultTheme()).toBe('sumi');
    expect(memory.has('inknexus-theme')).toBe(false);
  });
  it('saves the theme on show as the default', () => {
    setTheme('eink');
    saveTheme();
    expect(getDefaultTheme()).toBe('eink');
    expect(memory.get('inknexus-theme')).toBe(JSON.stringify('eink'));
    setTheme('washi');
    setTheme('eink');
    expect(getTheme()).toBe('eink');
  });
  it('goes back to the default when it is tapped again', () => {
    memory.set('inknexus-theme', JSON.stringify('mist'));
    setTheme('eink');
    setTheme('mist');
    expect(getTheme()).toBe('mist');
    memory.set('inknexus-theme', JSON.stringify('washi'));
    expect(getTheme()).toBe('washi');
  });
  it('switches every color at once, with no fade left for Safari to read an in-between color from', () => {
    root.dataset.theme = 'sumi';
    setTheme('eink');
    expect(root.dataset.theme).toBe('eink');
    expect(body.style.setProperty).not.toHaveBeenCalled();
    expect(frame).not.toHaveBeenCalled();
    setTheme('sumi');
    expect(meta.content).toBe('#0D0D14');
  });
});
