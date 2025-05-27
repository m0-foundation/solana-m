import { M0SolanaApiClient } from '@m0-foundation/solana-m-api-sdk';
import { BalanceUpdate } from '@m0-foundation/solana-m-api-sdk/generated/api';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export async function getTimeWeightedBalance(
  apiClient: M0SolanaApiClient,
  tokenAccount: PublicKey,
  mint: PublicKey,
  lowerTS: Date,
  upperTS: Date,
): Promise<BN> {
  if (lowerTS > upperTS) {
    throw new Error(`Invalid time range: ${lowerTS} - ${upperTS}`);
  }

  const { transfers } = await apiClient.tokenAccount.transfers(tokenAccount.toBase58(), mint.toBase58(), {
    fromTime: dateToBN(lowerTS).toNumber(),
    toTime: dateToBN(upperTS).toNumber(),
  });

  // put transfers in ascending order
  transfers.reverse();

  if (transfers.length === 0) {
    // no transfers in period, fetch first transfer before lowerTS
    const { transfers } = await apiClient.tokenAccount.transfers(tokenAccount.toBase58(), mint.toBase58(), {
      toTime: lowerTS.getTime(),
      limit: 1,
    });
    // balance did not change during period
    return new BN(transfers[0].postBalance);
  } else {
    return calculateTimeWeightedBalance(
      new BN(transfers[0].preBalance),
      dateToBN(lowerTS),
      dateToBN(upperTS),
      transfers,
    );
  }
}

function calculateTimeWeightedBalance(startingBalance: BN, lowerTS: BN, upperTS: BN, transfers: BalanceUpdate[]): BN {
  // no transfers in range
  if (transfers.length === 0) {
    return startingBalance;
  }

  let weightedBalance = new BN(0);
  let prevTS = lowerTS;

  // use transfers to calculate the weighted balance from the end balance
  for (const [i, transfer] of transfers.entries()) {
    const transferTS = new BN(Math.floor(transfer.ts.getTime() / 1000));

    if (transferTS.lt(lowerTS) || transferTS.gt(upperTS)) {
      throw new Error('transfer ts out of range');
    }
    if (i > 0 && transfers[i - 1].ts > transfer.ts) {
      throw new Error('transfers not sorted');
    }

    const preBalance = new BN(transfer.preBalance);
    weightedBalance = weightedBalance.add(preBalance.mul(prevTS.sub(transferTS)));
    prevTS = transferTS;
  }

  // calculate up to sinceTS
  const latestBalance = new BN(transfers[transfers.length - 1].postBalance);
  weightedBalance = weightedBalance.add(latestBalance.mul(prevTS.sub(upperTS)));

  // return the time-weighted balance
  return weightedBalance.div(upperTS.sub(lowerTS));
}

function dateToBN(date: Date): BN {
  return new BN(Math.floor(date.getTime() / 1000));
}
