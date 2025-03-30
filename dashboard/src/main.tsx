import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navbar } from './components/navbar';
import { StatsBar } from './components/statsbar';
import './index.css';
import { SettingsProvider } from './context/settings';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <Navbar />
      <StatsBar />
    </SettingsProvider>
  </StrictMode>,
);
