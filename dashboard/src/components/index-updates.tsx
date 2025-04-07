import { useSettings } from '../context/settings';
import { useData } from '../hooks/useData';
import { indexUpdates } from '../services/subgraph';
import bs58 from 'bs58';

export const IndexUpdates = () => {
  const { rpcUrl } = useSettings();
  const { data } = useData('indexUpdates:subgraph', indexUpdates);

  return (
    <div>
      <div className="text-2xl">Recent Index Updates</div>
      <table className="w-full text-sm text-left rtl:text-right text-xs">
        <thead className="border-b border-gray-200">
          <tr>
            <th className="px-2 py-3">Timestamp</th>
            <th className="px-2 py-3">Update</th>
            <th className="px-2 py-3">Signature</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((update) => (
            <tr key={update.ts} className="border-b border-gray-200">
              <td className="px-2 py-4">{new Date(update.ts * 1000).toLocaleString()}</td>
              <td className="px-2 py-4">{update.index}</td>
              <td className="px-2 py-4">
                <a
                  href={`https://solscan.io/tx/${bs58.encode(update.signature)}${
                    rpcUrl.includes('devnet') ? '?cluster=devnet' : ''
                  }`}
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
