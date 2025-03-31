import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import * as spl from '@solana/spl-token';
import { GLOBAL_ACCOUNT, MINT, PROGRAM_ID } from '.';
import { Earner } from './earner';
import { MerkleTree } from './merkle';
import { EvmCaller } from './evm_caller';
import { Program } from '@coral-xyz/anchor';
import { getProgram } from './idl';
import { Earn } from './idl/earn';
import { EarnManagerData } from './accounts';

export class EarnManager {
  private connection: Connection;
  private program: Program<Earn>;
  private evmRPC: string | undefined;

  manager: PublicKey;
  data: EarnManagerData;

  constructor(connection: Connection, manager: PublicKey, pubkey: PublicKey, data: EarnManagerData, evmRPC?: string) {
    this.connection = connection;
    this.program = getProgram(connection);
    this.evmRPC = evmRPC;
    this.manager = manager;
    this.data = data;
  }

  static async fromManagerAddress(connection: Connection, manager: PublicKey, evmRPC?: string): Promise<EarnManager> {
    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn-manager'), manager.toBytes()],
      PROGRAM_ID,
    );

    const data = await getProgram(connection).account.earnManager.fetch(earnManagerAccount);

    return new EarnManager(connection, manager, earnManagerAccount, data, evmRPC);
  }

  async refresh() {
    Object.assign(this, await EarnManager.fromManagerAddress(this.connection, this.manager, this.evmRPC));
  }

  async buildConfigureInstruction(feeBPS: number, feeTokenAccount: PublicKey): Promise<TransactionInstruction> {
    if (!this.evmRPC) {
      throw new Error('evmRPC is required to configure earn manager');
    }

    // get all earn managers for proof
    const evmCaller = new EvmCaller(this.evmRPC);
    const mangagers = await evmCaller.getManagers();
    const tree = new MerkleTree(mangagers);
    const { proof } = tree.getInclusionProof(this.manager);

    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn-manager'), this.manager.toBytes()],
      PROGRAM_ID,
    );

    return this.program.methods
      .configureEarnManager(new BN(feeBPS), proof)
      .accounts({
        signer: this.manager,
        globalAccount: GLOBAL_ACCOUNT,
        earnManagerAccount,
        feeTokenAccount,
      })
      .instruction();
  }

  async buildAddEarnerInstruction(user: PublicKey, userTokenAccount?: PublicKey): Promise<TransactionInstruction> {
    if (!this.evmRPC) {
      throw new Error('evmRPC is required to configure earn manager');
    }

    // get all registrar earners for proof
    const evmCaller = new EvmCaller(this.evmRPC);
    const earners = await evmCaller.getEarners();
    const tree = new MerkleTree(earners);
    const { proofs, neighbors } = tree.getExclusionProof(user);

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
      .addEarner(user, proofs, neighbors)
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
    const accounts = await getProgram(this.connection).account.earner.all([
      { memcmp: { offset: 91, bytes: this.manager.toBase58() } },
    ]);
    return accounts.map((a) => new Earner(this.connection, a.publicKey, a.account));
  }
}
