import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useLensStore } from './lens/store';
import { useDocumentStore } from './state/document';
import { useRegionsStore } from './state/regions';
import './index.css';

// Dev-only: expose stores on window for debugging (SVG render tests, state inspection).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__lens = useLensStore;
  (window as unknown as Record<string, unknown>).__doc = useDocumentStore;
  (window as unknown as Record<string, unknown>).__regions = useRegionsStore;
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
