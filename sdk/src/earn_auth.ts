import {
  Connection,
  TransactionInstruction,
  PublicKey,
  Transaction,
  VersionedTransaction,
  Keypair,
} from '@solana/web3.js';
import { GLOBAL_ACCOUNT, PROGRAM_ID } from '.';
import { Earner } from './earner';
import { Graph } from './graph';
import { EarnManager } from './earn_manager';
import { b58, deriveDiscriminator } from './utils';
import { GlobalAccountData, globalDecoder } from './accounts';
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

    const accountInfo = await connection.getAccountInfo(globalAccount);
    const global = globalDecoder.decode(accountInfo!.data);

    // get mint multisig
    const mint = await spl.getMint(
      connection,
      new PublicKey(global.mint),
      connection.commitment,
      spl.TOKEN_2022_PROGRAM_ID,
    );

    return new EarnAuthority(connection, global, mint.mintAuthority!);
  }

  async refresh(): Promise<void> {
    Object.assign(this, await EarnAuthority.load(this.connection));
  }

  async getAllEarners(): Promise<Earner[]> {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ memcmp: { offset: 0, bytes: b58(deriveDiscriminator('Earner')) } }],
    });
    return accounts.map(({ account, pubkey }) => Earner.fromAccountData(this.connection, pubkey, account.data));
  }

  async buildCompleteClaimCycleInstruction(): Promise<TransactionInstruction> {
    if (this.global.claimComplete) {
      throw new Error('No active claim cycle');
    }

    return await this.program.methods
      .completeClaims()
      .accounts({
        earnAuthority: new PublicKey(this.global.earnAuthority),
        globalAccount: PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0],
      })
      .instruction();
  }

  async buildClaimInstruction(earner: Earner): Promise<TransactionInstruction> {
    if (this.global.claimComplete) {
      throw new Error('No active claim cycle');
    }

    const weightedBalance = await new Graph().getTimeWeightedBalance(
      earner.userTokenAccount,
      earner.lastClaimTimestamp,
      this.global.timestamp,
    );

    // earner might have a manager
    let earnManagerAccount: PublicKey | null = null;
    let earnManagerTokenAccount: PublicKey | null = null;

    if (earner.earnManager) {
      let manager = this.managerCache.get(earner.earnManager);
      if (!manager) {
        manager = await EarnManager.fromManagerAddress(this.connection, earner.earnManager);
        this.managerCache.set(earner.earnManager, manager);
      }
      earnManagerAccount = earner.earnManager;
      earnManagerTokenAccount = manager.feeTokenAccount;
    }

    // PDAs
    const [tokenAuthorityAccount] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAM_ID);
    const [earnerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), earner.userTokenAccount.toBuffer()],
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
        userTokenAccount: earner.userTokenAccount,
        earnerAccount,
        tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
        mintMultisig: this.mintMultisig,
        earnManagerAccount,
        earnManagerTokenAccount,
      })
      .instruction();
  }

  async sendClaimInstructions(
    ixs: TransactionInstruction[],
    earnAuthority: Keypair,
    appendCompleteClaimInstruction = false,
    validate = false,
    batchSize = 10,
  ): Promise<string[]> {
    if (validate) {
      await this.simulateAndValidateClaimIxs(ixs, batchSize);
    }

    if (appendCompleteClaimInstruction) {
      ixs.push(await this.buildCompleteClaimCycleInstruction());
    }

    const signatures: string[] = [];
    for (const txn of await this._buildTransactions(ixs, batchSize)) {
      txn.sign([earnAuthority]);
      const signature = await this.connection.sendTransaction(txn, { skipPreflight: validate });
      signatures.push(signature);
    }

    const { lastValidBlockHeight, blockhash } = await this.connection.getLatestBlockhash();

    // wait for all transactions to be confirmed
    await Promise.all(
      signatures.map((signature) =>
        this.connection.confirmTransaction({
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
          signature,
        }),
      ),
    );

    return signatures;
  }

  async simulateAndValidateClaimIxs(ixs: TransactionInstruction[], batchSize = 10): Promise<bigint> {
    if (this.global.claimComplete) {
      throw new Error('No active claim cycle');
    }

    let totalRewards = 0n;

    for (const txn of await this._buildTransactions(ixs, batchSize)) {
      // simulate transaction
      const result = await this.connection.simulateTransaction(txn, { sigVerify: false });
      if (result.value.err) {
        throw new Error(`Claim batch simulation failed: ${result.value.err}`);
      }

      // add up rewards
      const batchRewards = this._getRewardAmounts(result.value.logs!);
      for (const reward of batchRewards) {
        totalRewards += reward;
      }
    }

    // validate rewards is not higher than max claimable rewards
    if (totalRewards > this.global.maxYield) {
      throw new Error('Claim amount exceeds max claimable rewards');
    }

    return totalRewards;
  }

  private _getRewardAmounts(logs: string[]): bigint[] {
    const rewards: bigint[] = [];

    for (const log of logs) {
      // log prefix with RewardsClaim event discriminator
      if (log.startsWith('Program data: VKjUbMsK')) {
        const data = Buffer.from(log.split('Program data: ')[1], 'base64');

        // read rewards and fee amounts
        rewards.push(data.readBigUInt64LE(72) + data.readBigUInt64LE(80));
      }
    }

    return rewards;
  }

  private async _buildTransactions(ixs: TransactionInstruction[], batchSize = 10): Promise<VersionedTransaction[]> {
    const t = new Transaction().add(...ixs);
    t.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    t.feePayer = new PublicKey(this.global.earnAuthority);
    return [new VersionedTransaction(t.compileMessage())];
  }
}

export default EarnAuthority;
