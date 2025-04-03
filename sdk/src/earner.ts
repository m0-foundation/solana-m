import { Connection, PublicKey } from '@solana/web3.js';
import { PublicClient } from 'viem';
import BN from 'bn.js';

import { EXT_PROGRAM_ID, PROGRAM_ID } from '.';
import { Claim, Graph } from './graph';
import { EarnerData } from './accounts';
import { getExtProgram, getProgram } from './idl';
import { EvmCaller } from './evm_caller';
import { EarnManager } from './earn_manager';

export class Earner {
  private connection: Connection;
  private evmClient: PublicClient;
  private graph: Graph;

  pubkey: PublicKey;
  data: EarnerData;

  constructor(connection: Connection, evmClient: PublicClient, pubkey: PublicKey, data: EarnerData) {
    this.connection = connection;
    this.graph = new Graph();
    this.evmClient = evmClient;
    this.pubkey = pubkey;
    this.data = data;
  }

  static async fromTokenAccount(
    connection: Connection,
    evmClient: PublicClient,
    tokenAccount: PublicKey,
    program = EXT_PROGRAM_ID,
  ): Promise<Earner> {
    const [earnerAccount] = PublicKey.findProgramAddressSync([Buffer.from('earner'), tokenAccount.toBytes()], program);

    if (program === EXT_PROGRAM_ID) {
      const data = await getExtProgram(connection).account.earner.fetch(earnerAccount);
      return new Earner(connection, evmClient, earnerAccount, data);
    } else {
      const data = await getProgram(connection).account.earner.fetch(earnerAccount);
      return new Earner(connection, evmClient, earnerAccount, { ...data, earnManager: null, recipientTokenAccount: null });
    }
  }

  static async fromUserAddress(connection: Connection, evmClient: PublicClient, user: PublicKey, program = EXT_PROGRAM_ID): Promise<Earner[]> {
    const filter = [{ memcmp: { offset: 25, bytes: user.toBase58() } }];

    if (program === EXT_PROGRAM_ID) {
      const accounts = await getExtProgram(connection).account.earner.all(filter);
      return accounts.map((a) => new Earner(connection, evmClient, a.publicKey, a.account));
    } else {
      const accounts = await getProgram(connection).account.earner.all(filter);
      return accounts.map(
        (a) => new Earner(connection, evmClient, a.publicKey, { ...a.account, earnManager: null, recipientTokenAccount: null }),
      );
    }
  }

  async getHistoricalClaims(): Promise<Claim[]> {
    return await this.graph.getHistoricalClaims(this.data.userTokenAccount);
  }

  async getClaimedYield(): Promise<BN> {
    const claims = await this.getHistoricalClaims();
    return claims.reduce((acc, claim) => acc.add(new BN(claim.amount.toString())), new BN(0));
  }

  async getPendingYield(): Promise<BN> {
    // Pending yield is calculated by:
    // - Fetching the current timestamp
    // - Fetching the current index (from ETH mainnet)
    // - Fetching the weighted balance of the earner from the last claim timestamp to the current timestamp
    // - Calculating the pending yield as: ((current index - last claim index) / last claim index) * weighted balance

    const currentTime = new BN(Math.floor(Date.now() / 1000));

    const evmCaller = new EvmCaller(this.evmClient);

    const currentIndex = await evmCaller.getCurrentIndex();

    const earnerWeightedBalance = await this.graph.getTimeWeightedBalance(
      this.data.userTokenAccount,
      this.data.lastClaimTimestamp,
      currentTime,
    );

    let pendingYield = this.data.lastClaimIndex >= currentIndex ? new BN(0) : earnerWeightedBalance.mul(currentIndex.sub(this.data.lastClaimIndex)).div(this.data.lastClaimIndex);

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
