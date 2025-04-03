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
import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, arbitrum, sepolia, solana, optimism, solanaDevnet } from '@reown/appkit/networks';

import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
    },
  },
});

export const wagmiAdapter = new WagmiAdapter({
  ssr: false,
  projectId: '96a8a899ba083d0ebfcf99d9ebf50049',
  networks: [mainnet, arbitrum, sepolia, optimism],
});

const solanaWeb3JsAdapter = new SolanaAdapter();

const metadata = {
  name: 'Solana - M',
  description: 'M dashboard and utilities for Solana',
  url: 'https://dashboard-development-a79e.up.railway.app/',
  icons: ['https://media.m0.org/logos/svg/M_Symbol_512.svg'],
};

createAppKit({
  adapters: [wagmiAdapter, solanaWeb3JsAdapter],
  networks: [mainnet, arbitrum, optimism, sepolia, solana, solanaDevnet],
  metadata: metadata,
  projectId: '96a8a899ba083d0ebfcf99d9ebf50049',
  features: {
    swaps: false,
    onramp: false,
    email: false,
    socials: false,
    history: false,
    analytics: false,
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
