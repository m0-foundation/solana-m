import { useQuery } from '@tanstack/react-query';
import { indexUpdates } from '../services/subgraph';
import bs58 from 'bs58';
import { NETWORK } from '../services/rpc';
import { LoadingSkeleton } from './loading';
import { ResponsiveContainer, AreaChart, CartesianGrid, YAxis, XAxis, Tooltip, Area } from 'recharts';

export const IndexUpdates = () => {
  const { data } = useQuery({ queryKey: ['indexUpdates'], queryFn: () => indexUpdates(10) });

  return (
    <div>
      <div className="text-2xl">Recent Index Updates</div>
      <UpdatesGraph data={data ?? []} isLoading={!data} />
      <table className="w-full text-sm text-left rtl:text-right text-xs">
        <thead className="border-b border-gray-200">
          <tr>
            <th className="px-2 py-3">Timestamp</th>
            <th className="px-2 py-3">Update</th>
            <th className="px-2 py-3">Signature</th>
          </tr>
        </thead>
        <tbody>
          {data?.slice(0, 5).map((update) => (
            <tr key={update.ts} className="border-b border-gray-200">
              <td className="px-2 py-4">{new Date(update.ts * 1000).toLocaleString()}</td>
              <td className="px-2 py-4">{update.index}</td>
              <td className="px-2 py-4">
                <a
                  href={`https://solscan.io/tx/${bs58.encode(update.signature)}?cluster=${NETWORK}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {formatString(bs58.encode(update.signature))}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const formatString = (addressOrSig: string, chars = 6) => {
  return `${addressOrSig.slice(0, chars)}...${addressOrSig.slice(-chars)}`;
};

const UpdatesGraph = ({
  data,
  isLoading,
}: {
  data: {
    index: number;
    ts: number;
    signature: Buffer<ArrayBuffer>;
  }[];
  isLoading?: boolean;
}) => {
  if (isLoading) {
    return <LoadingSkeleton h={60} />;
  }

  const events = data.map(({ ts, index }) => ({ ts, index: index / 1e12 })).reverse() ?? [];

  return (
    <div className="w-full h-70">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          width={500}
          height={400}
          data={events}
          margin={{
            top: 20,
            bottom: 50,
            right: 40,
            left: -10,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <YAxis
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value: number) => Intl.NumberFormat('en', { minimumFractionDigits: 4 }).format(value)}
            className="text-xs"
          />
          <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
          <Tooltip content={<CustomTooltip active={false} payload={[]} />} />
          <Area type="linear" dataKey="index" stroke="#3b82f680" fill="#3b82f680" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const CustomTooltip = ({ active, payload }: { active: boolean; payload: any[] }) => {
  if (active && payload && payload.length) {
    const { ts, index } = payload[0].payload;
    return (
      <div className="bg-white p-2 shadow-md text-[14px]">
        <p className="text-xs">{new Date(ts * 1000).toLocaleString()}</p>
        <p>{index}</p>
      </div>
    );
  }

  return null;
};
