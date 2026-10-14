import { useApp } from '../context';
import { ThemePicker } from '../components/ThemePicker';

export function Settings() {
  const { goBack } = useApp();
  return (
    <>
      <div className="backbar">
        <button className="ibtn" aria-label="Back" onClick={() => goBack({ name: 'library' })}>
          ‹
        </button>
      </div>
      <header>
        <h1>Settings</h1>
      </header>
      <ThemePicker />
    </>
  );
}
