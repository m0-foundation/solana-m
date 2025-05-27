import { Connection, PublicKey } from '@solana/web3.js';
import { PublicClient } from 'viem';
import BN from 'bn.js';

import { EXT_PROGRAM_ID } from '.';
import { EarnerData } from './accounts';
import { getExtProgram, getProgram } from './idl';
import { EvmCaller } from './evm_caller';
import { EarnManager } from './earn_manager';
import { M0SolanaApiClient } from '@m0-foundation/solana-m-api-sdk';

export class Earner {
  private connection: Connection;
  private evmClient: PublicClient;
  private apiClient: M0SolanaApiClient;

  pubkey: PublicKey;
  data: EarnerData;

  constructor(
    connection: Connection,
    evmClient: PublicClient,
    apiClient: M0SolanaApiClient,
    pubkey: PublicKey,
    data: EarnerData,
  ) {
    this.connection = connection;
    this.evmClient = evmClient;
    this.apiClient = apiClient;
    this.pubkey = pubkey;
    this.data = data;
  }

  static async fromTokenAccount(
    connection: Connection,
    evmClient: PublicClient,
    apiClient: M0SolanaApiClient,
    tokenAccount: PublicKey,
    program = EXT_PROGRAM_ID,
  ): Promise<Earner> {
    const [earnerAccount] = PublicKey.findProgramAddressSync([Buffer.from('earner'), tokenAccount.toBytes()], program);

    if (program.equals(EXT_PROGRAM_ID)) {
      const data = await getExtProgram(connection).account.earner.fetch(earnerAccount);
      return new Earner(connection, evmClient, apiClient, earnerAccount, data);
    } else {
      const data = await getProgram(connection).account.earner.fetch(earnerAccount);
      return new Earner(connection, evmClient, apiClient, earnerAccount, {
        ...data,
        earnManager: null,
        recipientTokenAccount: null,
      });
    }
  }

  static async fromUserAddress(
    connection: Connection,
    evmClient: PublicClient,
    apiClient: M0SolanaApiClient,
    user: PublicKey,
    program = EXT_PROGRAM_ID,
  ): Promise<Earner[]> {
    const filter = [{ memcmp: { offset: 25, bytes: user.toBase58() } }];

    if (program.equals(EXT_PROGRAM_ID)) {
      const accounts = await getExtProgram(connection).account.earner.all(filter);
      return accounts.map((a) => new Earner(connection, evmClient, apiClient, a.publicKey, a.account));
    } else {
      const accounts = await getProgram(connection).account.earner.all(filter);
      return accounts.map(
        (a) =>
          new Earner(connection, evmClient, apiClient, a.publicKey, {
            ...a.account,
            earnManager: null,
            recipientTokenAccount: null,
          }),
      );
    }
  }

  async getHistoricalClaims(): Promise<Claim[]> {
    return await this.apiClient.getHistoricalClaims(this.data.userTokenAccount);
  }

  async getClaimedYield(): Promise<BN> {
    const claims = await this.getHistoricalClaims();
    return claims.reduce((acc, claim) => acc.add(new BN(claim.amount.toString())), new BN(0));
  }

  async getPendingYield(): Promise<BN> {
    // Pending yield is calculated by:
    // - Fetching the current timestamp
    // - Fetching the current index (from ETH mainnet)
    // - Using our usual yield calculation formula for yield claims, but adding another index update with the current index

    const currentTime = new BN(Math.floor(Date.now() / 1000));

    const evmCaller = new EvmCaller(this.evmClient);

    const currentIndex = await evmCaller.getCurrentIndex();

    // Get the index updates from the graph b/w the user's last claim index and current index
    const steps = await this.apiClient.getIndexUpdates(this.data.lastClaimIndex, currentIndex);

    // The current index should not be in the index updates list so we add it manually
    steps.push({ index: currentIndex, ts: currentTime });

    // iterate through the steps and calculate the pending yield for the earner
    let pendingYield: BN = new BN(0);

    let last = steps[0];
    for (let i = 1; i < steps.length; i++) {
      let current = steps[i];

      // Check that indices and timestamps are only increasing
      if (current.index.lt(last.index) || current.ts.lt(last.ts)) {
        throw new Error('Invalid index or timestamp');
      }

      const twb = await this.apiClient.getTimeWeightedBalance(this.data.userTokenAccount, last.ts, current.ts);

      // iterative calculation
      // y_n = (y_(n-1) + twb) * (I_n / I_(n-1) - twb
      pendingYield = pendingYield.add(twb).mul(current.index).div(last.index).sub(twb);

      last = current;
    }

    // Check if the earner has an earn manager
    // If so, check if the earn manager has a fee
    // If so, calculate the fee and subtract it from the pending yield
    if (this.data.earnManager) {
      const earnManager = await EarnManager.fromManagerAddress(
        this.connection,
        this.evmClient,
        this.apiClient,
        this.data.earnManager,
      );

      if (earnManager.data.feeBps > new BN(0)) {
        const fee = pendingYield.mul(earnManager.data.feeBps).div(new BN(10000));

        pendingYield = pendingYield.sub(fee);
      }
    }

    return pendingYield;
  }
}
