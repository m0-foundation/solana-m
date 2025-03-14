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

  async getWeightedBalance(tokenAccount: PublicKey, sinceTS: bigint): Promise<bigint> {
    const query = gql`
      query getBalanceUpdates($tokenAccountId: Bytes!, $sinceTS: BigInt!){
        tokenAccount(id: $tokenAccountId) {
          balance
          transfers(where: {ts_gt: $sinceTS}, orderBy: ts, orderDirection: desc) {
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

    const tokenAccountId = "0x" + tokenAccount.toBuffer().toString('hex');
    const data = await request<Data>(this.url, query, { tokenAccountId, sinceTS: sinceTS.toString() });

    return 0n
  }
}