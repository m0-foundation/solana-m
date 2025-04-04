import { useState } from 'react';
import { useAccount } from '../hooks/useAccount';

enum TabType {
  WRAP = 'wrap',
  UNWRAP = 'unwrap',
}

export const Wrap = () => {
  const { isConnected, address, solanaBalances, evmBalances } = useAccount();
  console.log('EVM', evmBalances.M?.toString(), evmBalances.wM?.toString());

  const [activeTab, setActiveTab] = useState<TabType>(TabType.WRAP);
  const [amount, setAmount] = useState<string>('');
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
    const amountValue = parseFloat(amount) || 0;
    console.log(`${isWrapping ? 'Wrapping' : 'Unwrapping'} ${amountValue} SOL`);
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
          disabled={invalidWalletConnect || !isValidAmount}
          className={`w-full py-3 ${
            !isValidAmount ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {invalidWalletConnect ? 'Connect Solana Wallet' : isWrapping ? 'Wrap M' : 'Unwrap wM'}
        </button>

        <div className="mt-5 text-xs text-gray-400 text-center">
          {isWrapping ? 'Wrapping converts M to wM for use with DeFi protocols' : 'Unwrapping converts wM back to M'}
        </div>
      </div>
    </div>
  );
};
