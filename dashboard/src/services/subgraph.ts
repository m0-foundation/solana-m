import { gql, request } from 'graphql-request';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';

export const tokenHolders = async (
  graphqlUrl: string,
  limit = 100,
  skip = 0,
): Promise<{ user: PublicKey; balance: number }[]> => {
  const query = gql`
    query getTokenAccounts($limit: Int!, $skip: Int!) {
      tokenHolders(first: $limit, skip: $skip, orderBy: balance, orderDirection: desc) {
        balance
        user
      }
    }
  `;

  interface Data {
    tokenHolders: {
      user: string;
      balance: string;
    }[];
  }

  const data = await request<Data>(graphqlUrl, query, { limit, skip });

  return data.tokenHolders.map(({ user, balance }) => ({
    user: new PublicKey(Buffer.from(user.slice(2), 'hex')),
    balance: parseFloat(balance) / 1e6,
  }));
};

export const claimStats = async (
  graphqlUrl: string,
  programID: PublicKey,
): Promise<{ numClaims: number; totalClaimed: Decimal }> => {
  const query = gql`
    query getClaimStats($id: Bytes!) {
      claimStats(id: $id) {
        id
        num_claims
        program_id
        total_claimed
      }
    }
  `;

  interface Data {
    claimStats: {
      num_claims: number;
      total_claimed: string;
    };
  }

  const id = '0x' + Buffer.concat([Buffer.from('claim-stats'), programID.toBuffer()]).toString('hex');
  const data = await request<Data>(graphqlUrl, query, { id });

  return {
    numClaims: data.claimStats.num_claims,
    totalClaimed: new Decimal(data.claimStats.total_claimed).div(1e6),
  };
};
