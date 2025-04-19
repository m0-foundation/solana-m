import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getEarner } from '../services/sdk';
import { PublicKey } from '@solana/web3.js';

export const EarnerDetails = () => {
  let { pubkey } = useParams();

  const { data: earners } = useQuery({
    queryKey: ['earner', pubkey],
    queryFn: () => getEarner(new PublicKey(pubkey!)),
    enabled: !!pubkey,
  });

  return <div>{`Earner ${pubkey}: ${earners?.length}`}</div>;
};
