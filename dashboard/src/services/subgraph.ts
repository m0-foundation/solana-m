import { gql, request } from 'graphql-request';
import { PublicKey } from '@solana/web3.js';

export const tokenHolders = async (
  url: string,
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

  const data = await request<Data>(url, query, { limit, skip });

  return data.tokenHolders.map(({ user, balance }) => ({
    user: new PublicKey(Buffer.from(user.slice(2), 'hex')),
    balance: parseFloat(balance) / 1e6,
  }));
};
