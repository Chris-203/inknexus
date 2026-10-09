/** Site-view zoom per site, kept on this device only (not in the library or backups). */
const KEY = 'inknexus-frame-zoom';
export const FZ_STEPS = [1, 1.25, 1.5, 1.75, 2] as const;

const read = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
};

export const getFrameZoom = (host: string): number => read()[host] || 1;

export function setFrameZoom(host: string, z: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [host]: z }));
  } catch {
    /* storage blocked: the zoom still applies until the view closes */
  }
}

/** The next step up (+1) or down (-1) from `z`, clamped to 100%–200%. */
export function stepZoom(z: number, d: 1 | -1): number {
  const i = FZ_STEPS.findIndex((s) => s >= z - 0.001);
  return FZ_STEPS[Math.min(FZ_STEPS.length - 1, Math.max(0, (i < 0 ? 0 : i) + d))]!;
}
