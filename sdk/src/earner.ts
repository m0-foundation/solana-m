import { Connection, PublicKey } from '@solana/web3.js';
import { PublicClient } from 'viem';
import BN from 'bn.js';

import { EXT_MINT, EXT_PROGRAM_ID, getApiClient, MINT } from '.';
import { EarnerData } from './accounts';
import { getExtProgram, getProgram } from './idl';
import { EvmCaller } from './evm_caller';
import { EarnManager } from './earn_manager';
import { getTimeWeightedBalance } from './twb';
import { Claims } from '@m0-foundation/solana-m-api-sdk/generated/api';

export class Earner {
  private connection: Connection;
  private evmClient: PublicClient;

  pubkey: PublicKey;
  data: EarnerData;
  mint: PublicKey;

  constructor(connection: Connection, evmClient: PublicClient, pubkey: PublicKey, data: EarnerData, mint: PublicKey) {
    this.connection = connection;
    this.evmClient = evmClient;
    this.pubkey = pubkey;
    this.data = data;
    this.mint = mint;
  }

  static async fromTokenAccount(
    connection: Connection,
    evmClient: PublicClient,
    tokenAccount: PublicKey,
    program = EXT_PROGRAM_ID,
  ): Promise<Earner> {
    const [earnerAccount] = PublicKey.findProgramAddressSync([Buffer.from('earner'), tokenAccount.toBytes()], program);

    if (program.equals(EXT_PROGRAM_ID)) {
      const data = await getExtProgram(connection).account.earner.fetch(earnerAccount);
      return new Earner(connection, evmClient, earnerAccount, data, EXT_MINT);
    } else {
      const data = await getProgram(connection).account.earner.fetch(earnerAccount);
      return new Earner(
        connection,
        evmClient,
        earnerAccount,
        {
          ...data,
          earnManager: null,
          recipientTokenAccount: null,
        },
        MINT,
      );
    }
  }

  static async fromUserAddress(
    connection: Connection,
    evmClient: PublicClient,
    user: PublicKey,
    program = EXT_PROGRAM_ID,
  ): Promise<Earner[]> {
    const filter = [{ memcmp: { offset: 25, bytes: user.toBase58() } }];

    if (program.equals(EXT_PROGRAM_ID)) {
      const accounts = await getExtProgram(connection).account.earner.all(filter);
      return accounts.map((a) => new Earner(connection, evmClient, a.publicKey, a.account, EXT_MINT));
    } else {
      const accounts = await getProgram(connection).account.earner.all(filter);
      return accounts.map(
        (a) =>
          new Earner(
            connection,
            evmClient,
            a.publicKey,
            {
              ...a.account,
              earnManager: null,
              recipientTokenAccount: null,
            },
            MINT,
          ),
      );
    }
  }

  async getHistoricalClaims(): Promise<Claims> {
    return await getApiClient().tokenAccount.claims(this.data.userTokenAccount.toBase58(), this.mint.toBase58());
  }

  async getClaimedYield(): Promise<BN> {
    const claims = await this.getHistoricalClaims();
    return claims.claims.reduce((acc, claim) => acc.add(new BN(claim.amount.toString())), new BN(0));
  }

  async getPendingYield(): Promise<BN> {
    // Pending yield is calculated by:
    // - Fetching the current timestamp
    // - Fetching the current index (from ETH mainnet)
    // - Using our usual yield calculation formula for yield claims, but adding another index update with the current index

    const evmCaller = new EvmCaller(this.evmClient);
    const currentIndex = await evmCaller.getCurrentIndex();

    // Get the index updates b/w the user's last claim index and current index
    const { updates } = await getApiClient().events.indexUpdates({
      fromTime: this.data.lastClaimTimestamp.toNumber(),
    });

    const steps = updates.map((update) => ({ index: new BN(update.index), ts: update.ts }));

    // The current index should not be in the index updates list so we add it manually
    steps.push({
      index: currentIndex,
      ts: new Date(),
    });

    // iterate through the steps and calculate the pending yield for the earner
    let pendingYield: BN = new BN(0);

    let last = steps[0];
    for (let i = 1; i < steps.length; i++) {
      let current = steps[i];

      // Check that indices and timestamps are only increasing
      if (current.index.lt(last.index) || current.ts < last.ts) {
        throw new Error('Invalid index or timestamp');
      }

      const twb = await getTimeWeightedBalance(this.data.userTokenAccount, this.mint, last.ts, current.ts);

      // iterative calculation
      // y_n = (y_(n-1) + twb) * (I_n / I_(n-1) - twb
      pendingYield = pendingYield.add(twb).mul(current.index).div(last.index).sub(twb);

      last = current;
    }

    // Check if the earner has an earn manager
    // If so, check if the earn manager has a fee
    // If so, calculate the fee and subtract it from the pending yield
    if (this.data.earnManager) {
      const earnManager = await EarnManager.fromManagerAddress(this.connection, this.evmClient, this.data.earnManager);

      if (earnManager.data.feeBps > new BN(0)) {
        const fee = pendingYield.mul(earnManager.data.feeBps).div(new BN(10000));

        pendingYield = pendingYield.sub(fee);
      }
    }

    return pendingYield;
  }
}
