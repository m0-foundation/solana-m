import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getEarner } from '../services/sdk';
import { PublicKey } from '@solana/web3.js';

export const EarnerDetails = () => {
  let { pubkey, mint } = useParams();

  const { data: earner, ...other } = useQuery({
    queryKey: ['earner', pubkey],
    queryFn: () => getEarner(mint as 'M' | 'wM', new PublicKey(pubkey!)),
    enabled: !!pubkey,
  });

  console.log('earner', earner, other);

  return <div>{`Earner ${pubkey}: ${JSON.stringify(earner?.data)}`}</div>;
};
