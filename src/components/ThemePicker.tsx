import { setTheme, THEMES, useTheme } from '../lib/theme';

/** A card per color theme with a small preview drawn in its colors; the chosen one is outlined. */
export function ThemePicker() {
  const theme = useTheme();
  return (
    <>
      <p className="hint">Theme</p>
      <div className="themes">
        {THEMES.map((t) => (
          <button key={t.id} className="theme" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
            <span className="tprev" data-theme={t.id} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            {t.name}
          </button>
        ))}
      </div>
    </>
  );
}
