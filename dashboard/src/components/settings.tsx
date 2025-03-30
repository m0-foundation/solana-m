import React, { useState } from 'react';
import { useSettings } from '../context/settings';
import { useQueryClient } from '@tanstack/react-query';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const { rpcUrl, graphqlUrl, updateRpcUrl, updateGraphqlUrl } = useSettings();
  const [tempRpcUrl, setTempRpcUrl] = useState(rpcUrl);
  const [tempGraphqlUrl, setTempGraphqlUrl] = useState(graphqlUrl);

  if (!isOpen) return null;

  const handleSave = () => {
    updateRpcUrl(tempRpcUrl);
    updateGraphqlUrl(tempGraphqlUrl);
    queryClient.clear();
    onClose();
  };

  const handleCancel = () => {
    setTempRpcUrl(rpcUrl);
    setTempGraphqlUrl(graphqlUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 flex justify-center items-center z-50 text-white">
      <div className="absolute inset-0 backdrop-blur-xs" onClick={handleCancel}></div>
      <div className="bg-off-black p-6 w-full max-w-md z-10 relative">
        <h2 className="text-xl font-medium mb-4">Settings</h2>

        <div className="mb-4">
          <label htmlFor="rpc-url" className="block text-gray-300 mb-2 text-sm">
            RPC URL
          </label>
          <input
            value={tempRpcUrl}
            onChange={(e) => setTempRpcUrl(e.target.value)}
            className="w-full bg-gray-600 p-2 focus:outline-none"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="graphql-url" className="block text-gray-300 mb-2 text-sm">
            Subgraph URL
          </label>
          <input
            value={tempGraphqlUrl}
            onChange={(e) => setTempGraphqlUrl(e.target.value)}
            className="w-full bg-gray-600 p-2 focus:outline-none"
          />
        </div>

        <div className="flex justify-end space-x-3">
          <button onClick={handleCancel} className="px-4 py-2 bg-gray-600  hover:bg-gray-500 hover:cursor-pointer">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 hover:cursor-pointer">
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
