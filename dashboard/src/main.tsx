import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navbar } from './components/navbar';
import { StatsBar } from './components/statsbar';
import { SettingsProvider } from './context/settings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Holders } from './components/holders';
import { Route, BrowserRouter, Routes } from 'react-router-dom';
import { HistoricalSupply } from './components/historical-supply';
import { Bridges } from './components/bridges';

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
        <BrowserRouter>
          <Navbar />
          <Routes>
            <Route
              path="/"
              element={
                <div className="h-[93vh] overflow-y-scroll">
                  <StatsBar />
                  <div className="max-w-6xl mx-auto py-10 space-y-16">
                    <HistoricalSupply />
                    <Holders token="M" />
                    <Holders token="wM" />
                    <Bridges />
                  </div>
                </div>
              }
            />
            <Route path="/wrap" element={<div>Not yet implemented</div>} />
            <Route path="/bridge" element={<div>Not yet implemented</div>} />
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
