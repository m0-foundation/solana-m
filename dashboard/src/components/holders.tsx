import { useQuery } from '@tanstack/react-query';
import { tokenHolders } from '../services/subgraph';
import { useSettings } from '../context/settings';
import { PublicKey } from '@solana/web3.js';

export const Holders = () => {
  const { graphqlUrl, rpcUrl } = useSettings();
  const totalSupply = 10;

  const { data, isLoading, error } = useQuery({
    queryKey: ['tokenHolders'],
    queryFn: () => tokenHolders(graphqlUrl),
  });

  return (
    <div>
      <div className="text-2xl">$M Holders</div>
      <table className="w-full text-sm text-left rtl:text-right">
        <thead className="text-xs border-b border-gray-200">
          <tr>
            <th className="px-2 py-3">Address</th>
            <th className="px-2 py-3">Amount</th>
            <th className="px-2 py-3">Share</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((holder) => (
            <tr key={holder.user.toString()} className="border-b border-gray-200">
              <td className="px-2 py-4">
                <a
                  href={`https://solscan.io/account/${holder.user.toBase58()}${
                    rpcUrl.includes('devnet') ? '?cluster=devnet' : ''
                  }`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {formatAddress(holder.user)}
                </a>
              </td>
              <td className="px-2 py-4">M {formatAmount(holder.balance)}</td>
              <td className="px-2 py-4">{holder.balance / totalSupply}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
