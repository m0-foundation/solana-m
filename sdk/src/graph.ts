import { PublicKey } from '@solana/web3.js';
import { gql, request } from 'graphql-request'

type TokenAccount = {
  pubkey: PublicKey
  balance: bigint
  last_claim_ts: bigint
}

export class Graph {
  private url = 'https://api.studio.thegraph.com/query/106645/m-token-transactions/version/latest';

  async getTokenAccounts(limit = 100, skip = 0): Promise<TokenAccount[]> {
    const query = gql`
      query getTokenAccounts($limit: Int!, $skip: Int!) {
        tokenAccounts(
          first: $limit
          orderBy: balance
          orderDirection: desc
          skip: $skip
        ) {
          pubkey
          balance
          claims(orderBy: ts, first: 1, orderDirection: desc) {
              ts
          } 
        }
      }
    `

    interface Data {
      tokenAccounts: {
        pubkey: string
        balance: string
        claims: { ts: string }[]
      }[]
    }

    const data = await request<Data>(this.url, query, { limit, skip })
    return data.tokenAccounts.map(({ pubkey, balance, claims }) => ({
      pubkey: new PublicKey(Buffer.from(pubkey.slice(2), 'hex')),
      balance: BigInt(balance),
      last_claim_ts: BigInt(claims?.[0]?.ts ?? 0)
    }))
  }

  async getTimeWeightedBalance(tokenAccount: PublicKey, lowerTS: bigint): Promise<bigint> {
    const query = gql`
      query getBalanceUpdates($tokenAccountId: Bytes!, $lowerTS: BigInt!, $upperTS: BigInt!){
        tokenAccount(id: $tokenAccountId) {
          balance
          transfers(where: {ts_gte: $lowerTS, ts_lt: $upperTS}, orderBy: ts, orderDirection: desc) {
            amount
            ts
          }
        }
      }
    `;

    interface Data {
      tokenAccount: {
        balance: string
        transfers: { ts: string, amount: string }[]
      }
    }

    // set upper limit to current time
    const upperTS = BigInt(Math.floor(Date.now() / 1000));

    // fetch data from the subgraph
    const tokenAccountId = "0x" + tokenAccount.toBuffer().toString('hex');
    const data = await request<Data>(this.url, query, { tokenAccountId, lowerTS: lowerTS.toString(), upperTS: upperTS.toString() });

    return Graph.calculateTimeWeightedBalance(
      BigInt(data.tokenAccount.balance),
      upperTS, lowerTS,
      data.tokenAccount.transfers,
    );
  }

  private static calculateTimeWeightedBalance(balance: bigint, upperTS: bigint, lowerTS: bigint, transfers: { ts: string, amount: string }[]): bigint {
    let weightedBalance = BigInt(0);
    let prevTS = upperTS;

    // use transfers to calculate the weighted balance
    for (const transfer of transfers) {
      weightedBalance += BigInt(balance) * (prevTS - BigInt(transfer.ts));
      balance -= BigInt(transfer.amount);
      prevTS = BigInt(transfer.ts);
    }

    // calculate up to sinceTS
    weightedBalance += BigInt(balance) * (prevTS - lowerTS);

    // return the time-weighted balance
    return weightedBalance / (upperTS - lowerTS);
  }
}