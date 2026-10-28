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

// Opens the app without a connection and serves chapters saved for offline reading (public/sw.js). Only in the built
// app: under Vite's development server it would stand between the page and files that change as they are edited.
if (import.meta.env.PROD)
  navigator.serviceWorker?.register('/sw.js').catch(() => {
    // Without it the app works as before, online only, and offers no saving.
  });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
