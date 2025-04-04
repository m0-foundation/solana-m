import { useState } from 'react';

enum TabType {
  WRAP = 'wrap',
  UNWRAP = 'unwrap',
}

export const Wrap = () => {
  const connected = true;
  const [activeTab, setActiveTab] = useState<TabType>(TabType.WRAP);
  const [amount, setAmount] = useState(0);

  const [mBalance, setMBalance] = useState(0);
  const [wMBalance, setwMBalance] = useState(0);
  const isWrapping = activeTab === TabType.WRAP;

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setAmount(0);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(parseFloat(value) ?? 0);
    }
  };

  const handleMaxClick = () => {
    if (isWrapping) {
      setAmount(mBalance);
    } else {
      setAmount(wMBalance);
    }
  };

  const handleWrapUnwrap = async () => {
    console.log(`${isWrapping ? 'Wrapping' : 'Unwrapping'} ${amount} SOL`);
  };

  return (
    <div className="flex justify-center mt-20">
      <div className="p-6 w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="flex">
            {[TabType.WRAP, TabType.UNWRAP].map((tab) => (
              <button
                className={`px-4 py-2 w-30 ${
                  activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                }`}
                onClick={() => handleTabChange(tab)}
              >
                {tab.toString()}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2 text-gray-400 text-xs">
            <label>{isWrapping ? 'M Amount' : 'wM Amount'}</label>
            <div>
              Balance: {isWrapping ? mBalance.toFixed(4) : wMBalance.toFixed(4)}
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
              className="w-full bg-gray-200 py-3 px-4 pr-20 focus:outline-none"
            />
            <div className="absolute right-2 flex space-x-1">
              <img
                src={
                  isWrapping
                    ? 'https://media.m0.org/logos/svg/M_Symbol_512.svg'
                    : 'https://media.m0.org/logos/svg/wM_Symbol_512.svg'
                }
                className="w-6 h-6"
              />
              <div className="w-8">{isWrapping ? 'M' : 'wM'}</div>
            </div>
          </div>
        </div>

        {connected ? (
          <button
            onClick={handleWrapUnwrap}
            disabled={!amount || amount <= 0}
            className={`w-full py-3 ${
              !amount || amount <= 0
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isWrapping ? 'Wrap M' : 'Unwrap wM'}
          </button>
        ) : (
          <appkit-button size="sm" balance="hide" />
        )}

        <div className="mt-5 text-xs text-gray-400 text-center">
          {isWrapping ? 'Wrapping converts M to wM for use with DeFi protocols' : 'Unwrapping converts wM back to M'}
        </div>
      </div>
    </div>
  );
};
