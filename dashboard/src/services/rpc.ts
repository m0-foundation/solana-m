import { Connection, PublicKey } from '@solana/web3.js';
import { Mint, TOKEN_2022_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import { M_MINT, wM_MINT } from './consts';

export const MINT_ADDRESSES: Record<string, PublicKey> = {
  M: M_MINT,
  wM: wM_MINT,
};

export const getMintsRPC = async (rpcURL: string): Promise<Record<string, Mint>> => {
  const data: Record<string, Mint> = {};

  try {
    const connection = new Connection(rpcURL);
    const accountInfos = await connection.getMultipleAccountsInfo(Object.values(MINT_ADDRESSES));

    for (const [index, accountInfo] of accountInfos.entries()) {
      const mint = unpackMint(Object.values(MINT_ADDRESSES)[index], accountInfo, TOKEN_2022_PROGRAM_ID);
      data[Object.keys(MINT_ADDRESSES)[index]] = mint;
    }
  } catch (error) {
    console.error('Failed to get mints:', error);
    return {};
  }

  return data;
};
