import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Earn } from './earn';
import { PROGRAM_ID } from '..';
import { Connection, Keypair } from '@solana/web3.js';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
const EARN_IDL = require('./earn.json');

export function getProgram(connection: Connection): Program<Earn> {
  const dummyKeypair = Keypair.generate();
  const provider = new AnchorProvider(connection, new NodeWallet(dummyKeypair), { commitment: connection.commitment });
  return new Program<Earn>(EARN_IDL, PROGRAM_ID, provider);
}
