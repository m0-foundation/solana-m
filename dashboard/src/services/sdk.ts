import { createPublicClient, Earner, Graph, http } from '@m0-foundation/solana-m-sdk';
import { connection } from './rpc';
import { PublicKey } from '@solana/web3.js';

const evmClient = createPublicClient({ transport: http(process.env.ETH_RPC_URL ?? '') });
const graphClient = new Graph(import.meta.env.VITE_GRAPH_KEY, import.meta.env.VITE_SUBGRAPH_URL.split('/').pop());

export const getEarner = async (pubkey: PublicKey) => {
  return await Earner.fromUserAddress(connection, evmClient, graphClient, pubkey);
};
