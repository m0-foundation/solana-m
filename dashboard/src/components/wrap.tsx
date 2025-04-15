import { useState } from 'react';
import { useAccount } from '../hooks/useAccount';
import { NETWORK, wrapOrUnwrap } from '../services/rpc';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import { useAppKitProvider } from '@reown/appkit/react';
import Decimal from 'decimal.js';
import { toast, ToastContainer } from 'react-toastify';

enum TabType {
  WRAP = 'wrap',
  UNWRAP = 'unwrap',
}

export const Wrap = () => {
  const { isConnected, address, solanaBalances } = useAccount();
  const { walletProvider } = useAppKitProvider<Provider>('solana');

  const [activeTab, setActiveTab] = useState<TabType>(TabType.WRAP);
  const [amount, setAmount] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isWrapping = activeTab === TabType.WRAP;

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setAmount('');
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // allow empty string, digits, and at most one decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      if (value.split('.').length > 2) return;
      setAmount(value);
    }
  };

  const handleMaxClick = () => {
    if (isWrapping) {
      setAmount(solanaBalances.M?.toString() ?? '0');
    } else {
      setAmount(solanaBalances.wM?.toString() ?? '0');
    }
  };

  const handleWrapUnwrap = async () => {
    const amountValue = new Decimal(amount).mul(1e6).floor();

    try {
      setIsLoading(true);
      const sig = await wrapOrUnwrap(activeTab, walletProvider, amountValue);
      const txUrl = `https://solscan.io/tx/${sig}?cluster=${NETWORK}`;

      // give an extra second for the transaction to be confirmed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toast.success(
        <div>
          <div>Transaction successful!</div>
          <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
            View on Solscan
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
  const invalidWalletConnect = !isConnected || address?.startsWith('0x');

  return (
    <div className="flex justify-center mt-20">
      <div className="p-6 w-full max-w-md">
        <div className="flex space-x-2 mb-6">
          {[TabType.WRAP, TabType.UNWRAP].map((tab) => (
            <button
              className={`px-2 pt-1 hover:cursor-pointer ${activeTab === tab ? 'bg-blue-200 text-blue-600' : ''}`}
              onClick={() => handleTabChange(tab)}
              key={tab}
            >
              {tab === TabType.WRAP ? 'Wrap' : 'Unwrap'}
            </button>
          ))}
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2 text-gray-400 text-xs">
            <label>{isWrapping ? 'M Amount' : 'wM Amount'}</label>
            <div>
              Balance: {(isWrapping ? solanaBalances.M?.toFixed(4) : solanaBalances.wM?.toFixed(4)) ?? '0.00'}
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
              <img
                src={
                  isWrapping
                    ? 'https://media.m0.org/logos/svg/M_Symbol_512.svg'
                    : 'https://media.m0.org/logos/svg/wM_Symbol_512.svg'
                }
                className="w-6 h-6 -translate-y-0.5"
              />
              <span className="w-8">{isWrapping ? 'M' : 'wM'}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleWrapUnwrap}
          disabled={invalidWalletConnect || !isValidAmount || isLoading}
          className={`w-full py-3 hover:cursor-pointer ${
            !isValidAmount || isLoading
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {invalidWalletConnect ? (
            'Connect Solana Wallet'
          ) : isLoading ? (
            <div className="flex items-center justify-center animate-pulse transition-opacity duration-1000">
              <span className="loader mr-2"></span>Processing...
            </div>
          ) : isWrapping ? (
            'Wrap M'
          ) : (
            'Unwrap wM'
          )}
        </button>

        <div className="mt-5 text-xs text-gray-400 text-center">
          {isWrapping ? 'Wrapping converts M to wM for use with DeFi protocols' : 'Unwrapping converts wM back to M'}
        </div>
      </div>
      <ToastContainer position="bottom-right" autoClose={5000} />
    </div>
  );
};
