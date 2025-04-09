import {
  Connection,
  TransactionInstruction,
  PublicKey,
  Transaction,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { PublicClient } from 'viem';

import { EXT_GLOBAL_ACCOUNT, EXT_PROGRAM_ID, GLOBAL_ACCOUNT, MINT, PROGRAM_ID } from '.';
import { Earner } from './earner';
import { Graph } from './graph';
import { EarnManager } from './earn_manager';
import { GlobalAccountData } from './accounts';
import * as spl from '@solana/spl-token';
import { BN, Program } from '@coral-xyz/anchor';
import { getExtProgram, getProgram } from './idl';
import { Earn } from './idl/earn';
import { ExtEarn } from './idl/ext_earn';
import { buildTransaction } from './transaction';

class EarnAuthority {
  private connection: Connection;
  private evmClient: PublicClient;
  private program: Program<Earn> | Program<ExtEarn>;
  private global: GlobalAccountData;
  private managerCache: Map<PublicKey, EarnManager> = new Map();
  private mintAuth: PublicKey;

  programID: PublicKey;

  private constructor(
    connection: Connection,
    evmClient: PublicClient,
    global: GlobalAccountData,
    mintAuth: PublicKey,
    program = PROGRAM_ID,
  ) {
    this.connection = connection;
    this.evmClient = evmClient;
    this.programID = program;
    this.program = program.equals(PROGRAM_ID) ? getProgram(connection) : getExtProgram(connection);
    this.global = global;
    this.mintAuth = mintAuth;
  }

  static async load(connection: Connection, evmClient: PublicClient, program = PROGRAM_ID): Promise<EarnAuthority> {
    const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], program);

    let global: GlobalAccountData;
    if (program.equals(PROGRAM_ID)) {
      global = await getProgram(connection).account.global.fetch(globalAccount);
    } else {
      const extGlobal = await getExtProgram(connection).account.extGlobal.fetch(globalAccount);
      global = { ...extGlobal, mint: extGlobal.extMint };
    }

    // get mint multisig
    const mint = await spl.getMint(connection, global.mint, connection.commitment, spl.TOKEN_2022_PROGRAM_ID);

    return new EarnAuthority(connection, evmClient, global, mint.mintAuthority!, program);
  }

  async refresh(): Promise<void> {
    Object.assign(this, await EarnAuthority.load(this.connection, this.evmClient));
  }

  public get admin() {
    return new PublicKey(this.global.admin);
  }

  async getAllEarners(): Promise<Earner[]> {
    const accounts = await this.program.account.earner.all();
    return accounts.map((a) => new Earner(this.connection, this.evmClient, a.publicKey, a.account));
  }

  async buildCompleteClaimCycleInstruction(): Promise<TransactionInstruction | null> {
    if (!this.programID.equals(PROGRAM_ID)) {
      return null;
    }

    if (this.global.claimComplete) {
      console.error('No active claim cycle');
      return null;
    }

    return await (this.program as Program<Earn>).methods
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
      console.warn('Earner created after last index update');
      return null;
    }

    if (earner.data.lastClaimIndex == this.global.index) {
      console.warn('Earner already claimed');
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

    // PDAs
    const [earnerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), earner.data.userTokenAccount.toBuffer()],
      this.programID,
    );

    if (this.programID.equals(EXT_PROGRAM_ID)) {
      // get manager (manager fee token account)
      let manager = this.managerCache.get(earner.data.earnManager!);
      if (!manager) {
        manager = await EarnManager.fromManagerAddress(this.connection, this.evmClient, earner.data.earnManager!);
        this.managerCache.set(earner.data.earnManager!, manager);
      }

      const earnManagerTokenAccount = manager.data.feeTokenAccount;
      const earnManagerAccount = PublicKey.findProgramAddressSync(
        [Buffer.from('earn_manager'), earner.data.earnManager!.toBytes()],
        this.programID,
      )[0];

      // vault PDAs
      const [mVaultAccount] = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], this.programID);
      const vaultMTokenAccount = spl.getAssociatedTokenAddressSync(
        this.global.mint,
        mVaultAccount,
        true,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      return (this.program as Program<ExtEarn>).methods
        .claimFor(new BN(weightedBalance.toString()))
        .accounts({
          earnAuthority: this.global.earnAuthority,
          globalAccount: EXT_GLOBAL_ACCOUNT,
          extMint: this.global.mint,
          extMintAuthority: this.mintAuth,
          mVaultAccount,
          vaultMTokenAccount,
          userTokenAccount: earner.data.userTokenAccount,
          earnerAccount,
          earnManagerAccount,
          earnManagerTokenAccount,
          token2022: spl.TOKEN_2022_PROGRAM_ID,
        })
        .instruction();
    } else {
      const [tokenAuthorityAccount] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAM_ID);

      return (this.program as Program<Earn>).methods
        .claimFor(new BN(weightedBalance.toString()))
        .accounts({
          earnAuthority: new PublicKey(this.global.earnAuthority),
          globalAccount: GLOBAL_ACCOUNT,
          mint: new PublicKey(this.global.mint),
          tokenAuthorityAccount,
          userTokenAccount: earner.data.userTokenAccount,
          earnerAccount,
          tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
          mintMultisig: this.mintAuth,
        })
        .instruction();
    }
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
          err: result.value.err.toString(),
          b64: Buffer.from(txn.serialize()).toString('base64'),
        });
        throw new Error(`Claim batch simulation failed: ${JSON.stringify(result.value.err)}`);
      }

      // add up rewards
      const batchRewards = this._getRewardAmounts(result.value.logs!);
      for (const [index, reward] of batchRewards.entries()) {
        if (reward.user > claimSizeThreshold) {
          totalRewards = totalRewards.add(reward.user).add(reward.fee);
          filtererdTxns.push(ixs[i * batchSize + index]);
        }
      }
    }

    // validate rewards is not higher than max claimable rewards
    if (this.programID.equals(PROGRAM_ID)) {
      if (totalRewards.gt(this.global.maxYield!)) {
        console.error('Claim amount exceeds max claimable rewards', {
          totalRewards: totalRewards.toString(),
          maxYield: this.global.maxYield!.toString(),
        });
        throw new Error('Claim amount exceeds max claimable rewards');
      }
    } else {
      // total supply
      const mint = await spl.getMint(
        this.connection,
        this.global.mint,
        this.connection.commitment,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      // vault balance
      const vaultMTokenAccount = spl.getAssociatedTokenAddressSync(
        MINT,
        PublicKey.findProgramAddressSync([Buffer.from('m_vault')], this.programID)[0],
        true,
        spl.TOKEN_2022_PROGRAM_ID,
      );
      const tokenAccountInfo = await spl.getAccount(
        this.connection,
        vaultMTokenAccount,
        this.connection.commitment,
        spl.TOKEN_2022_PROGRAM_ID,
      );
      const collateral = new BN(tokenAccountInfo.amount.toString());

      if (new BN(mint.supply.toString()).add(totalRewards).gt(collateral)) {
        console.error('Claim amount exceeds max claimable rewards', {
          mintSupply: mint.supply.toString(),
          totalRewards: totalRewards.toString(),
          collateral: collateral.toString(),
        });
        throw new Error('Claim amount exceeds max claimable rewards');
      }
    }

    return [filtererdTxns, totalRewards];
  }

  private _getRewardAmounts(logs: string[]): { user: BN; fee: BN }[] {
    const rewards: { user: BN; fee: BN }[] = [];

    for (const log of logs) {
      // log prefix with RewardsClaim event discriminator
      if (log.startsWith('Program data: VKjUbMsK')) {
        const data = Buffer.from(log.split('Program data: ')[1], 'base64');

        // events identical between Earn and ExtEarn
        rewards.push({
          user: new BN(data.readBigUInt64LE(72).toString()),
          fee: new BN(data.readBigUInt64LE(96).toString()),
        });
      }
    }

    return rewards;
  }

  private async _buildTransactions(
    ixs: TransactionInstruction[],
    priorityFee = 250_000,
    batchSize = 10,
  ): Promise<VersionedTransaction[]> {
    const feePayer = new PublicKey(this.global.earnAuthority);

    // split instructions into batches
    const transactions: VersionedTransaction[] = [];

    for (let i = 0; i < ixs.length; i += batchSize) {
      const batchIxs = ixs.slice(i, i + batchSize);
      transactions.push(await buildTransaction(this.connection, batchIxs, feePayer, priorityFee));
    }

    return transactions;
  }
}

export default EarnAuthority;
