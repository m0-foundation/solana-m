import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getEarner } from '../services/sdk';
import { PublicKey } from '@solana/web3.js';

const KeyValueDisplay = ({ data }: { data: Record<string, string | undefined> }) => {
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-2 bg-off-blue p-4">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex border-b pb-2">
          <div className="w-1/3 font-medium">{key}</div>
          <div className="w-2/3 break-all">{value ?? '-'}</div>
        </div>
      ))}
    </div>
  );
};

export const EarnerDetails = () => {
  let { pubkey, mint } = useParams();

  const {
    data: earner,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['earner', pubkey],
    queryFn: () => getEarner(mint as 'M' | 'wM', new PublicKey(pubkey!)),
    enabled: !!pubkey,
  });

  if (isLoading) return <div className="p-4 text-slate-300">Loading earner data...</div>;
  if (isError) return <div className="p-4 text-red-400">Error loading earner data</div>;

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">Earner Details</h2>
      <KeyValueDisplay
        data={{
          Address: earner?.pubkey.toBase58(),
          User: earner?.data.user.toBase58(),
          'Token Account': earner?.data.userTokenAccount.toBase58(),
          'Last Claim Index': earner?.data.lastClaimIndex.toString(),
          'Last Claim Timestamp': earner?.data.lastClaimTimestamp.toString(),
          'Recipient Token Account': earner?.data.recipientTokenAccount?.toBase58(),
        }}
      />
    </div>
  );
};
