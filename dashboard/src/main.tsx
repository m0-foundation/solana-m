import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navbar } from './components/navbar';
import { StatsBar } from './components/statsbar';
import { SettingsProvider } from './context/settings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Holders } from './components/holders';
import { HistoricalSupply } from './components/historical-supply';
import './index.css';
import { Bridges } from './components/bridges';

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
        <div className="max-w-6xl mx-auto py-10 space-y-16">
          <HistoricalSupply />
          <Holders token="M" />
          <Holders token="wM" />
          <Bridges />
        </div>
      </SettingsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
