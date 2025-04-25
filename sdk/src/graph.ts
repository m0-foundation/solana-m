import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { gql, GraphQLClient } from 'graphql-request';
import { MAINNET_GRAPH_ID } from '.';

type TokenAccount = {
  pubkey: PublicKey;
  balance: bigint;
  last_claim_ts: bigint;
};

export type Claim = {
  amount: bigint;
  ts: bigint;
  index: bigint;
  signature: Buffer;
  recipient_token_account: PublicKey;
};

export class Graph {
  private client: GraphQLClient;
  private baseURL = 'https://gateway.thegraph.com';

  constructor(apiKey: string, graphId = MAINNET_GRAPH_ID) {
    this.client = new GraphQLClient(`${this.baseURL}/api/subgraphs/id/${graphId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  }

  async getTokenAccounts(limit = 100, skip = 0): Promise<TokenAccount[]> {
    const query = gql`
      query getTokenAccounts($limit: Int!, $skip: Int!) {
        tokenAccounts(first: $limit, orderBy: balance, orderDirection: desc, skip: $skip) {
          pubkey
          balance
          claims(orderBy: ts, first: 1, orderDirection: desc) {
            ts
            index
          }
        }
      }
    `;

    interface Data {
      tokenAccounts: {
        pubkey: string;
        balance: string;
        claims: { ts: string; index: string }[];
      }[];
    }

    const data = await this.client.request<Data>(query, { limit, skip });
    return data.tokenAccounts.map(({ pubkey, balance, claims }) => ({
      pubkey: new PublicKey(Buffer.from(pubkey.slice(2), 'hex')),
      balance: BigInt(balance),
      last_claim_ts: BigInt(claims?.[0]?.ts ?? 0),
      last_claim_index: BigInt(claims?.[0]?.index ?? 0),
    }));
  }

  async getHistoricalClaims(tokenAccount: PublicKey): Promise<Claim[]> {
    const query = gql`
      query getClaimsForTokenAccount($tokenAccountId: Bytes!) {
        claims(where: { token_account: $tokenAccountId }, orderBy: ts, orderDirection: desc) {
          amount
          ts
          index
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
        index: string;
        signature: string;
        recipient_token_account: { pubkey: string };
      }[];
    }

    const tokenAccountId = '0x' + tokenAccount.toBuffer().toString('hex');
    const data = await this.client.request<Data>(query, { tokenAccountId });

    return (data.claims ?? []).map((claim) => ({
      amount: BigInt(claim.amount),
      ts: BigInt(claim.ts),
      index: BigInt(claim.index),
      signature: Buffer.from(claim.signature.slice(2), 'hex'),
      recipient_token_account: new PublicKey(Buffer.from(claim.recipient_token_account.pubkey.slice(2), 'hex')),
    }));
  }

  async getTimeWeightedBalance(tokenAccount: PublicKey, lowerTS: BN, upperTS: BN): Promise<BN> {
    if (lowerTS.gt(upperTS)) {
      throw new Error(`Invalid time range: ${lowerTS} - ${upperTS}`);
    }

    const query = gql`
      query getBalanceUpdates($tokenAccountId: Bytes!, $lowerTS: BigInt!) {
        tokenAccount(id: $tokenAccountId) {
          balance
          transfers(where: { ts_gte: $lowerTS }, orderBy: ts, orderDirection: desc) {
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
    const data = await this.client.request<Data>(query, {
      tokenAccountId,
      lowerTS: lowerTS.toString(),
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
    currentBalance: BN,
    lowerTS: BN,
    upperTS: BN,
    transfers: { ts: string; amount: string }[],
  ): BN {
    // determine balance at end of range
    // assume the transfers are in descending order of timestamp (newest first)
    // and that there are no transfers before lowerTS
    // track the previous transfers timestamp to ensure correct ordering
    let endBalance = currentBalance;
    let count = 0;
    let prevTS = new BN(Date.now() / 1000);
    for (const transfer of transfers) {
      const transferTS = new BN(transfer.ts);
      if (transferTS.gt(prevTS)) {
        throw new Error(`Invalid transfer order: ${transfer.ts}`);
      }
      if (upperTS.gt(transferTS)) {
        break;
      }
      endBalance = endBalance.sub(new BN(transfer.amount));
      prevTS = transferTS;
      count++;
    }
    const rangeTransfers = transfers.slice(count);

    // no transfers in range
    if (upperTS.eq(lowerTS) || rangeTransfers.length === 0) {
      return endBalance;
    }

    let weightedBalance = new BN(0);
    let balance = endBalance;
    prevTS = upperTS;

    // use transfers to calculate the weighted balance from the end balance
    for (const transfer of rangeTransfers) {
      const transferTS = new BN(transfer.ts);

      if (transferTS.gt(prevTS)) {
        throw new Error(`Invalid transfer order: ${transfer.ts}`);
      }
      if (upperTS.lt(transferTS)) {
        continue;
      }
      if (lowerTS.gt(transferTS)) {
        break;
      }

      weightedBalance = weightedBalance.add(balance.mul(prevTS.sub(transferTS)));
      balance = balance.sub(new BN(transfer.amount));
      prevTS = transferTS;
    }

    // calculate up to sinceTS
    weightedBalance = weightedBalance.add(balance.mul(prevTS.sub(lowerTS)));

    // return the time-weighted balance
    return weightedBalance.div(upperTS.sub(lowerTS));
  }

  async getIndexUpdates(lowerIndex: BN, upperIndex: BN): Promise<{ index: BN; ts: BN }[]> {
    if (lowerIndex.gt(upperIndex)) {
      throw new Error(`Invalid index range: ${lowerIndex} - ${upperIndex}`);
    }

    const query = gql`
      query getIndexUpdates($lowerIndex: BigInt!, $upperIndex: BigInt!) {
        indexUpdates(where: { index_gte: $lowerIndex, index_lte: $upperIndex }, orderBy: ts, orderDirection: asc) {
          index
          ts
        }
      }
    `;

    interface Data {
      indexUpdates: { index: string; ts: string }[];
    }
    const data = await this.client.request<Data>(query, {
      lowerIndex: lowerIndex.toString(),
      upperIndex: upperIndex.toString(),
    });

    if (!data.indexUpdates) {
      throw new Error(`No updates found`);
    }

    return data.indexUpdates.map((update) => ({
      index: new BN(update.index),
      ts: new BN(update.ts),
    }));
  }

  async getLatestIndex(): Promise<{ index: BN; ts: BN }> {
    const query = gql`
      query getLatestIndex {
        indexUpdates(orderBy: ts, orderDirection: desc, first: 1) {
          index
          ts
        }
      }
    `;

    interface Data {
      indexUpdates: { index: string; ts: string }[];
    }

    const data = await this.client.request<Data>(query);

    return {
      index: new BN(data.indexUpdates[0].index),
      ts: new BN(data.indexUpdates[0].ts),
    };
  }
}
