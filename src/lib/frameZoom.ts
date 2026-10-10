/** Site-view zoom per site, kept on this device only (not in the library or backups). */
const KEY = 'inknexus-frame-zoom';
export const FZ_STEPS = [1, 1.25, 1.5, 1.75, 2] as const;

const read = (): Record<string, unknown> => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export function getFrameZoom(host: string): number {
  const z = read()[host];
  return FZ_STEPS.includes(z as (typeof FZ_STEPS)[number]) ? (z as number) : 1;
}

export function setFrameZoom(host: string, z: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [host]: z }));
  } catch {
    /* storage blocked: the zoom still applies until the view closes */
  }
}

/** The next zoom step after `z`, back to 100% after 200%. One button cycles, so the site bar fits a phone with 44px targets. */
export function nextZoom(z: number): number {
  const i = FZ_STEPS.findIndex((s) => s > z + 0.001);
  return i < 0 ? FZ_STEPS[0] : FZ_STEPS[i]!;
}
