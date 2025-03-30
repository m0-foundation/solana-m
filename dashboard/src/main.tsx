import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navbar } from './components/navbar';
import { StatsBar } from './components/statsbar';
import { SettingsProvider } from './context/settings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Holders } from './components/holders';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <Navbar />
        <StatsBar />
        <Holders />
      </SettingsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
