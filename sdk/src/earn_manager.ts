import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import * as spl from '@solana/spl-token';
import { GLOBAL_ACCOUNT, MINT, PROGRAM_ID } from '.';
import { Earner } from './earner';
import { Program } from '@coral-xyz/anchor';
import { getExtProgram } from './idl';
import { EarnManagerData } from './accounts';
import { ExtEarn } from './idl/ext_earn';

export class EarnManager {
  private connection: Connection;
  private program: Program<ExtEarn>;

  manager: PublicKey;
  data: EarnManagerData;

  constructor(connection: Connection, manager: PublicKey, pubkey: PublicKey, data: EarnManagerData) {
    this.connection = connection;
    this.program = getExtProgram(connection);
    this.manager = manager;
    this.data = data;
  }

  static async fromManagerAddress(connection: Connection, manager: PublicKey, evmRPC?: string): Promise<EarnManager> {
    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn-manager'), manager.toBytes()],
      PROGRAM_ID,
    );

    const data = await getExtProgram(connection).account.earnManager.fetch(earnManagerAccount);

    return new EarnManager(connection, manager, earnManagerAccount, data);
  }

  async refresh() {
    Object.assign(this, await EarnManager.fromManagerAddress(this.connection, this.manager));
  }

  async buildConfigureInstruction(feeBPS: number, feeTokenAccount: PublicKey): Promise<TransactionInstruction> {
    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn-manager'), this.manager.toBytes()],
      PROGRAM_ID,
    );

    return this.program.methods
      .configureEarnManager(new BN(feeBPS))
      .accounts({
        signer: this.manager,
        globalAccount: GLOBAL_ACCOUNT,
        earnManagerAccount,
        feeTokenAccount,
      })
      .instruction();
  }

  async buildAddEarnerInstruction(user: PublicKey, userTokenAccount?: PublicKey): Promise<TransactionInstruction> {
    // derive ata if token account not provided
    if (!userTokenAccount) {
      userTokenAccount = spl.getAssociatedTokenAddressSync(MINT, user, true, spl.TOKEN_2022_PROGRAM_ID);
    }

    // PDAs
    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn-manager'), this.manager.toBytes()],
      PROGRAM_ID,
    );
    const [earnerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), userTokenAccount.toBytes()],
      PROGRAM_ID,
    );

    return await this.program.methods
      .addEarner(user)
      .accounts({
        signer: this.manager,
        globalAccount: GLOBAL_ACCOUNT,
        earnManagerAccount,
        userTokenAccount,
        earnerAccount,
      })
      .instruction();
  }

  async getEarners(): Promise<Earner[]> {
    const accounts = await getExtProgram(this.connection).account.earner.all();
    return accounts.map((a) => new Earner(this.connection, a.publicKey, a.account));
  }
}
