import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Earn } from './earn';
import { EXT_PROGRAM_ID, PROGRAM_ID } from '..';
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { ExtEarn } from './ext_earn';
const EARN_IDL = require('./earn.json');
const EXT_EARN_IDL = require('./ext_earn.json');

export function getProgram(connection: Connection): Program<Earn> {
  const dummyKeypair = Keypair.generate();
  const provider = new AnchorProvider(connection, new DummyWallet(), { commitment: connection.commitment });
  return new Program<Earn>(EARN_IDL, provider);
}

export function getExtProgram(connection: Connection): Program<ExtEarn> {
  const dummyKeypair = Keypair.generate();
  const provider = new AnchorProvider(connection, new DummyWallet(), { commitment: connection.commitment });
  return new Program<ExtEarn>(EXT_EARN_IDL, provider);
}

class DummyWallet implements Wallet {
  payer: Keypair;

  constructor() {
    this.payer = Keypair.generate();
  }

  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    throw new Error('Dummy wallet');
  }
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    throw new Error('Dummy wallet');
  }
  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }
}
