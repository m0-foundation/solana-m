import { useState } from 'react';
import { SettingsModal } from './settings';
import { FiSettings } from 'react-icons/fi';

export const Navbar = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <nav className="bg-off-black px-4 py-5">
      <div className="max-w-6xl mx-auto flex items-center">
        <div className="flex items-center mr-15">
          <a href="/" className="flex items-center">
            <div className="flex items-center space-x-3">
              <img src="https://dashboard.m0.org/img/logos/m0.svg" alt="M0 Logo" />
              <div className="h-6 w-px bg-gray-600" />
              <span className="text-white text-xl">Solana Dashboard</span>
            </div>
          </a>
        </div>
        <div className="flex items-center">
          <div className="space-x-4 mr-6">
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
