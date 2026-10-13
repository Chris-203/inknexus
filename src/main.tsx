import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme } from './lib/theme';
import { lockPageZoom } from './lib/zoom';
import './styles.css';

applyTheme();

try {
  void navigator.storage?.persist?.();
} catch {
  // Not supported: the library still saves, the browser may just clear it under storage pressure.
}

lockPageZoom();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
