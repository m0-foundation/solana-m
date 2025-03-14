import { PublicKey } from '@solana/web3.js';
import { gql, request } from 'graphql-request'

type TokenAccount = {
    pubkey: PublicKey
    last_claim_ts: bigint
}

export class Graph {
    private url = 'https://api.studio.thegraph.com/query/106645/m-token-transactions/version/latest';

    async getTokenAccounts(limit = 100, skip = 0): Promise<TokenAccount[]> {
        const query = gql`{
            tokenAccounts(
                first: $limit
                orderBy: balance
                orderDirection: desc
                skip: $skip
            ) {
                pubkey
                claims(orderBy: ts, first: 1, orderDirection: desc) {
                    ts
                }
            }
        }`

        interface Data {
            tokenAccounts: {
                pubkey: string
                claims: { ts: string }[]
            }[]
        }

        const data = await request<Data>(this.url, query, { limit, skip })
        return data.tokenAccounts.map(({ pubkey, claims }) => ({
            pubkey: new PublicKey(Buffer.from(pubkey.slice(2), 'hex')),
            last_claim_ts: BigInt(claims?.[0]?.ts ?? 0)
        }))
    }
}