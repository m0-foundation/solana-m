import Decimal from 'decimal.js';
import { useData } from '../hooks/useData';
import { getMintsRPC } from '../services/rpc';

export const StatsBar = () => {
  const { data: mintData } = useData(getMintsRPC);

  return (
    <div className="bg-off-blue px-4 py-5">
      <div className="max-w-6xl mx-auto flex items-center space-x-10">
        <Stat title="$M supply" value={formatAmount(mintData?.M.supply)} />
        <Stat title="$M yield" value="0" />
        <Stat title="$wM supply" value="0" />
      </div>
    </div>
  );
};

const Stat = ({ title, value }: { title: string; value?: string }) => {
  return (
    <div className="flex flex-col">
      <span className="text-xs">{title}</span>
      <span className="text-xl font-medium">{value ?? ''}</span>
    </div>
  );
};

const formatAmount = (amount?: bigint): string => {
  if (!amount) {
    return '0.00';
  }
  return new Decimal(amount.toString())
    .div(1e6)
    .toNumber()
    .toLocaleString('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
