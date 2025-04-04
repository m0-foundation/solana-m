import { useAppKitAccount } from '@reown/appkit/react';
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { useSettings } from '../context/settings';
import { M_MINT, wM_MINT } from '../services/consts';
import { getBalance } from '@wagmi/core';
import { wagmiAdapter } from '../main';

interface TokenBalance {
  M?: Decimal;
  wM?: Decimal;
}

export const useAccount = () => {
  const { rpcUrl } = useSettings();
  const { isConnected, address, caipAddress } = useAppKitAccount();
  const [solanaBalances, setSolanaBalances] = useState<TokenBalance>({});
  const [evmBalances, setEvmBalances] = useState<TokenBalance>({});

  const isSolanaWallet = !!address && !address.startsWith('0x');
  const isEvmWallet = !!address && address.startsWith('0x');

  useEffect(() => {
    const fetchBalances = async () => {
      if (!isConnected || !address) {
        return;
      }

      if (isSolanaWallet) {
        try {
          const connection = new Connection(rpcUrl);
          const pubkey = new PublicKey(address);

          // Fetch all token accounts owned by this wallet
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
            programId: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
          });

          // Filter for our specific mints
          const solanaBalances: TokenBalance = {};
          for (const account of tokenAccounts.value) {
            const tokenMint = account.account.data.parsed.info.mint;
            const tokenAmount = account.account.data.parsed.info.tokenAmount.uiAmount.toString();

            if (tokenMint === M_MINT.toBase58()) {
              solanaBalances.M = new Decimal(tokenAmount);
            }
            if (tokenMint === wM_MINT.toBase58()) {
              solanaBalances.wM = new Decimal(tokenAmount);
            }
          }

          setSolanaBalances(solanaBalances);
        } catch (error) {
          console.error('Error fetching Solana token balances:', error);
        }
      }

      if (isEvmWallet) {
        try {
          const mBalance = await getBalance(wagmiAdapter.wagmiConfig, {
            address: address as `0x${string}`,
            token: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
          });
          const wmBalance = await getBalance(wagmiAdapter.wagmiConfig, {
            address: address as `0x${string}`,
            token: '0x437cc33344a0B27A429f795ff6B469C72698B291',
          });
          setEvmBalances({
            M: new Decimal(mBalance.value.toString()).div(1e6),
            wM: new Decimal(wmBalance.value.toString()).div(1e6),
          });
        } catch (error) {
          console.error('Error fetching EVM token balances:', error);
        }
      }
    };

    fetchBalances();
  }, [isConnected, caipAddress]);

  return {
    isConnected,
    address,
    isSolanaWallet,
    isEvmWallet,
    solanaBalances,
    evmBalances,
  };
};
