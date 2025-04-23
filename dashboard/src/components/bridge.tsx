import { useState, useRef, useEffect } from 'react';
import { useAccount } from '../hooks/useAccount';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import { PublicKey } from '@solana/web3.js';
import { useAppKitProvider } from '@reown/appkit/react';
import Decimal from 'decimal.js';
import { toast, ToastContainer } from 'react-toastify';
import { bridgeFromEvm, bridgeFromSolana, checkERC20Allowance, erc20Abi, NETWORK } from '../services/rpc';
import { chainIcons } from './bridges';
import { useSendTransaction } from 'wagmi';
import { switchChain, writeContract } from '@wagmi/core';
import { wagmiAdapter } from '../main';
import { useQuery } from '@tanstack/react-query';

type Chain = {
  name: string;
  label: string;
  icon: string;
  namespace: 'evm' | 'svm';
  id?: number;
};

const chains: Chain[] = [
  {
    name: 'Solana',
    label: 'Solana',
    icon: chainIcons.Solana,
    namespace: 'svm',
  },
  {
    name: NETWORK === 'devnet' ? 'Sepolia' : 'Ethereum',
    label: NETWORK === 'devnet' ? 'Sepolia' : 'Ethereum',
    icon: chainIcons.Ethereum,
    namespace: 'evm',
    id: NETWORK === 'devnet' ? 11155111 : 1,
  },
  {
    name: 'Arbitrum',
    label: NETWORK === 'devnet' ? 'ArbitrumSepolia' : 'Arbitrum',
    icon: chainIcons.Arbitrum,
    namespace: 'evm',
    id: NETWORK === 'devnet' ? 421614 : 42161,
  },
  {
    name: 'Optimism',
    label: NETWORK === 'devnet' ? 'OptimismSepolia' : 'Optimism',
    icon: chainIcons.Optimism,
    namespace: 'evm',
    id: NETWORK === 'devnet' ? 11155420 : 10,
  },
];

// Dropdown component for chain selection
const ChainDropdown = ({ selectedChain, onChange }: { selectedChain: Chain; onChange: (chain: Chain) => void }) => {
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
              onClick={() => handleSelect(chain)}
              className={
                'flex items-center space-x-2 px-4 py-2 w-full text-left hover:bg-gray-100 hover:cursor-pointer'
              }
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
  const { isConnected, solanaBalances, evmBalances, isSolanaWallet, address, caipAddress } = useAccount();
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const { sendTransaction, isPending } = useSendTransaction();

  const [amount, setAmount] = useState<string>('');
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [inputChain, setInputChain] = useState<Chain>(chains[0]);
  const [outputChain, setOutputChain] = useState<Chain>(chains[1]);
  
  const [displayNonceInput, setDisplayNonceInput] = useState<boolean>(false);
  const [nonceAccount, setNonceAccount] = useState<string>('');

  const allowanceQuery = useQuery({
    queryKey: ['allowance', address],
    queryFn: () => checkERC20Allowance(address! as `0x${string}`),
    enabled: isConnected && !!address && inputChain.namespace === 'evm',
    refetchInterval: 5000,
  });

  // handle allowance check errors
  useEffect(() => {
    if (allowanceQuery.isError) {
      toast.error(<div>Failed to check allowance: {allowanceQuery.error.toString()}</div>);
    }
  }, [allowanceQuery.isError, allowanceQuery.error]);

  // handle connected wallet change
  useEffect(() => {
    if (!caipAddress) return;
    const [namespace, chainId, _] = caipAddress.split(':');

    // set to selected network
    if (namespace === 'eip155') {
      handleInputChainChange(chains.find((c) => c.id === parseInt(chainId)) ?? chains[0]);
    } else {
      handleInputChainChange(chains[0]);
    }
  }, [caipAddress]);

  const handleInputChainChange = async (chain: Chain) => {
    setInputChain(chain);
    // Ensure briding is from EVM to SVM
    if (outputChain.namespace === chain.namespace) {
      // Find the first chain that's not the same namespace
      const newOutputChain = chains.find((c) => c.namespace !== chain.namespace);
      if (newOutputChain) {
        setOutputChain(newOutputChain);
      }
    }

    if (chain.namespace == 'evm') {
      await switchChain(wagmiAdapter.wagmiConfig, { chainId: chain.id! });
    }
  };

  const handleOutputChainChange = (chain: Chain) => {
    setOutputChain(chain);
    if (inputChain.namespace === chain.namespace) {
      const newInputChain = chains.find((c) => c.namespace !== chain.namespace);
      if (newInputChain) {
        setInputChain(newInputChain);
      }
    }
  };

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
    const balances = inputChain.name === 'Solana' ? solanaBalances : evmBalances;
    setAmount(balances.M?.toString() ?? '0');
  };

  const handleBridge = async () => {
    const amountValue = new Decimal(amount).mul(1e6).floor();

    try {
      setIsLoading(true);

      let sig: string;
      if (inputChain.namespace === 'svm') {
        if (nonceAccount === '') {
          sig = await bridgeFromSolana(walletProvider, amountValue, recipientAddress, outputChain.label);
        } else {
          let noncePubkey;
          try {
            noncePubkey = new PublicKey(nonceAccount);
          } catch (error) {
            throw new Error('Invalid nonce account address');
          }
          sig = await bridgeFromSolana(walletProvider, amountValue, recipientAddress, outputChain.label, noncePubkey);
        }
      } else {
        sig = await bridgeFromEvm(sendTransaction, address, amountValue, recipientAddress, inputChain.label);
      }

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
      console.error(error);

      toast.error(<div>Transaction failed: {error instanceof Error ? error.message : 'Unknown error'}</div>);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setIsLoading(true);

      const amountValue = new Decimal(amount).mul(1e6).floor().toString();

      const hash = await writeContract(wagmiAdapter.wagmiConfig, {
        address: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
        abi: erc20Abi,
        functionName: 'approve',
        args: ['0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd', BigInt(amountValue)],
      });

      toast.success(
        <div>
          <div>Approval successful!</div>
          <a
            href={`${inputChain.id === 11155111 ? 'https://sepolia.etherscan.io' : 'https://etherscan.io'}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            View on Etherscan
          </a>
        </div>,
      );

      // Refetch allowance
      allowanceQuery.refetch();
    } catch (error) {
      console.error(error);
      toast.error(<div>Approval failed: {error instanceof Error ? error.message : 'Unknown error'}</div>);
    } finally {
      setIsLoading(false);
    }
  };

  // check for valid values
  const isValidAmount = amount !== '' && parseFloat(amount) > 0;
  const isValidRecipient = recipientAddress.trim() !== '';
  const validWallet = isConnected && (isSolanaWallet ? inputChain.name === 'Solana' : inputChain.name !== 'Solana');
  const buttonDisabled = !isConnected || !isValidAmount || !isValidRecipient || isLoading || !validWallet;
  const hasAllowance =
    inputChain.name === 'Solana' || (isValidAmount && (allowanceQuery.data ?? 0n) >= BigInt(isValidAmount));

  const handleNonceCheckBox = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setDisplayNonceInput(checked);
  };

  const handleNonceAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // allow base58 address
    if (value === '' || /^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) {
      setNonceAccount(value);
    }
  };

  return (
    <div className="flex justify-center mt-20">
      <div className="p-6 w-full max-w-md">
        <div className="mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-2 text-gray-400 text-xs">Input Chain</label>
              <ChainDropdown selectedChain={inputChain} onChange={handleInputChainChange} />
            </div>
            <div>
              <label className="block mb-2 text-gray-400 text-xs">Output Chain</label>
              <ChainDropdown selectedChain={outputChain} onChange={handleOutputChainChange} />
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2 text-gray-400 text-xs">
            <label>M Amount</label>
            <div>
              Balance: {(inputChain.name === 'Solana' ? solanaBalances : evmBalances).M?.toFixed(4) ?? '0.00'}
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
              placeholder={inputChain.name === 'Solana' ? '0x...' : ''}
              className="w-full bg-off-blue py-3 px-4 focus:outline-none"
            />
          </div>
        </div>

        {inputChain.namespace === 'svm' && (
          <div className="mb-6 text-xs text-gray-400 flex items-center">
            <input type="checkbox" onChange={handleNonceCheckBox} id="durableNonce" className="mr-2" />
            <label htmlFor="durableNonce">
              Use durable nonce? Allows for signing operations that take more than ~90 seconds to complete.
            </label>
          </div>
        )}

        {inputChain.namespace === 'svm' && displayNonceInput && (
          <div className="mb-6">
            <div className="mb-2 text-gray-400 text-xs">
              <label>Nonce Account Pubkey</label>
            </div>
            <input
              type="text"
              value={nonceAccount}
              onChange={handleNonceAccountChange}
              placeholder=""
              className="w-full bg-off-blue py-3 px-4 focus:outline-none"
            />
          </div>
        )}

        <button
          onClick={hasAllowance ? handleBridge : handleApprove}
          disabled={buttonDisabled}
          className={`w-full py-3 hover:cursor-pointer ${
            buttonDisabled ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {!validWallet ? (
            `Connect ${inputChain.name} Wallet`
          ) : isLoading || isPending ? (
            <div className="flex items-center justify-center animate-pulse transition-opacity duration-1000">
              <span className="loader mr-2"></span>Processing...
            </div>
          ) : hasAllowance ? (
            'Bridge'
          ) : (
            'Approve'
          )}
        </button>
        <div className="mt-5 text-xs text-gray-400 text-center">Bridge M using Wormhole</div>
      </div>
      <ToastContainer position="bottom-right" autoClose={5000} />
    </div>
  );
};
