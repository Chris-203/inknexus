import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

try {
  void navigator.storage?.persist?.();
} catch {
  // Not supported: the library still saves, the browser may just clear it under storage pressure.
}

// The app never zooms as a whole, like a native app; only the reader's pages zoom (lib/zoom.ts). touch-action in
// styles.css stops pinch and double-tap zoom, and Safari's gesture events stop the pinches it still lets through.
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
