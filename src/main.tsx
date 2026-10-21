import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {captureOwnerKey} from './owner';
import {applyTheme, storedTheme} from './themes';

// Before the app reads the address: #owner=... is a key to keep, not a film to open.
captureOwnerKey();
applyTheme(storedTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
