import { createPublicClient, Earner, EXT_PROGRAM_ID, Graph, http, PROGRAM_ID } from '@m0-foundation/solana-m-sdk';
import { connection } from './rpc';
import { PublicKey } from '@solana/web3.js';

const evmClient = createPublicClient({ transport: http(import.meta.env.VITE_EVM_RPC_URL ?? '') });
const graphClient = new Graph(import.meta.env.VITE_GRAPH_KEY, import.meta.env.VITE_SUBGRAPH_URL.split('/').pop());

export const getEarner = async (mint: 'M' | 'wM', pubkey: PublicKey) => {
  const earners = await Earner.fromUserAddress(
    connection,
    evmClient,
    graphClient,
    pubkey,
    mint === 'M' ? PROGRAM_ID : EXT_PROGRAM_ID,
  );

  if (earners.length === 0) {
    throw new Error(`No earners found for ${pubkey.toBase58()}`);
  }

  return earners[0];
};
