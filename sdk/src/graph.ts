import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { gql, request } from 'graphql-request';

type TokenAccount = {
  pubkey: PublicKey;
  balance: bigint;
  last_claim_ts: bigint;
};

export type Claim = {
  amount: bigint;
  ts: bigint;
  signature: Buffer;
  recipient_token_account: PublicKey;
};

export class Graph {
  private url: string;

  constructor(url?: string) {
    this.url = url ?? 'https://api.studio.thegraph.com/query/106645/m-token-transactions/version/latest';
  }

  async getTokenAccounts(limit = 100, skip = 0): Promise<TokenAccount[]> {
    const query = gql`
      query getTokenAccounts($limit: Int!, $skip: Int!) {
        tokenAccounts(first: $limit, orderBy: balance, orderDirection: desc, skip: $skip) {
          pubkey
          balance
          claims(orderBy: ts, first: 1, orderDirection: desc) {
            ts
          }
        }
      }
    `;

    interface Data {
      tokenAccounts: {
        pubkey: string;
        balance: string;
        claims: { ts: string }[];
      }[];
    }

    const data = await request<Data>(this.url, query, { limit, skip });
    return data.tokenAccounts.map(({ pubkey, balance, claims }) => ({
      pubkey: new PublicKey(Buffer.from(pubkey.slice(2), 'hex')),
      balance: BigInt(balance),
      last_claim_ts: BigInt(claims?.[0]?.ts ?? 0),
    }));
  }

  async getHistoricalClaims(tokenAccount: PublicKey): Promise<Claim[]> {
    const query = gql`
      query getClaimsForTokenAccount($tokenAccountId: Bytes!) {
        claims(where: { token_account: $tokenAccountId }, orderBy: ts, orderDirection: desc) {
          amount
          ts
          signature
          recipient_token_account {
            pubkey
          }
        }
      }
    `;

    interface Data {
      claims: {
        amount: string;
        ts: string;
        signature: string;
        recipient_token_account: { pubkey: string };
      }[];
    }

    const tokenAccountId = '0x' + tokenAccount.toBuffer().toString('hex');
    const data = await request<Data>(this.url, query, { tokenAccountId });

    return (data.claims ?? []).map((claim) => ({
      amount: BigInt(claim.amount),
      ts: BigInt(claim.ts),
      signature: Buffer.from(claim.signature.slice(2), 'hex'),
      recipient_token_account: new PublicKey(Buffer.from(claim.recipient_token_account.pubkey.slice(2), 'hex')),
    }));
  }

  async getTimeWeightedBalance(tokenAccount: PublicKey, lowerTS: BN, upperTS: BN): Promise<BN> {
    if (lowerTS.gt(upperTS)) {
      throw new Error(`Invalid time range: ${lowerTS} - ${upperTS}`);
    }

    const query = gql`
      query getBalanceUpdates($tokenAccountId: Bytes!, $lowerTS: BigInt!, $upperTS: BigInt!) {
        tokenAccount(id: $tokenAccountId) {
          balance
          transfers(where: { ts_gte: $lowerTS, ts_lt: $upperTS }, orderBy: ts, orderDirection: desc) {
            amount
            ts
          }
        }
      }
    `;

    interface Data {
      tokenAccount: {
        balance: string;
        transfers: { ts: string; amount: string }[];
      };
    }

    // fetch data from the subgraph
    const tokenAccountId = '0x' + tokenAccount.toBuffer().toString('hex');
    const data = await request<Data>(this.url, query, {
      tokenAccountId,
      lowerTS: lowerTS.toString(),
      upperTS: upperTS.toString(),
    });

    if (!data.tokenAccount) {
      throw new Error(`Token account not found: ${tokenAccount.toBase58()}`);
    }

    return Graph.calculateTimeWeightedBalance(
      new BN(data.tokenAccount.balance),
      lowerTS,
      upperTS,
      data.tokenAccount.transfers,
    );
  }

  private static calculateTimeWeightedBalance(
    balance: BN,
    lowerTS: BN,
    upperTS: BN,
    transfers: { ts: string; amount: string }[],
  ): BN {
    if (upperTS.eq(lowerTS) || transfers.length === 0) {
      return balance;
    }

    let weightedBalance = new BN(0);
    let prevTS = upperTS;

    // use transfers to calculate the weighted balance
    for (const transfer of transfers) {
      if (upperTS.lt(new BN(transfer.ts))) {
        continue;
      }
      if (lowerTS.gt(new BN(transfer.ts))) {
        break;
      }

      weightedBalance = weightedBalance.add(balance.mul(prevTS.sub(new BN(transfer.ts))));
      balance = balance.sub(new BN(transfer.amount));
      prevTS = new BN(transfer.ts);
    }

    // calculate up to sinceTS
    weightedBalance = weightedBalance.add(balance.mul(prevTS.sub(lowerTS)));

    // return the time-weighted balance
    return weightedBalance.div(upperTS.sub(lowerTS));
  }
}
