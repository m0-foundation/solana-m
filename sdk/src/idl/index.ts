import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Earn } from './earn';
import { PROGRAM_ID } from '..';
import { Connection, Keypair } from '@solana/web3.js';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { ExtEarn } from './ext_earn';
const EARN_IDL = require('./earn.json');
const EXT_EARN_IDL = require('./ext_earn.json');

export function getProgram(connection: Connection): Program<Earn> {
  const dummyKeypair = Keypair.generate();
  const provider = new AnchorProvider(connection, new NodeWallet(dummyKeypair), { commitment: connection.commitment });
  return new Program<Earn>(EARN_IDL, PROGRAM_ID, provider);
}

export function getExtProgram(connection: Connection): Program<ExtEarn> {
  const dummyKeypair = Keypair.generate();
  const provider = new AnchorProvider(connection, new NodeWallet(dummyKeypair), { commitment: connection.commitment });
  return new Program<ExtEarn>(EXT_EARN_IDL, PROGRAM_ID, provider);
}
