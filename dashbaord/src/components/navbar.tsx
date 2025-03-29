import { useEffect, useState } from 'react';

export const Navbar = () => {
  const [currentPath, setCurrentPath] = useState('/');

  useEffect(() => {
    setCurrentPath(window.location.pathname);

    const handleRouteChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

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
        <div className="space-x-4">
          <a href="/" className={`${currentPath === '/' ? 'bg-gray-700' : ''} px-2 py-1.5 text-gray-300 text-sm`}>
            Home
          </a>
          <a
            href="/yield"
            className={`${currentPath === '/yield' ? 'bg-gray-700' : ''} px-2 py-1.5 text-gray-300 text-sm`}
          >
            Yield
          </a>
        </div>
      </div>
    </nav>
  );
};
