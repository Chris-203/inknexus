import { setTheme, THEMES, useTheme } from '../lib/theme';

/** Chips for the color themes; the chosen one is highlighted. */
export function ThemePicker() {
  const theme = useTheme();
  return (
    <>
      <p className="hint">Colors</p>
      <div className="chips wrap">
        {THEMES.map((t) => (
          <button key={t.id} className={`chip${theme === t.id ? ' on' : ''}`} aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
    </>
  );
}
