import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { getApiClient } from '.';

function dateToBN(date: Date): BN {
  return new BN(Math.floor(date.getTime() / 1000));
}

export async function getBalanceAt(tokenAccount: PublicKey, mint: PublicKey, ts: Date): Promise<BN> {
  const now = new Date();

  if (ts > now) {
    throw new Error(`Invalid timestamp: ${ts} is in the future`);
  }

  // no transfers in period, fetch first transfer before lowerTS
  const { transfers } = await getApiClient().tokenAccount.transfers(tokenAccount.toBase58(), mint.toBase58(), {
    toTime: dateToBN(ts).toNumber(),
    limit: 1,
  });

  // account never held any tokens
  if (transfers.length === 0) {
    return new BN(0);
  }

  // balance did not change during period
  return new BN(transfers[0].postBalance);
}
