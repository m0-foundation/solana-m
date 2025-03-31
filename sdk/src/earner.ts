import { Connection, PublicKey } from '@solana/web3.js';
import { EXT_PROGRAM_ID, PROGRAM_ID } from '.';
import { Claim, Graph } from './graph';
import { EarnerData } from './accounts';
import { getExtProgram, getProgram } from './idl';

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

  static async fromTokenAccount(
    connection: Connection,
    tokenAccount: PublicKey,
    program = EXT_PROGRAM_ID,
  ): Promise<Earner> {
    const [earnerAccount] = PublicKey.findProgramAddressSync([Buffer.from('earner'), tokenAccount.toBytes()], program);

    if (program === EXT_PROGRAM_ID) {
      const data = await getExtProgram(connection).account.earner.fetch(earnerAccount);
      return new Earner(connection, earnerAccount, data);
    } else {
      const data = await getProgram(connection).account.earner.fetch(earnerAccount);
      return new Earner(connection, earnerAccount, { ...data, earnManager: null, recipientTokenAccount: null });
    }
  }

  static async fromUserAddress(connection: Connection, user: PublicKey, program = EXT_PROGRAM_ID): Promise<Earner[]> {
    const filter = [{ memcmp: { offset: 25, bytes: user.toBase58() } }];

    if (program === EXT_PROGRAM_ID) {
      const accounts = await getExtProgram(connection).account.earner.all(filter);
      return accounts.map((a) => new Earner(connection, a.publicKey, a.account));
    } else {
      const accounts = await getProgram(connection).account.earner.all(filter);
      return accounts.map(
        (a) => new Earner(connection, a.publicKey, { ...a.account, earnManager: null, recipientTokenAccount: null }),
      );
    }
  }

  async getHistoricalClaims(): Promise<Claim[]> {
    return await this.graph.getHistoricalClaims(this.data.userTokenAccount);
  }
}
