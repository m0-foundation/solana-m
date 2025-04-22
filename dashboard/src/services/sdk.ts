import { createPublicClient, Earner, EvmCaller, Graph, http, TOKEN_2022_ID } from '@m0-foundation/solana-m-sdk';
import { connection } from './rpc';
import { PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import Decimal from 'decimal.js';

const evmClient = createPublicClient({ transport: http(import.meta.env.VITE_EVM_RPC_URL ?? '') });
const graphClient = new Graph(import.meta.env.VITE_GRAPH_KEY, import.meta.env.VITE_SUBGRAPH_URL.split('/').pop());

export const getEarner = async (programId: PublicKey, pubkey: PublicKey) => {
  const earners = await Earner.fromUserAddress(connection, evmClient, graphClient, pubkey, programId);

  if (earners.length === 0) {
    throw new Error(`No earners found for ${pubkey.toBase58()}`);
  }

  const [claimedYield, pendingYield, tokenAccount] = await Promise.all([
    earners[0].getClaimedYield(),
    earners[0].getPendingYield(),
    getAccount(connection, earners[0].data.userTokenAccount, connection.commitment, TOKEN_2022_ID),
  ]);

  return {
    earner: earners[0],
    claimedYield,
    pendingYield,
    tokenAccount,
  };
};

export const getCurrentRate = async () => {
  const caller = new EvmCaller(createPublicClient({ transport: http(import.meta.env.VITE_EVM_RPC_URL ?? '') }));
  return new Decimal((await caller.getEarnerRate()).toString()).div(100);
};
