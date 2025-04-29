import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { PublicClient } from 'viem';

import { EvmCaller } from './evm_caller';
import { Earner } from './earner';
import { ETH_M_ADDRESS, ETH_MERKLE_TREE_BUILDER, GLOBAL_ACCOUNT, PROGRAM_ID } from '.';
import { MerkleTree } from './merkle';
import * as spl from '@solana/spl-token';
import { Program } from '@coral-xyz/anchor';
import { getProgram } from './idl';
import { Earn } from './idl/earn';
import { MockLogger, Logger } from './logger';
import { Graph } from './graph';

export class Registrar {
  private logger: Logger;
  private connection: Connection;
  private evmClient: PublicClient;
  private graphClient: Graph;
  private program: Program<Earn>;
  private _mint: PublicKey | undefined;

  constructor(connection: Connection, evmClient: PublicClient, graphClient: Graph, logger: Logger = new MockLogger()) {
    this.connection = connection;
    this.logger = logger;
    this.evmClient = evmClient;
    this.graphClient = graphClient;
    this.program = getProgram(connection);
  }

  async getMint(): Promise<PublicKey> {
    if (this._mint) {
      return this._mint;
    }
    this._mint = (await this.program.account.global.fetch(GLOBAL_ACCOUNT)).mint;
    return this._mint;
  }

  async buildMissingEarnersInstructions(
    signer: PublicKey,
    merkleTreeAddress = ETH_MERKLE_TREE_BUILDER,
  ): Promise<TransactionInstruction[]> {
    // get all earners that should be registered
    const evmCaller = new EvmCaller(this.evmClient, ETH_M_ADDRESS, merkleTreeAddress);
    const earners = await evmCaller.getEarners();

    const ixs: TransactionInstruction[] = [];
    for (const user of earners) {
      const existingEarners = await Earner.fromUserAddress(
        this.connection,
        this.evmClient,
        this.graphClient,
        user,
        PROGRAM_ID,
      );
      if (existingEarners.length > 0) {
        continue;
      }

      this.logger.info('adding earner', { user: user.toBase58() });

      // derive token account for user
      const userTokenAccount = spl.getAssociatedTokenAddressSync(
        await this.getMint(),
        user,
        true,
        spl.TOKEN_2022_PROGRAM_ID,
      );

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
          .accountsPartial({
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

  async buildRemovedEarnersInstructions(
    signer: PublicKey,
    merkleTreeAddress = ETH_MERKLE_TREE_BUILDER,
  ): Promise<TransactionInstruction[]> {
    // get all earners on registrar
    const evmCaller = new EvmCaller(this.evmClient, ETH_M_ADDRESS, merkleTreeAddress);
    const earners = await evmCaller.getEarners();

    // get all eaners on the earn program
    const programEarners = await this.getRegistrarEarners();

    const ixs: TransactionInstruction[] = [];
    for (const earner of programEarners) {
      if (earners.find((e) => e.equals(earner.data.user))) {
        continue;
      }

      this.logger.info('removing earner', {
        user: earner.data.user.toBase58(),
        pubkey: earner.pubkey.toBase58(),
      });

      // build proof
      const tree = new MerkleTree(earners);
      const { proofs, neighbors } = tree.getExclusionProof(earner.data.user);

      ixs.push(
        await this.program.methods
          .removeRegistrarEarner(proofs, neighbors)
          .accountsPartial({
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
    const accounts = await getProgram(this.connection).account.earner.all();
    return accounts.map((a) => new Earner(this.connection, this.evmClient, this.graphClient, a.publicKey, a.account));
  }
}
