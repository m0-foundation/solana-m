import {
  Connection,
  TransactionInstruction,
  PublicKey,
  Transaction,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { GLOBAL_ACCOUNT, PROGRAM_ID } from '.';
import { Earner } from './earner';
import { Graph } from './graph';
import { EarnManager } from './earn_manager';
import { GlobalAccountData } from './accounts';
import * as spl from '@solana/spl-token';
import { BN, Program } from '@coral-xyz/anchor';
import { getProgram } from './idl';
import { Earn } from './idl/earn';

class EarnAuthority {
  private connection: Connection;
  private program: Program<Earn>;
  private global: GlobalAccountData;
  private managerCache: Map<PublicKey, EarnManager> = new Map();
  private mintMultisig: PublicKey;

  private constructor(connection: Connection, global: GlobalAccountData, mintMultisig: PublicKey) {
    this.connection = connection;
    this.program = getProgram(connection);
    this.global = global;
    this.mintMultisig = mintMultisig;
  }

  static async load(connection: Connection): Promise<EarnAuthority> {
    const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID);
    const global = await getProgram(connection).account.global.fetch(globalAccount);

    // get mint multisig
    const mint = await spl.getMint(connection, global.mint, connection.commitment, spl.TOKEN_2022_PROGRAM_ID);

    return new EarnAuthority(connection, global, mint.mintAuthority!);
  }

  async refresh(): Promise<void> {
    Object.assign(this, await EarnAuthority.load(this.connection));
  }

  public get admin() {
    return new PublicKey(this.global.admin);
  }

  async getAllEarners(): Promise<Earner[]> {
    const accounts = await getProgram(this.connection).account.earner.all();
    return accounts.map((a) => new Earner(this.connection, a.publicKey, a.account));
  }

  async buildCompleteClaimCycleInstruction(): Promise<TransactionInstruction | null> {
    if (this.global.claimComplete) {
      console.error('No active claim cycle');
      return null;
    }

    return await this.program.methods
      .completeClaims()
      .accounts({
        earnAuthority: new PublicKey(this.global.earnAuthority),
        globalAccount: PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0],
      })
      .instruction();
  }

  async buildClaimInstruction(earner: Earner): Promise<TransactionInstruction | null> {
    if (this.global.claimComplete) {
      console.error('No active claim cycle');
      return null;
    }

    // earner was created after last index update
    if (earner.data.lastClaimTimestamp > this.global.timestamp) {
      console.error('Earner created after last index update');
      return null;
    }

    if (earner.data.lastClaimIndex == this.global.index) {
      console.error('Earner already claimed');
      return null;
    }

    const weightedBalance = await new Graph().getTimeWeightedBalance(
      earner.data.userTokenAccount,
      earner.data.lastClaimTimestamp,
      this.global.timestamp,
    );

    if (weightedBalance.isZero()) {
      return null;
    }

    // earner might have a manager
    let earnManagerAccount: PublicKey | null = null;
    let earnManagerTokenAccount: PublicKey | null = null;

    if (earner.data.earnManager) {
      let manager = this.managerCache.get(earner.data.earnManager);
      if (!manager) {
        manager = await EarnManager.fromManagerAddress(this.connection, earner.data.earnManager);
        this.managerCache.set(earner.data.earnManager, manager);
      }
      earnManagerAccount = earner.data.earnManager;
      earnManagerTokenAccount = manager.data.feeTokenAccount;
    }

    // PDAs
    const [tokenAuthorityAccount] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAM_ID);
    const [earnerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), earner.data.userTokenAccount.toBuffer()],
      PROGRAM_ID,
    );
    if (earnManagerAccount) {
      earnManagerAccount = PublicKey.findProgramAddressSync(
        [Buffer.from('earn-manager'), earnManagerAccount.toBytes()],
        PROGRAM_ID,
      )[0];
    }

    return this.program.methods
      .claimFor(new BN(weightedBalance.toString()))
      .accounts({
        earnAuthority: new PublicKey(this.global.earnAuthority),
        globalAccount: GLOBAL_ACCOUNT,
        mint: new PublicKey(this.global.mint),
        tokenAuthorityAccount,
        userTokenAccount: earner.data.userTokenAccount,
        earnerAccount,
        tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
        mintMultisig: this.mintMultisig,
        earnManagerAccount,
        earnManagerTokenAccount,
      })
      .instruction();
  }

  async simulateAndValidateClaimIxs(
    ixs: TransactionInstruction[],
    batchSize = 10,
    claimSizeThreshold = new BN(100000), // $0.10
  ): Promise<[TransactionInstruction[], BN]> {
    if (this.global.claimComplete) {
      throw new Error('No active claim cycle');
    }

    let totalRewards = new BN(0);
    const filtererdTxns: TransactionInstruction[] = [];

    for (const [i, txn] of (await this._buildTransactions(ixs, batchSize)).entries()) {
      // simulate transaction
      const result = await this.connection.simulateTransaction(txn, { sigVerify: false });
      if (result.value.err) {
        console.error({
          message: 'Claim batch simulation failed',
          logs: result.value.logs,
          err: result.value.err,
          b64: Buffer.from(txn.serialize()).toString('base64'),
        });
        throw new Error(`Claim batch simulation failed: ${JSON.stringify(result.value.err)}`);
      }

      // add up rewards
      const batchRewards = this._getRewardAmounts(result.value.logs!);
      for (const [index, reward] of batchRewards.entries()) {
        if (reward > claimSizeThreshold) {
          totalRewards = totalRewards.add(reward);
          filtererdTxns.push(ixs[i * batchSize + index]);
        }
      }
    }

    // validate rewards is not higher than max claimable rewards
    if (totalRewards > this.global.maxYield) {
      throw new Error('Claim amount exceeds max claimable rewards');
    }

    return [filtererdTxns, totalRewards];
  }

  private _getRewardAmounts(logs: string[]): BN[] {
    const rewards: bigint[] = [];

    for (const log of logs) {
      // log prefix with RewardsClaim event discriminator
      if (log.startsWith('Program data: VKjUbMsK')) {
        const data = Buffer.from(log.split('Program data: ')[1], 'base64');

        // read rewards and fee amounts
        rewards.push(data.readBigUInt64LE(72) + data.readBigUInt64LE(80));
      }
    }

    return rewards.map((r) => new BN(r.toString()));
  }

  private async _buildTransactions(
    ixs: TransactionInstruction[],
    priorityFee = 250_000,
    batchSize = 10,
  ): Promise<VersionedTransaction[]> {
    const { blockhash } = await this.connection.getLatestBlockhash();
    const feePayer = new PublicKey(this.global.earnAuthority);
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee });

    // split instructions into batches
    const transactions: VersionedTransaction[] = [];

    for (let i = 0; i < ixs.length; i += batchSize) {
      const batchIxs = ixs.slice(i, i + batchSize);
      const tx = new Transaction().add(computeBudgetIx, ...batchIxs);
      tx.recentBlockhash = blockhash;
      tx.feePayer = feePayer;
      transactions.push(new VersionedTransaction(tx.compileMessage()));
    }

    return transactions;
  }
}

export default EarnAuthority;
