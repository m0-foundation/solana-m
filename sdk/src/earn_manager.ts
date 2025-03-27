import {
  AccountMeta,
  Connection,
  GetProgramAccountsFilter,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import BN from 'bn.js';
import * as spl from '@solana/spl-token';
import { GLOBAL_ACCOUNT, MINT, PROGRAM_ID } from '.';
import { Earner } from './earner';
import { earnManagerDecoder } from './accounts';
import { b58, deriveDiscriminator } from './utils';
import { MerkleTree } from './merkle';
import { EvmCaller } from './evm_caller';
import { Program } from '@coral-xyz/anchor';
import { getProgram } from './idl';
import { Earn } from './idl/earn';

export class EarnManager {
  private connection: Connection;
  private program: Program<Earn>;
  evmRPC: string | undefined;

  manager: PublicKey;
  pubkey: PublicKey;
  isActive: boolean;
  feeBps: number;
  feeTokenAccount: PublicKey;

  private constructor(connection: Connection, manager: PublicKey, pubkey: PublicKey, data: Buffer, evmRPC?: string) {
    this.connection = connection;
    this.program = getProgram(connection);
    this.evmRPC = evmRPC;
    this.manager = manager;
    this.pubkey = pubkey;

    // decode account data
    const values = earnManagerDecoder.decode(data);
    this.isActive = values.isActive;
    this.feeBps = new BN(values.feeBps.toString()).toNumber();
    this.feeTokenAccount = new PublicKey(values.feeTokenAccount);
  }

  static async fromManagerAddress(connection: Connection, manager: PublicKey, evmRPC?: string): Promise<EarnManager> {
    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn-manager'), manager.toBytes()],
      PROGRAM_ID,
    );

    const account = await connection.getAccountInfo(earnManagerAccount);
    if (!account) throw new Error(`Unable to find EarnManager account at ${earnManagerAccount}`);

    return new EarnManager(connection, manager, earnManagerAccount, account.data, evmRPC);
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
    const filters: GetProgramAccountsFilter[] = [
      { memcmp: { offset: 0, bytes: b58(deriveDiscriminator('Earner')) } },
      { memcmp: { offset: 91, bytes: this.manager.toBase58() } },
    ];

    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, { filters });

    return accounts.map(({ account, pubkey }) => Earner.fromAccountData(this.connection, pubkey, account.data));
  }
}
