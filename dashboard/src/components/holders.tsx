import { tokenHolders } from '../services/subgraph';
import { PublicKey } from '@solana/web3.js';
import { getMintsRPC, MINT_ADDRESSES } from '../services/rpc';
import Decimal from 'decimal.js';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';

const labels: { [key: string]: string } = {
  '8vtsGdu4ErjK2skhV7FfPQwXdae6myWjgWJ8gRMnXi2K': 'wM Vault',
};

export const Holders = ({ token }: { token: 'M' | 'wM' }) => {
  const { data: mintData } = useQuery({ queryKey: ['mints'], queryFn: getMintsRPC });
  const { data: holderData } = useQuery({
    queryKey: ['holders:subgraph', token],
    queryFn: () => tokenHolders(MINT_ADDRESSES[token]),
  });

  // use total supply to calc percentage
  const toPercentage = (balance: number) => {
    const supply = mintData?.[token]?.supply.toString();
    if (!supply) return 1;
    return new Decimal(balance).div(new Decimal(supply).div(1e6)).toNumber();
  };

  return (
    <div>
      <div className="text-2xl">${token} Holders</div>
      <table className="w-full text-sm text-left rtl:text-right text-xs">
        <thead className="border-b border-gray-200">
          <tr>
            <th className="px-2 py-3">Address</th>
            <th className="px-2 py-3">Amount</th>
            <th className="px-2 py-3">Share</th>
          </tr>
        </thead>
        <tbody>
          {holderData?.map((holder) => (
            <tr key={holder.user.toString()} className="border-b border-gray-200">
              <td className="px-2 py-4">
                <NavLink
                  to={`/earner/${holder.user.toBase58()}`}
                  className={`hover:underline ${labels[holder.user.toBase58()] ? 'bg-gray-100 py-1 px-2' : ''}`}
                >
                  {labels[holder.user.toBase58()] || formatAddress(holder.user)}
                </NavLink>
              </td>
              <td className="px-2 py-4">
                {token} {formatAmount(holder.balance)}
              </td>
              <td className="px-2 py-4">
                <ProgressBar percentage={toPercentage(holder.balance)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ProgressBar = ({ percentage }: { percentage: number }) => {
  const width = `${Math.min(100, Math.max(0, percentage * 100))}%`;
  return (
    <div className="flex items-center">
      <div className="mr-2 h-2.5 w-15">{(percentage * 100).toFixed(2)}%</div>
      <div className="w-full bg-gray-200 h-2.5 mr-2">
        <div className="bg-blue-600 h-2.5" style={{ width }}></div>
      </div>
    </div>
  );
};

const formatAddress = (address: PublicKey, chars = 6) => {
  const str = address.toBase58();
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
};

const formatAmount = (amount: number, decimals = 4) => {
  return amount.toFixed(decimals);
};
