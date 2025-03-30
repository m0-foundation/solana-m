import { useState } from 'react';
import { SettingsModal } from './settings';
import { FiSettings } from 'react-icons/fi';

export const Navbar = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <nav className="bg-off-black py-2">
      <div className="max-w-6xl mx-auto flex justify-between">
        <div className="flex">
          <a href="/" className="flex mr-15 space-x-3">
            <img
              src="https://dashboard.m0.org/img/logos/m0.svg"
              alt="M0 Logo"
              className="py-3 pr-3 mb-1 border-r border-gray-700"
            />
            <div className="text-white text-lg flex items-center">Solana Dashboard</div>
          </a>
          <div className="space-x-4 flex items-center">
            {[
              { path: '/', label: 'Home' },
              { path: '/yield', label: 'Yield' },
            ].map(({ path, label }) => (
              <a
                key={path}
                href={path}
                className={`px-2 py-1.5 text-gray-300 text-sm ${
                  window.location.pathname === path ? 'bg-gray-700' : ''
                }`}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="text-gray-300 hover:text-white hover:cursor-pointer"
          aria-label="Settings"
        >
          <FiSettings className="w-5 h-5" />
        </button>
      </div>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </nav>
  );
};
