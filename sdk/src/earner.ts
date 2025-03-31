import { Connection, PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from '.';
import { Claim, Graph } from './graph';
import { EarnerData } from './accounts';
import { getProgram } from './idl';

export class Earner {
  private connection: Connection;
  private graph: Graph;

  pubkey: PublicKey;
  data: EarnerData;

  constructor(connection: Connection, pubkey: PublicKey, data: EarnerData) {
    this.connection = connection;
    this.graph = new Graph();
    this.pubkey = pubkey;
    this.data = data;
  }

  static async fromTokenAccount(connection: Connection, tokenAccount: PublicKey): Promise<Earner> {
    const [earnerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), tokenAccount.toBytes()],
      PROGRAM_ID,
    );

    const data = await getProgram(connection).account.earner.fetch(earnerAccount);

    return new Earner(connection, earnerAccount, data);
  }

  static async fromUserAddress(connection: Connection, user: PublicKey): Promise<Earner[]> {
    const accounts = await getProgram(connection).account.earner.all([
      { memcmp: { offset: 8, bytes: user.toBase58() } },
    ]);
    return accounts.map((a) => new Earner(connection, a.publicKey, a.account));
  }

  async getHistoricalClaims(): Promise<Claim[]> {
    return await this.graph.getHistoricalClaims(this.data.userTokenAccount);
  }
}
