import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCurrentRate, getEarner } from '../services/sdk';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { PROGRAM_ID, EXT_PROGRAM_ID } from '@m0-foundation/solana-m-sdk';

const StatCard = ({ label, value }: { label: string; value: string | number | undefined }) => {
  return (
    <div className="bg-off-blue p-4">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-xl font-bold mt-1">{value ?? '-'}</div>
    </div>
  );
};

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
  const pID = mint === 'M' ? PROGRAM_ID : EXT_PROGRAM_ID;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['earner', pubkey],
    queryFn: () => getEarner(pID, new PublicKey(pubkey!)),
    enabled: !!pubkey,
  });

  const rateQuery = useQuery({
    queryKey: ['rate'],
    queryFn: getCurrentRate,
    enabled: true,
  });

  if (isLoading) return <div className="p-4 text-slate-300">Loading earner data...</div>;
  if (isError) return <div className="p-4 text-red-400">Error loading earner data</div>;

  const { earner, claimedYield, pendingYield, tokenAccount } = data ?? {};

  const tokenBalance = new Decimal(tokenAccount?.amount.toString() || '0').div(1e6).toFixed(4) + ' M';
  const earnedYield = new Decimal(claimedYield?.toString() || '0').div(1e6).toFixed(4) + ' M';
  const pendingYieldValue = new Decimal(pendingYield?.toString() || '0').div(1e6).toFixed(4) + ' M';
  const apy = rateQuery.data?.toFixed(2) ?? '-';

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">Earner Details</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Token Balance" value={tokenBalance} />
        <StatCard label="Earned Yield" value={earnedYield} />
        <StatCard label="Pending Yield" value={pendingYieldValue} />
        <StatCard label="APY" value={apy + '%'} />
      </div>

      <KeyValueDisplay
        data={{
          Address: earner?.pubkey.toBase58(),
          User: earner?.data.user.toBase58(),
          'Token Account': earner?.data.userTokenAccount.toBase58(),
          'Last Claim Index': earner?.data.lastClaimIndex.toString(),
          'Last Claim Timestamp': new Date((earner?.data.lastClaimTimestamp.toNumber() ?? 0) * 1000).toLocaleString(),
          'Recipient Token Account': earner?.data.recipientTokenAccount?.toBase58(),
        }}
      />
    </div>
  );
};
