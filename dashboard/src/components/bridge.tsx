import { useState, useRef, useEffect } from 'react';
import { useAccount } from '../hooks/useAccount';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import { useAppKitProvider } from '@reown/appkit/react';
import Decimal from 'decimal.js';
import { toast, ToastContainer } from 'react-toastify';
import { bidgeFromSolana } from '../services/rpc';
import { chainIcons } from './bridges';

type Chain = {
  name: string;
  icon: string;
};

const chains: Chain[] = [
  {
    name: 'Solana',
    icon: chainIcons.Solana,
  },
  {
    name: 'Ethereum',
    icon: chainIcons.Ethereum,
  },
  {
    name: 'Optimism',
    icon: chainIcons.Optimism,
  },
  {
    name: 'Arbitrum',
    icon: chainIcons.Arbitrum,
  },
];

// Dropdown component for chain selection
const ChainDropdown = ({
  selectedChain,
  onChange,
  options,
}: {
  selectedChain: Chain;
  onChange: (chain: Chain) => void;
  options: string[];
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (chain: Chain) => {
    onChange(chain);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button className="flex items-center space-x-2 bg-off-blue px-4 py-2" onClick={() => setIsOpen(!isOpen)}>
        <img src={selectedChain.icon} alt={selectedChain.name} className="w-6 h-6 rounded-full" />
        <span>{selectedChain.name}</span>
      </button>
      {isOpen && (
        <div className="absolute bg-off-blue mt-2 w-full z-10">
          {chains.map((chain) => (
            <button
              key={chain.name}
              disabled={!options.includes(chain.name)}
              onClick={() => handleSelect(chain)}
              className={`flex items-center space-x-2 px-4 py-2 w-full text-left ${
                !options.includes(chain.name) ? 'text-gray-400 cursor-not-allowed' : 'hover:bg-gray-100'
              }`}
            >
              <img src={chain.icon} alt={chain.name} className="w-6 h-6" />
              <span>{chain.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const Bridge = () => {
  const { isConnected, solanaBalances } = useAccount();
  const { walletProvider } = useAppKitProvider<Provider>('solana');

  const [amount, setAmount] = useState<string>('');
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [inputChain, setInputChain] = useState<Chain>(chains[0]);
  const [outputChain, setOutputChain] = useState<Chain>(chains[1]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // allow empty string, digits, and at most one decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      if (value.split('.').length > 2) return;
      setAmount(value);
    }
  };

  const handleRecipientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRecipientAddress(e.target.value.trim());
  };

  const handleMaxClick = () => {
    setAmount(solanaBalances.M?.toString() ?? '0');
  };

  const handleBridge = async () => {
    const amountValue = new Decimal(amount).mul(1e6).floor();

    try {
      setIsLoading(true);
      const sig = await bidgeFromSolana(walletProvider, amountValue, recipientAddress as `0x${string}`);
      const txUrl = `https://wormholescan.io/#/tx/${sig}?network=Testnet`;

      // give an extra second for the transaction to be confirmed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toast.success(
        <div>
          <div>Bridge successful!</div>
          <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
            View on WormholeScan
          </a>
        </div>,
      );
    } catch (error) {
      console.error('Error:', error);

      toast.error(<div>Transaction failed: {error instanceof Error ? error.message : 'Unknown error'}</div>);
    } finally {
      setIsLoading(false);
    }
  };

  // check for valid values
  const isValidAmount = amount !== '' && parseFloat(amount) > 0;
  const isValidRecipient = recipientAddress.trim() !== '' && recipientAddress.startsWith('0x');

  return (
    <div className="flex justify-center mt-20">
      <div className="p-6 w-full max-w-md">
        <div className="mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-2 text-gray-400 text-xs">Input Chain</label>
              <ChainDropdown selectedChain={inputChain} onChange={setInputChain} options={['Solana']} />
            </div>
            <div>
              <label className="block mb-2 text-gray-400 text-xs">Output Chain</label>
              <ChainDropdown selectedChain={outputChain} onChange={setOutputChain} options={['Ethereum']} />
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2 text-gray-400 text-xs">
            <label>M Amount</label>
            <div>
              Balance: {solanaBalances.M?.toFixed(4) ?? '0.00'}
              <button onClick={handleMaxClick} className="ml-2 text-blue-400 hover:text-blue-300 hover:cursor-pointer">
                MAX
              </button>
            </div>
          </div>
          <div className="relative flex items-center">
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.0"
              className="w-full bg-off-blue py-3 px-4 pr-20 focus:outline-none"
            />
            <div className="absolute right-2 flex items-center space-x-1">
              <img src={'https://media.m0.org/logos/svg/M_Symbol_512.svg'} className="w-6 h-6 -translate-y-0.5" />
              <span className="w-8">M</span>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2 text-gray-400 text-xs">
            <label>Recipient Address</label>
          </div>
          <div className="relative flex items-center">
            <input
              type="text"
              value={recipientAddress}
              onChange={handleRecipientChange}
              placeholder="0x..."
              className="w-full bg-off-blue py-3 px-4 focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={handleBridge}
          disabled={!isConnected || !isValidAmount || !isValidRecipient || isLoading}
          className={`w-full py-3 hover:cursor-pointer ${
            !isValidAmount || !isValidRecipient || isLoading
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {!isConnected ? (
            'Connect Wallet'
          ) : isLoading ? (
            <div className="flex items-center justify-center animate-pulse transition-opacity duration-1000">
              <span className="loader mr-2"></span>Processing...
            </div>
          ) : (
            'Bridge'
          )}
        </button>
        <div className="mt-5 text-xs text-gray-400 text-center">Bridge M using Wormhole</div>
      </div>
      <ToastContainer position="bottom-right" autoClose={5000} />
    </div>
  );
};
