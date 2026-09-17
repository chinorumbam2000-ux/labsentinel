import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container #root was not found in index.html.');
}

createRoot(container).render(
  <StrictMode>
    {/*
      Opt in to the v7 behaviours React Router 6.26 already supports. This
      silences the future-flag warnings using the installed version's own
      options rather than upgrading the dependency.
    */}
    {/*
      basename comes from Vite's base, so routes resolve correctly whether the
      app is served from the domain root (dev) or a sub-path (GitHub Pages).
    */}
    <BrowserRouter
      basename={import.meta.env.BASE_URL}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </BrowserRouter>
  </StrictMode>,
);
