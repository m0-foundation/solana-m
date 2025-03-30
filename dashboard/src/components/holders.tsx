import { useQuery } from '@tanstack/react-query';
import { tokenHolders } from '../services/subgraph';
import { useSettings } from '../context/settings';

export const Holders = () => {
  const { graphqlUrl } = useSettings();

  const { data, isLoading, error } = useQuery({
    queryKey: ['tokenHolders'],
    queryFn: () => tokenHolders(graphqlUrl),
  });

  return (
    <div>
      <h2>Token Holders</h2>
      <table>
        <thead>
          <tr>
            <th>Wallet Address</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((holder) => (
            <tr key={holder.user.toString()}>
              <td>{holder.user.toString()}</td>
              <td>{holder.balance}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
