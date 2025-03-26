import { Connection, GetProgramAccountsFilter, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { EvmCaller } from './evm_caller';
import { Earner } from './earner';
import { GLOBAL_ACCOUNT, MINT, PROGRAM_ID } from '.';
import { MerkleTree } from './merkle';
import { b58, deriveDiscriminator } from './utils';
import * as spl from '@solana/spl-token';
import { Program } from '@coral-xyz/anchor';
import { getProgram } from './idl';
import { Earn } from './idl/earn';

export class Registrar {
  private connection: Connection;
  private program: Program<Earn>;
  evmRPC: string;

  constructor(connection: Connection, evmRPC: string) {
    this.connection = connection;
    this.program = getProgram(connection);
    this.evmRPC = evmRPC;
  }

  async buildMissingEarnersInstructions(signer: PublicKey): Promise<TransactionInstruction[]> {
    // get all earners that should be registered
    const evmCaller = new EvmCaller(this.evmRPC);
    const earners = await evmCaller.getEarners();

    const ixs: TransactionInstruction[] = [];
    for (const user of earners) {
      const eaners = await Earner.fromUserAddress(this.connection, user);
      if (eaners.length > 0) {
        continue;
      }

      // derive token account for user
      const userTokenAccount = spl.getAssociatedTokenAddressSync(MINT, user, true, spl.TOKEN_2022_PROGRAM_ID);

      // build proof
      const tree = new MerkleTree(earners);
      const { proof } = tree.getInclusionProof(user);

      // PDAs
      const [earnerAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('earner'), userTokenAccount.toBytes()],
        PROGRAM_ID,
      );

      ixs.push(
        await this.program.methods
          .addRegistrarEarner(user, proof)
          .accounts({
            signer: signer,
            globalAccount: GLOBAL_ACCOUNT,
            userTokenAccount,
            earnerAccount,
          })
          .instruction(),
      );
    }

    return ixs;
  }

  async buildRemovedEarnersInstructions(signer: PublicKey): Promise<TransactionInstruction[]> {
    // get all earners on registrar
    const evmCaller = new EvmCaller(this.evmRPC);
    const earners = await evmCaller.getEarners();

    // get all eaners on the earn program
    const programEarners = await this.getRegistrarEarners();

    const ixs: TransactionInstruction[] = [];
    for (const earner of programEarners) {
      if (earners.includes(earner.user)) {
        continue;
      }

      // build proof
      const tree = new MerkleTree(earners);
      const { proofs, neighbors } = tree.getExclusionProof(earner.user);

      ixs.push(
        await this.program.methods
          .removeRegistrarEarner(proofs, neighbors)
          .accounts({
            signer: signer,
            globalAccount: GLOBAL_ACCOUNT,
            earnerAccount: earner.pubkey,
          })
          .instruction(),
      );
    }

    return ixs;
  }

  async getRegistrarEarners(): Promise<Earner[]> {
    const filters: GetProgramAccountsFilter[] = [
      { memcmp: { offset: 0, bytes: b58(deriveDiscriminator('Earner')) } },
      { memcmp: { offset: 8, bytes: '2' } }, // no manager set
    ];

    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, { filters });
    return accounts.map(({ account, pubkey }) => Earner.fromAccountData(this.connection, pubkey, account.data));
  }
}
