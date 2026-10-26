import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'react-toastify/dist/ReactToastify.css';
import './styles/global.css';
import App from './App.tsx';

// Aplica o tema salvo antes do primeiro render (evita "piscar" claro/escuro).
try {
  const tema = localStorage.getItem('viapro:tema');
  if (tema === 'light' || tema === 'dark') document.documentElement.dataset.theme = tema;
} catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
