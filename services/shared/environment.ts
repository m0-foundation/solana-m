import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PublicClient, TransactionBuilder, Graph } from '../../sdk/src';
import BN from 'bn.js';

interface ParsedOptions {
  signer: Keypair;
  connection: Connection;
  builder: TransactionBuilder;
  evmClient: PublicClient;
  merkleTreeAddress: `0x${string}`;
  graphClient: Graph;
  dryRun: boolean;
  skipCycle: boolean;
  squadsPda?: PublicKey;
  squadsVault?: PublicKey;
  claimThreshold: BN;
  programID: PublicKey;
  mint: 'M' | 'wM';
}
