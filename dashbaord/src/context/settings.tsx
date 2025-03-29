import React, { createContext, useState, useContext } from 'react';

interface SettingsContextType {
  rpcUrl: string;
  graphqlUrl: string;
  updateRpcUrl: (url: string) => void;
  updateGraphqlUrl: (url: string) => void;
}

const defaultSettings = {
  rpcUrl: import.meta.env.VITE_RPC_URL,
  graphqlUrl: import.meta.env.VITE_SUBGRAPH_URL,
  updateRpcUrl: () => {},
  updateGraphqlUrl: () => {},
};

const SettingsContext = createContext<SettingsContextType>(defaultSettings);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rpcUrl, setRpcUrl] = useState<string>(() => {
    return localStorage.getItem('rpcUrl') || defaultSettings.rpcUrl;
  });

  const [graphqlUrl, setGraphqlUrl] = useState<string>(() => {
    return localStorage.getItem('graphqlUrl') || defaultSettings.graphqlUrl;
  });

  const updateRpcUrl = (url: string) => {
    setRpcUrl(url);
    localStorage.setItem('rpcUrl', url);
  };

  const updateGraphqlUrl = (url: string) => {
    setGraphqlUrl(url);
    localStorage.setItem('graphqlUrl', url);
  };

  return (
    <SettingsContext.Provider value={{ rpcUrl, graphqlUrl, updateRpcUrl, updateGraphqlUrl }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
